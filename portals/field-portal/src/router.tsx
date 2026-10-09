import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { FieldLayout } from "./layout/FieldLayout";
import { HomeScreen } from "./screens/HomeScreen";
import { MoreScreen } from "./screens/MoreScreen";
import { MeScreen } from "./screens/me/MeScreen";
import { AuditsScreen } from "./screens/audits/AuditsScreen";
import { OutboxScreen, SamplesScreen, TodayScreen, VisitScreen, VisitsScreen } from "./screens/visits/VisitsScreens";

function Root() {
  return (
    <AuthProvider>
      <FieldLayout />
    </AuthProvider>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      children: [
        { index: true, element: <TodayScreen /> },
        { path: "home", element: <HomeScreen /> },
        { path: "visits", element: <VisitsScreen /> },
        { path: "visits/:id", element: <VisitScreen /> },
        { path: "samples", element: <SamplesScreen /> },
        { path: "samples/scan", element: <SamplesScreen /> },
        { path: "outbox", element: <OutboxScreen /> },
        // Legacy certification-audit screen (Core PATCH /certification/audits path); visits replace it.
        { path: "audits", element: <AuditsScreen /> },
        { path: "me", element: <MeScreen /> },
        { path: "more", element: <MoreScreen /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/field" },
);
