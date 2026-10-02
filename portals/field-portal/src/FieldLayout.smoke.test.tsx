import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FieldLayout } from "./layout/FieldLayout";
import { HomeScreen } from "./screens/HomeScreen";

vi.mock("./auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      username: "field.demo",
      full_name: "Demo Field Officer",
      email: "field.demo@eswasa.local",
      roles: ["ESWASA Staff", "Certification Auditor"],
    },
    loading: false,
    refresh: async () => null,
    openAuth: () => undefined,
    signOut: async () => undefined,
  }),
}));

vi.mock("@eswasaone/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eswasaone/shared-ui")>();
  return {
    ...actual,
    IdleLockGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    AuthModal: () => null,
  };
});

describe("Field portal scaffold", () => {
  it("FieldLayout mounts with Home outlet and bottom tabs", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<FieldLayout />}>
            <Route index element={<HomeScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/EswasaOne/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Home for Demo/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /field navigation/i })).toBeInTheDocument();
  });
});
