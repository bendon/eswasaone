# EswasaOne — Ground Rules for ALL Agents

1. **Contract first.** `contracts/openapi.yaml` is the source of truth for **HTTP contracts**. If you need a new endpoint, add it there *first*, regenerate `types.ts`, then implement. Never invent an endpoint shape locally. Workflows follow the Workflow source of truth below.

2. **Own your folder.** Edit only your assigned top-level folder / app. Touch shared files (`openapi.yaml`, `.env.example`, `apps.txt`, nginx drafts) **only via the Orchestrator (WS0/WS7)**.

3. **Stubs over blocking.** If a dependency isn't ready, code against the contract with a typed mock and mark `// TODO: wire real` (or `# TODO: wire real`). Never wait.

4. **Permissions always.** No endpoint or tool bypasses Frappe permissions. Writes are confirm-before-commit and audit-logged. Agent actions inherit the authenticated user's rights.

5. **Conventions.** Python: ruff + black, pydantic v2, type hints. TS: strict, ESLint, Tailwind tokens from `shared-ui`. Frappe: standard app structure, fixtures for roles/workflows/print formats.

   **CSS (four entries only).** Apps import one of `@eswasaone/shared-ui/styles/{global,service,institution,field}.css` — see `portals/shared-ui/src/styles/README.md`. Shared chrome → global; portal surfaces → that portal’s barrel. Never import CSS partials from pages; never cross-import another portal’s shell.

6. **Definition of done per unit:** it runs, it's typed, it has a smoke test, and it's wired to the contract (real or mocked).

7. **Report back** in a one-line status: `WS<n>: <done> | <blocked-on> | <stub-left>`.

8. **Licence-aware content.** Every ingested `Source` carries a `rights` flag. The assistant may quote open sources (WTO/TBT, EUR-Lex, gazettes) but must **paraphrase-and-cite** licensed standards and route to the e-store — never emit licensed full text in a free answer.

9. **No Docker.** This host runs services natively. Use shared MariaDB, Redis, Qdrant, and system Node/Python. Bind app listeners to `127.0.0.1` on the allocated port block (see `docs/PORTS.md`). Nginx terminates TLS for `eswasaone.aiceafrica.com`.

10. **Mock UIs.** Visual portal ports wait for HTML mocks in `docs/mocks/`. Until then, scaffold shells + tokens + MSW only.

## Workflow source of truth

- `docs/EswasaOne_WORKFLOW_MAP.md` governs workflows; §5 is the automation law.
- Registry YAML (`eswasa_core/registry/workflows/`) wins for states, transitions, roles, SLA, families.
- OpenAPI wins for HTTP contracts. Never PATCH `workflow_state`; always `/act` → `apply_workflow`.
- Guards live in Frappe, not Core. Default SLAs/mandates use the provisional baseline in `docs/EswasaOne_ESWASA_CONFIRMATION_PACK.md` until a later signed pack replaces it.
