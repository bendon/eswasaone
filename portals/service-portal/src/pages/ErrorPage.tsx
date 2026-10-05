import { isRouteErrorResponse, Link, useNavigate, useRouteError } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";

type Props = {
  /** True when the layout itself failed, so there is no header/footer around us. */
  standalone?: boolean;
};

function describe(error: unknown) {
  if (isRouteErrorResponse(error)) {
    const missing = error.status === 404;
    return {
      code: String(error.status),
      title: missing ? "We couldn’t find that page" : "This page didn’t load",
      body: missing
        ? "The link may be out of date, or the page may have moved. Try one of the routes below."
        : "The service returned an error while loading this page. It’s usually temporary, so try again in a moment.",
      detail: `${error.status} ${error.statusText}`.trim(),
      stack: undefined as string | undefined,
    };
  }
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    code: "Error",
    title: "Something went wrong on this page",
    body: "Part of this page ran into a problem and couldn’t be shown. Your account and any saved work are safe, and reloading usually fixes it.",
    detail: `${err.name}: ${err.message}`,
    stack: err.stack,
  };
}

const SHORTCUTS = [
  { to: "/goals", icon: "i-steps", label: "Goals" },
  { to: "/standards", icon: "i-book", label: "Standards" },
  { to: "/certification", icon: "i-award", label: "Certification" },
  { to: "/training", icon: "i-cap", label: "Training" },
] as const;

/** Route-level error boundary — replaces React Router's default developer screen. */
export function ErrorPage({ standalone = false }: Props) {
  const error = useRouteError();
  const navigate = useNavigate();
  const info = describe(error);

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className={standalone ? "errpage errpage--standalone" : "errpage"} role="alert">
      <div className="errpage__card">
        <div className="errpage__top">
          <span className="errpage__ic">
            <Icon name="i-warn" />
          </span>
          <span className="errpage__code">{info.code}</span>
        </div>
        <h1>{info.title}</h1>
        <p className="errpage__lead">{info.body}</p>

        <div className="errpage__actions">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            <Icon name="i-refresh" /> Try again
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
            <Icon name="i-cleft" /> Go back
          </button>
          {standalone ? (
            <a className="btn-ghost" href={import.meta.env.BASE_URL}>
              <Icon name="i-home" /> Home
            </a>
          ) : (
            <Link className="btn-ghost" to="/">
              <Icon name="i-home" /> Home
            </Link>
          )}
        </div>

        {standalone ? null : (
          <nav className="errpage__links" aria-label="Popular pages">
            <span>Or jump to</span>
            {SHORTCUTS.map((s) => (
              <Link key={s.to} to={s.to}>
                <Icon name={s.icon} /> {s.label}
              </Link>
            ))}
          </nav>
        )}

        {import.meta.env.DEV ? (
          <details className="errpage__dev">
            <summary>Technical details (dev only)</summary>
            <p>{info.detail}</p>
            {info.stack ? <pre>{info.stack}</pre> : null}
          </details>
        ) : null}
      </div>
    </div>
  );
}
