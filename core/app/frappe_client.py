"""Typed httpx client to Frappe REST/RPC — acts-as-user."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Frappe base roles every user inherits — not enough to identify a real account.
_BASE_ROLES = frozenset({"Guest", "All"})


def _roles_from_user_doc(doc: dict[str, Any]) -> list[str]:
    out: list[str] = []
    raw_roles = doc.get("roles") or []
    for row in raw_roles:
        if isinstance(row, dict) and row.get("role"):
            out.append(str(row["role"]))
        elif isinstance(row, str):
            out.append(row)
    return out


def _meaningful_roles(roles: list[str] | None) -> bool:
    """True when roles include anything beyond Guest/All."""
    return bool(set(roles or []) - _BASE_ROLES)


class FrappeError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class FrappeClient:
    """Acts-as-user Frappe client. Pass session SID or API token per request."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        sid: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
        timeout: float = 15.0,
    ) -> None:
        self.settings = settings or get_settings()
        self.sid = sid
        self.api_key = api_key
        self.api_secret = api_secret
        self.timeout = timeout
        self._reachable: bool | None = None

    @property
    def base_url(self) -> str:
        return self.settings.frappe_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Host": self.settings.frappe_site,
        }
        if self.api_key and self.api_secret:
            headers["Authorization"] = f"token {self.api_key}:{self.api_secret}"
        return headers

    def _cookies(self) -> dict[str, str]:
        if self.sid:
            return {"sid": self.sid}
        return {}

    def with_session(self, sid: str | None) -> FrappeClient:
        return FrappeClient(
            self.settings,
            sid=sid,
            api_key=self.api_key,
            api_secret=self.api_secret,
            timeout=self.timeout,
        )

    def with_token(self, api_key: str, api_secret: str) -> FrappeClient:
        """B3 acting-as-user via Authorization: token key:secret."""
        return FrappeClient(
            self.settings,
            sid=self.sid,
            api_key=api_key,
            api_secret=api_secret,
            timeout=self.timeout,
        )

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/method/ping")
                self._reachable = resp.status_code < 500
        except Exception:
            self._reachable = False
        return bool(self._reachable)

    @property
    def reachable(self) -> bool | None:
        return self._reachable

    async def _resolve_identity(self, identity: str) -> str:
        """Resolve an email or username to a Frappe login name (User.name).

        Frappe's ``/api/method/login`` only accepts ``username`` or ``name``
        (e.g. ``Administrator``), not the ``email`` field. When the caller
        passes an email, we look up the matching User doc via an
        admin-authenticated request and return its ``name`` so login succeeds.
        """
        identity = identity.strip()
        if "@" not in identity:
            return identity  # already a username/name — pass through
        # frappe.client.get_value requires authentication; use admin credentials
        admin = FrappeClient(self.settings)
        try:
            admin_login = await admin.login(
                self.settings.frappe_admin_user,
                self.settings.frappe_admin_password,
            )
        except FrappeError as exc:
            logger.debug("Admin login for identity resolution failed: %s", exc)
            return identity  # fall back to the raw identity
        admin_sid = admin_login.get("sid")
        if not admin_sid:
            return identity
        try:
            acting = admin.with_session(admin_sid)
            result = await acting.method(
                "frappe.client.get_value",
                json={
                    "doctype": "User",
                    "filters": {"email": identity},
                    "fieldname": "name",
                },
            )
            if isinstance(result, dict):
                name = result.get("name")
                if name:
                    return str(name)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Email→username resolution failed for %s: %s", identity, exc)
        return identity  # fall back to the raw identity

    async def login(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate against Frappe; returns sid + user info or raises."""
        # Resolve email → User.name so Frappe accepts the login
        resolved = await self._resolve_identity(username)
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                headers={"Host": self.settings.frappe_site},
            ) as client:
                resp = await client.post(
                    f"{self.base_url}/api/method/login",
                    data={"usr": resolved, "pwd": password},
                )
                self._reachable = True
                if resp.status_code >= 400:
                    raise FrappeError("Invalid credentials", resp.status_code)
                data = resp.json()
                sid = resp.cookies.get("sid")
                if not sid:
                    raise FrappeError("No sid cookie from Frappe login")
                user = await self._fetch_logged_user(client, sid)
                return {"sid": sid, "message": data.get("message"), "user": user}
        except httpx.HTTPError as exc:
            self._reachable = False
            raise FrappeError(f"Frappe unreachable: {exc}") from exc

    async def _fetch_logged_user(
        self, client: httpx.AsyncClient, sid: str
    ) -> dict[str, Any]:
        headers = {"Host": self.settings.frappe_site, "Accept": "application/json"}
        cookies = {"sid": sid}
        resp = await client.get(
            f"{self.base_url}/api/method/frappe.auth.get_logged_user",
            cookies=cookies,
            headers=headers,
        )
        username = resp.json().get("message", "Guest") if resp.status_code < 400 else "Guest"

        roles: list[str] = []
        full_name = username
        email: str | None = None

        # Profile (name/email) from User doc. Roles child table is often
        # stripped for non-managers, so we never rely on it alone.
        try:
            user_resp = await client.post(
                f"{self.base_url}/api/method/frappe.client.get",
                json={"doctype": "User", "name": username},
                cookies=cookies,
                headers={**headers, "Content-Type": "application/json"},
            )
            if user_resp.status_code < 400:
                doc = user_resp.json().get("message") or {}
                if isinstance(doc, dict):
                    full_name = str(doc.get("full_name") or doc.get("first_name") or username)
                    email = doc.get("email")
                    roles = _roles_from_user_doc(doc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("User profile fetch failed for %s: %s", username, exc)

        if not _meaningful_roles(roles) and username and username != "Guest":
            roles = await self._fetch_roles_has_role(client, sid, username) or roles

        if not _meaningful_roles(roles) and username and username != "Guest":
            admin_roles = await self._fetch_roles_as_admin(username)
            if admin_roles:
                roles = admin_roles

        # Desk Administrator always has System Manager even if child table is empty
        if username == "Administrator" and "System Manager" not in roles:
            roles = ["System Manager", "Administrator", *roles]

        return {
            "username": username,
            "full_name": full_name,
            "email": email,
            "roles": roles or ["Guest"],
        }

    async def _fetch_roles_has_role(
        self,
        client: httpx.AsyncClient,
        sid: str,
        username: str,
    ) -> list[str]:
        """Read Has Role rows for the user (works when User.roles is permission-stripped)."""
        headers = {
            "Host": self.settings.frappe_site,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        try:
            resp = await client.post(
                f"{self.base_url}/api/method/frappe.client.get_list",
                json={
                    "doctype": "Has Role",
                    "fields": ["role"],
                    "filters": [["parent", "=", username]],
                    "parent": "User",
                    "limit_page_length": 100,
                },
                cookies={"sid": sid},
                headers=headers,
            )
            if resp.status_code >= 400:
                logger.debug(
                    "Has Role list failed for %s: %s", username, resp.text[:200]
                )
                return []
            rows = resp.json().get("message") or []
            out: list[str] = []
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict) and row.get("role"):
                        out.append(str(row["role"]))
            return out
        except Exception as exc:  # noqa: BLE001
            logger.warning("Has Role fetch failed for %s: %s", username, exc)
            return []

    async def _fetch_roles_as_admin(self, username: str) -> list[str]:
        """Admin-privileged User read — last resort when the session user cannot see roles."""
        admin_user = self.settings.frappe_admin_user
        admin_password = self.settings.frappe_admin_password
        if not admin_user or not admin_password:
            return []
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                headers={"Host": self.settings.frappe_site},
            ) as client:
                resp = await client.post(
                    f"{self.base_url}/api/method/login",
                    data={"usr": admin_user, "pwd": admin_password},
                )
                if resp.status_code >= 400:
                    return []
                sid = resp.cookies.get("sid")
                if not sid:
                    return []
                # Prefer Has Role via admin (always readable)
                roles = await self._fetch_roles_has_role(client, sid, username)
                if roles:
                    return roles
                user_resp = await client.post(
                    f"{self.base_url}/api/method/frappe.client.get",
                    json={"doctype": "User", "name": username},
                    cookies={"sid": sid},
                    headers={
                        "Host": self.settings.frappe_site,
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                if user_resp.status_code < 400:
                    doc = user_resp.json().get("message") or {}
                    if isinstance(doc, dict):
                        return _roles_from_user_doc(doc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Admin role fetch failed for %s: %s", username, exc)
        return []

    async def refresh_user_roles(self, *, sid: str, username: str) -> list[str]:
        """Re-fetch roles for an existing session (heal Guest-only snapshots)."""
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                headers={"Host": self.settings.frappe_site},
            ) as client:
                roles = await self._fetch_roles_has_role(client, sid, username)
                if _meaningful_roles(roles):
                    return roles
                admin_roles = await self._fetch_roles_as_admin(username)
                if admin_roles:
                    return admin_roles
                return roles
        except Exception as exc:  # noqa: BLE001
            logger.warning("refresh_user_roles failed for %s: %s", username, exc)
            return []

    async def get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._request("GET", path, params=params)

    async def post(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._request("POST", path, json=json, data=data)

    async def method(
        self,
        method: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        """Call a Frappe whitelisted method as the session user."""
        path = f"/api/method/{method}"
        if json is not None:
            result = await self.post(path, json=json)
        else:
            result = await self.get(path, params=params)
        return result.get("message", result)

    async def add_user_role(self, user: str, role: str) -> None:
        """Assign a role via User.roles (``add_role`` whitelist removed in modern Frappe)."""
        doc = await self.method(
            "frappe.client.get",
            json={"doctype": "User", "name": user},
        )
        if not isinstance(doc, dict):
            raise FrappeError(f"User {user} not found", status_code=404)
        roles = list(doc.get("roles") or [])
        if any(isinstance(r, dict) and r.get("role") == role for r in roles):
            return
        roles.append({"doctype": "Has Role", "role": role})
        doc["roles"] = roles
        await self.method("frappe.client.save", json={"doc": doc})

    async def remove_user_role(self, user: str, role: str) -> None:
        """Remove a role via User.roles child table."""
        doc = await self.method(
            "frappe.client.get",
            json={"doctype": "User", "name": user},
        )
        if not isinstance(doc, dict):
            raise FrappeError(f"User {user} not found", status_code=404)
        roles = list(doc.get("roles") or [])
        kept = [
            r
            for r in roles
            if not (isinstance(r, dict) and r.get("role") == role)
        ]
        if len(kept) == len(roles):
            raise FrappeError(f"Role {role} not found on {user}", status_code=404)
        doc["roles"] = kept
        await self.method("frappe.client.save", json={"doc": doc})

    async def resource(
        self,
        doctype: str,
        *,
        name: str | None = None,
        filters: list[Any] | None = None,
        fields: list[str] | None = None,
        limit: int | None = None,
        method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> Any:
        """CRUD against /api/resource/{Doctype}."""
        path = f"/api/resource/{doctype}"
        if name:
            path = f"{path}/{name}"
        params: dict[str, Any] = {}
        if filters is not None:
            params["filters"] = filters
        if fields is not None:
            params["fields"] = fields
        if limit is not None:
            params["limit_page_length"] = limit
        if method.upper() == "GET":
            return await self.get(path, params=params or None)
        return await self._request(method.upper(), path, json=body, params=params or None)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    data=data,
                    headers=self._headers(),
                    cookies=self._cookies(),
                )
                self._reachable = True
                if resp.status_code >= 400:
                    detail = resp.text[:500]
                    raise FrappeError(
                        f"Frappe {method} {path} failed: {detail}",
                        resp.status_code,
                    )
                if not resp.content:
                    return {}
                return resp.json()
        except httpx.HTTPError as exc:
            self._reachable = False
            raise FrappeError(f"Frappe unreachable: {exc}") from exc


    async def register_citizen(
        self,
        *,
        email: str,
        full_name: str,
        password: str,
        org: str | None = None,
    ) -> dict[str, Any]:
        """Create a Frappe User with Citizen role; return sid + optional API keys."""
        admin = FrappeClient(self.settings)
        try:
            login = await admin.login(
                self.settings.frappe_admin_user,
                self.settings.frappe_admin_password,
            )
        except FrappeError as exc:
            raise FrappeError(f"Admin login failed for register: {exc}") from exc

        admin_sid = login["sid"]
        acting = admin.with_session(admin_sid)
        body: dict[str, Any] = {
            "doctype": "User",
            "email": email,
            "first_name": full_name.split()[0] if full_name else email,
            "last_name": " ".join(full_name.split()[1:]) if full_name and " " in full_name else "",
            "send_welcome_email": 0,
            "new_password": password,
            "roles": [{"role": "Citizen"}],
        }
        if org:
            body["organization"] = org  # ignored if field absent
        try:
            await acting.post("/api/resource/User", json=body)
        except FrappeError as exc:
            detail = str(exc).lower()
            if "already" in detail or "duplicate" in detail or exc.status_code == 409:
                raise FrappeError(
                    f"Account already exists for {email}",
                    status_code=409,
                ) from exc
            # Exists with different password, or other create failure — still a conflict
            # for public signup (do not silently log in via register).
            logger.warning("User create failed during register: %s", exc)
            raise FrappeError(
                f"Account already exists for {email}",
                status_code=409,
            ) from exc

        # Assign Citizen role explicitly (child table may need separate call)
        try:
            await acting.add_user_role(email, "Citizen")
        except FrappeError:
            pass

        user_login = await self.login(email, password)
        api_key, api_secret = None, None
        try:
            keys = await acting.method(
                "frappe.core.doctype.user.user.generate_keys",
                json={"user": email},
            )
            if isinstance(keys, dict):
                api_key = keys.get("api_key") or keys.get("key")
                api_secret = keys.get("api_secret") or keys.get("secret")
        except FrappeError as exc:
            logger.warning("generate_keys after register failed: %s", exc)

        return {
            "username": user_login["user"]["username"],
            "roles": user_login["user"].get("roles") or ["Citizen"],
            "sid": user_login["sid"],
            "api_key": api_key,
            "api_secret": api_secret,
        }

    async def invite_staff(
        self,
        *,
        email: str,
        full_name: str,
        roles: list[str],
        org: str | None = None,
    ) -> dict[str, Any]:
        """Create staff User with welcome email (set-password link)."""
        admin = FrappeClient(self.settings)
        try:
            login = await admin.login(
                self.settings.frappe_admin_user,
                self.settings.frappe_admin_password,
            )
        except FrappeError as exc:
            raise FrappeError(f"Admin login failed for invite: {exc}") from exc

        admin_sid = login["sid"]
        acting = admin.with_session(admin_sid)
        body: dict[str, Any] = {
            "doctype": "User",
            "email": email,
            "first_name": full_name.split()[0] if full_name else email,
            "last_name": " ".join(full_name.split()[1:]) if full_name and " " in full_name else "",
            "send_welcome_email": 1,
            "roles": [{"role": r} for r in roles],
        }
        if org:
            body["organization"] = org
        try:
            await acting.post("/api/resource/User", json=body)
        except FrappeError as exc:
            detail = str(exc).lower()
            if "already" in detail or "duplicate" in detail or exc.status_code == 409:
                raise FrappeError(
                    f"Account already exists for {email}",
                    status_code=409,
                ) from exc
            raise

        for role in roles:
            try:
                await acting.add_user_role(email, role)
            except FrappeError:
                pass

        return {"email": email, "roles": roles}


def get_frappe_client() -> FrappeClient:
    return FrappeClient()
