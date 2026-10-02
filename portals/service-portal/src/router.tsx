import { createBrowserRouter, Navigate } from "react-router-dom";
import { ServiceLayout } from "./layout/ServiceLayout";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { HomePage } from "./pages/HomePage";
import { StandardsPage } from "./pages/StandardsPage";
import { StandardDetailPage } from "./pages/StandardDetailPage";
import { CertificationPage } from "./pages/CertificationPage";
import { CertificationApplyPage } from "./pages/CertificationApplyPage";
import { CertificationTrackPage } from "./pages/CertificationTrackPage";
import { TrainingPage } from "./pages/TrainingPage";
import { TrainingDetailPage } from "./pages/TrainingDetailPage";
import { ExportPage } from "./pages/ExportPage";
import { ApplicabilityPage } from "./pages/ApplicabilityPage";
import { VerifyPage } from "./pages/VerifyPage";
import { ComplaintsPage } from "./pages/ComplaintsPage";
import { AiTechPage } from "./pages/AiTechPage";
import {
  AccountCertificatesPage,
  AccountLayout,
  AccountOrdersPage,
  AccountOverviewPage,
  AccountSettingsPage,
  AccountTeamPage,
  AccountTrainingPage,
} from "./pages/account";
import { LoginPage } from "./pages/LoginPage";
import { OfflinePage } from "./pages/OfflinePage";
import { GoalsPage } from "./goals/GoalsPage";
import { AdHocGuidePage, GoalGuidePage } from "./goals/GoalGuidePage";
import { ToastProvider } from "./ui/Toast";
import { CartToastProvider } from "./ui/CartToast";
import { CheckoutPage, OrderStatusPage } from "./estore";

function Root() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CartToastProvider>
          <ServiceLayout />
        </CartToastProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "standards", element: <StandardsPage /> },
        { path: "standards/:id", element: <StandardDetailPage /> },
        { path: "estore/checkout", element: <CheckoutPage /> },
        { path: "estore/orders/:id", element: <OrderStatusPage /> },
        { path: "certification", element: <CertificationPage /> },
        {
          path: "certification/apply",
          element: (
            <RequireAuth>
              <CertificationApplyPage />
            </RequireAuth>
          ),
        },
        {
          path: "certification/:id",
          element: (
            <RequireAuth>
              <CertificationTrackPage />
            </RequireAuth>
          ),
        },
        { path: "training", element: <TrainingPage /> },
        { path: "training/:id", element: <TrainingDetailPage /> },
        { path: "export", element: <ExportPage /> },
        { path: "applicability", element: <ApplicabilityPage /> },
        { path: "verify", element: <VerifyPage /> },
        { path: "verify/:token", element: <VerifyPage /> },
        { path: "complaints", element: <ComplaintsPage /> },
        { path: "ai-tech", element: <AiTechPage /> },
        { path: "ai-tech/standards", element: <AiTechPage /> },
        { path: "ai-tech/lab", element: <AiTechPage /> },
        { path: "goals", element: <GoalsPage /> },
        { path: "goals/:slug", element: <GoalGuidePage /> },
        { path: "guide", element: <AdHocGuidePage /> },
        { path: "login", element: <LoginPage /> },
        { path: "offline", element: <OfflinePage /> },
        {
          path: "account",
          element: (
            <RequireAuth>
              <AccountLayout />
            </RequireAuth>
          ),
          children: [
            { index: true, element: <AccountOverviewPage /> },
            { path: "orders", element: <AccountOrdersPage /> },
            { path: "certificates", element: <AccountCertificatesPage /> },
            { path: "training", element: <AccountTrainingPage /> },
            { path: "team", element: <AccountTeamPage /> },
            { path: "settings", element: <AccountSettingsPage /> },
          ],
        },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, "") || undefined,
  },
);
