"""Allowlisted bench subprocess helpers for System Administration."""

from __future__ import annotations

import asyncio
import logging
import shlex
from collections.abc import Sequence
from pathlib import Path

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Wall-clock budget for ``bench update`` (pull + patch + build).
UPDATE_TIMEOUT_SEC = 35 * 60
DEFAULT_TIMEOUT_SEC = 5 * 60

UPDATE_LOCK_PATH = Path("/tmp/eswasaone-admin-update.lock")


def _bench_bin(settings: Settings) -> str:
    return settings.bench_bin or "bench"


def backups_dir(settings: Settings | None = None) -> Path:
    cfg = settings or get_settings()
    return Path(cfg.bench_path) / "sites" / cfg.frappe_site / "private" / "backups"


def format_cmd(argv: Sequence[str]) -> str:
    return " ".join(shlex.quote(a) for a in argv)


def cmd_list_apps(settings: Settings) -> list[str]:
    return [_bench_bin(settings), "--site", settings.frappe_site, "list-apps"]


def cmd_backup(settings: Settings, *, with_files: bool = True) -> list[str]:
    argv = [_bench_bin(settings), "--site", settings.frappe_site, "backup"]
    if with_files:
        argv.append("--with-files")
    return argv


def cmd_clear_cache(settings: Settings) -> list[str]:
    return [_bench_bin(settings), "--site", settings.frappe_site, "clear-cache"]


def cmd_restart(settings: Settings) -> list[str]:
    return [_bench_bin(settings), "restart"]


def cmd_maintenance(settings: Settings, *, enabled: bool) -> list[str]:
    return [
        _bench_bin(settings),
        "--site",
        settings.frappe_site,
        "set-maintenance-mode",
        "on" if enabled else "off",
    ]


def cmd_update(settings: Settings) -> list[str]:
    # Intentionally no --reset (destructive).
    return [_bench_bin(settings), "update", "--pull", "--patch", "--build"]


def cmd_migrate(settings: Settings) -> list[str]:
    return [_bench_bin(settings), "--site", settings.frappe_site, "migrate"]


def plan_update(
    settings: Settings,
    *,
    backup_before: bool,
    migrate: bool,
    maintenance: bool,
) -> list[list[str]]:
    """Ordered allowlisted argv list for an update run."""
    steps: list[list[str]] = []
    if maintenance:
        steps.append(cmd_maintenance(settings, enabled=True))
    if backup_before:
        steps.append(cmd_backup(settings, with_files=True))
    steps.append(cmd_update(settings))
    if migrate:
        steps.append(cmd_migrate(settings))
    if maintenance:
        steps.append(cmd_maintenance(settings, enabled=False))
    return steps


async def run_allowlisted(
    argv: Sequence[str],
    *,
    settings: Settings | None = None,
    timeout: float = DEFAULT_TIMEOUT_SEC,
) -> tuple[int, list[str]]:
    """Run an allowlisted bench argv with cwd=bench_path. Returns (rc, lines)."""
    cfg = settings or get_settings()
    cwd = cfg.bench_path
    if not Path(cwd).is_dir():
        return 1, [f"bench_path missing: {cwd}"]

    logger.info("admin bench exec: %s (cwd=%s)", format_cmd(argv), cwd)
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError as exc:
        return 1, [f"bench binary not found: {argv[0]} ({exc})"]
    except OSError as exc:
        return 1, [f"failed to start: {exc}"]

    try:
        raw, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        return 1, [f"timeout after {int(timeout)}s: {format_cmd(argv)}"]

    text = (raw or b"").decode("utf-8", errors="replace")
    lines = [ln for ln in text.splitlines() if ln.strip() != ""]
    if not lines:
        lines = [f"(no output) exit={proc.returncode}"]
    return int(proc.returncode or 0), lines


class UpdateFileLock:
    """Non-blocking exclusive lock for admin update runs."""

    def __init__(self, holder: str) -> None:
        self.holder = holder
        self._fd: int | None = None

    def acquire(self) -> bool:
        import fcntl
        import os

        UPDATE_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(UPDATE_LOCK_PATH), os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            return False
        os.ftruncate(fd, 0)
        os.write(fd, self.holder.encode("utf-8"))
        os.fsync(fd)
        self._fd = fd
        return True

    def release(self) -> None:
        import fcntl
        import os

        if self._fd is None:
            return
        try:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
        finally:
            os.close(self._fd)
            self._fd = None

    @staticmethod
    def current_holder() -> str | None:
        try:
            text = UPDATE_LOCK_PATH.read_text(encoding="utf-8").strip()
            return text or None
        except OSError:
            return None
