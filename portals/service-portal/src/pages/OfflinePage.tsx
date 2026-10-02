import { Link } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";

export function OfflinePage() {
  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Offline" }]} />
      <h1 className="page-h">You&rsquo;re offline</h1>
      <p className="page-lead">
        The app shell is cached. Reconnect to load live catalogue data, or reopen your last guide from
        Home.
      </p>
      <Link className="btn-primary" to="/">
        Go to Home
      </Link>
    </div>
  );
}
