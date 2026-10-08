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
import { CertificationQuotePage } from "./pages/CertificationQuotePage";
import { CertificationStatusPage } from "./pages/CertificationStatusPage";
import { TrainingPage } from "./pages/TrainingPage";
import { TrainingDetailPage } from "./pages/TrainingDetailPage";
import { ExportPage } from "./pages/ExportPage";
import { ApplicabilityPage } from "./pages/ApplicabilityPage";
import { VerifyPage } from "./pages/VerifyPage";
import { ComplaintsPage, ContactSalesPage, FeedbackPage, LodgeCasePage, TrackCasePage } from "./pages/ComplaintsPage";
import { AiTechPage } from "./pages/AiTechPage";
import {
  AccountApplicationsPage,
  AccountCaseDetailPage,
  AccountCasesPage,
  AccountNotificationsPage,
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
import { ErrorPage } from "./pages/ErrorPage";
import { GoalsPage } from "./goals/GoalsPage";
import { AdHocGuidePage, GoalGuidePage } from "./goals/GoalGuidePage";
import { CheckoutPage, OrderStatusPage } from "./estore";
import { AccountCertificateDetailPage, AccountVisitsPage, RenewPage, TransferPage } from "./pages/customer/Certification";
import { AccountInvoicesPage, AccountQuoteDetailPage, AccountQuotesPage, CustomerPrintPage, HelpPage, PublicQuotePage } from "./pages/customer/Commercial";
import { AccountCalibrationDetailPage, AccountCalibrationPage, AccountInstrumentsPage, CalRequestPage, MetrologyServicePage, VerifyCalPage } from "./pages/customer/Metrology";
import { AccountCommentsPage, AccountSubscriptionsPage, CommitteesPage, DraftDetailPage, DraftsPage, JoinTcPage, ProposePage, TcAreaPage, TcBallotPage } from "./pages/customer/Standards";

function Root() {
  return (
    <AuthProvider>
      <ServiceLayout />
    </AuthProvider>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      // Layout itself failed — no header/footer to render inside.
      errorElement: <ErrorPage standalone />,
      children: [
        {
          // Page-level failures render inside the layout so navigation stays usable.
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: <HomePage /> },
            { path: "standards", element: <StandardsPage /> },
            { path: "standards/drafts", element: <DraftsPage /> },
            { path: "standards/drafts/:id", element: <DraftDetailPage /> },
            { path: "standards/propose", element: <ProposePage /> },
            { path: "standards/committees", element: <CommitteesPage /> },
            { path: "standards/committees/:tc/join", element: <JoinTcPage /> },
            { path: "standards/:id", element: <StandardDetailPage /> },
            { path: "tc", element: <RequireAuth><TcAreaPage /></RequireAuth> },
            { path: "tc/ballots/:id", element: <RequireAuth><TcBallotPage /></RequireAuth> },
            { path: "metrology", element: <MetrologyServicePage /> },
            { path: "calibration", element: <Navigate to="/metrology" replace /> },
            { path: "metrology/request", element: <CalRequestPage /> },
            { path: "verify/cal", element: <VerifyCalPage /> },
            { path: "verify/cal/:token", element: <VerifyCalPage /> },
            { path: "quotes/:id", element: <PublicQuotePage /> },
            { path: "help", element: <HelpPage /> },
            { path: "print/:kind/:id", element: <CustomerPrintPage /> },
            { path: "certification/transfer", element: <TransferPage /> },
            { path: "certification/renew/:certId", element: <RequireAuth><RenewPage /></RequireAuth> },
            { path: "estore/checkout", element: <CheckoutPage /> },
            { path: "estore/orders/:id", element: <OrderStatusPage /> },
            { path: "certification", element: <CertificationPage /> },
            // Open to guests: answers autosave; sign-in is asked for at submit.
            { path: "certification/apply", element: <CertificationApplyPage /> },
            { path: "certification/quote", element: <CertificationQuotePage /> },
            { path: "certification/status", element: <CertificationStatusPage /> },
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
            { path: "complaints/new/:type", element: <LodgeCasePage /> },
            { path: "complaints/track", element: <TrackCasePage /> },
            { path: "complaints/track/:ref", element: <TrackCasePage /> },
            { path: "feedback/:ref", element: <FeedbackPage /> },
            { path: "contact-sales", element: <ContactSalesPage /> },
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
                { path: "applications", element: <AccountApplicationsPage /> },
                { path: "orders", element: <AccountOrdersPage /> },
                { path: "certificates", element: <AccountCertificatesPage /> },
                { path: "certificates/:id", element: <AccountCertificateDetailPage /> },
                { path: "quotes", element: <AccountQuotesPage /> },
                { path: "quotes/:id", element: <AccountQuoteDetailPage /> },
                { path: "invoices", element: <AccountInvoicesPage /> },
                { path: "visits", element: <AccountVisitsPage /> },
                { path: "calibration", element: <AccountCalibrationPage /> },
                { path: "calibration/:id", element: <AccountCalibrationDetailPage /> },
                { path: "instruments", element: <AccountInstrumentsPage /> },
                { path: "comments", element: <AccountCommentsPage /> },
                { path: "subscriptions", element: <AccountSubscriptionsPage /> },
                { path: "training", element: <AccountTrainingPage /> },
                { path: "cases", element: <AccountCasesPage /> },
                { path: "cases/:ref", element: <AccountCaseDetailPage /> },
                { path: "notifications", element: <AccountNotificationsPage /> },
                { path: "team", element: <AccountTeamPage /> },
                { path: "settings", element: <AccountSettingsPage /> },
              ],
            },
            { path: "*", element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, "") || undefined,
  },
);
