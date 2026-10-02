import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { FieldLayout } from "./layout/FieldLayout";
import { HomeScreen } from "./screens/HomeScreen";
import { MoreScreen } from "./screens/MoreScreen";
import { MeScreen } from "./screens/me/MeScreen";
import { AuditsScreen } from "./screens/audits/AuditsScreen";

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
        { index: true, element: <HomeScreen /> },
        { path: "audits", element: <AuditsScreen /> },
        { path: "me", element: <MeScreen /> },
        { path: "more", element: <MoreScreen /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/field" },
);
