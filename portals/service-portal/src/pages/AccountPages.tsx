import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";

const ACCOUNT_CRUMBS: Record<string, string> = {
  "/account": "Overview",
  "/account/orders": "Orders",
  "/account/certificates": "Certificates",
  "/account/training": "Training",
};

export function AccountLayout() {
  const { user } = useAuth();
  const loc = useLocation();
  const sub = ACCOUNT_CRUMBS[loc.pathname];
  const crumbs =
    loc.pathname === "/account" || !sub
      ? [
          { label: "Home", to: "/" },
          { label: "My account" },
        ]
      : [
          { label: "Home", to: "/" },
          { label: "My account", to: "/account" },
          { label: sub },
        ];

  return (
    <div className="page">
      <Breadcrumbs items={crumbs} />
      <h1 className="page-h">My account</h1>
      <p className="page-lead">Signed in as {user?.full_name || user?.username}</p>
      <nav className="subnav" aria-label="Account">
        <NavLink to="/account" end>
          Overview
        </NavLink>
        <NavLink to="/account/orders">Orders</NavLink>
        <NavLink to="/account/certificates">Certificates</NavLink>
        <NavLink to="/account/training">Training</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export function AccountOverviewPage() {
  return (
    <div className="prose">
      <p>Track applications, downloads and transcripts here.</p>
      <ul>
        <li>
          <Link to="/certification">Certification applications</Link>
        </li>
        <li>
          <Link to="/account/orders">Standards purchases</Link>
        </li>
        <li>
          <Link to="/account/training">Training transcript</Link>
        </li>
      </ul>
    </div>
  );
}

export function AccountOrdersPage() {
  return (
    <p className="page-note">No orders yet — buy a standard from the catalogue.</p>
  );
}

export function AccountCertificatesPage() {
  return <p className="page-note">No certificates on file. Verify a public mark on /verify.</p>;
}

export function AccountTrainingPage() {
  return (
    <p className="page-note">
      No enrolments yet. Browse <Link to="/training">Training</Link>.
    </p>
  );
}
