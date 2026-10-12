/** Careers (J2, applicant side): list, detail as plain text, apply with CV, receipt. Core stubbed at fetch. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { CareerDetailPage, CareersListPage, plainParagraphs } from "./CareersPages";

const OPENING = {
  id: "HR-OPN-0001",
  job_title: "Certification Officer",
  department: "Certification",
  location: "Matsapha",
  description: "<p>Review certification applications.</p><ul><li>Degree in a science</li></ul><script>alert(1)</script>",
  posted_on: "2026-10-12",
  closes_on: "2026-10-30",
};

type Call = { url: string; method: string; body?: BodyInit | null };
function stub(list: unknown[], applyStatus = 201, applyBody: unknown = { reference: "HR-APP-0001", job_title: "Certification Officer", closes_on: "2026-10-30" }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/apply")) return json(applyBody, applyStatus);
      if (url.includes("/careers/openings/")) return list.length ? json(list[0]) : json({ detail: "closed" }, 404);
      if (url.includes("/careers/openings")) return json({ items: list });
      return json({}, 404);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/careers", element: <CareersListPage /> },
      { path: "/careers/:id", element: <CareerDetailPage /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Careers", () => {
  it("lists open vacancies, and says so honestly when there are none", async () => {
    stub([OPENING]);
    const { unmount } = mount("/careers");
    expect(await screen.findByRole("link", { name: /Certification Officer/ })).toHaveAttribute("href", "/careers/HR-OPN-0001");
    expect(screen.getByText(/Closes 30 October 2026/)).toBeInTheDocument();
    unmount();
    stub([]);
    mount("/careers");
    expect(await screen.findByText("There are no vacancies right now")).toBeInTheDocument();
  });

  it("shows the description as text, never as HTML", () => {
    expect(plainParagraphs(OPENING.description)).toEqual(["Review certification applications.", "Degree in a science", "alert(1)"]);
  });

  it("applies with a CV and shows the reference", async () => {
    const calls = stub([OPENING]);
    mount("/careers/HR-OPN-0001");
    await screen.findByRole("heading", { name: "Certification Officer" });
    expect(document.querySelector("script")).toBeNull();
    const send = screen.getByRole("button", { name: "Send application" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ayanda Mthethwa" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ayanda@example.com" } });
    fireEvent.change(screen.getByLabelText(/^CV/), { target: { files: [new File(["%PDF"], "cv.pdf", { type: "application/pdf" })] } });
    expect(send).toBeDisabled(); // no consent yet
    fireEvent.click(screen.getByLabelText(/I agree to ESWASA keeping/));
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByText("Thank you. Your reference is HR-APP-0001")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toMatch(/\/careers\/openings\/HR-OPN-0001\/apply$/);
    const form = post?.body as FormData;
    expect(form.get("applicant_name")).toBe("Ayanda Mthethwa");
    expect(form.get("consent")).toBe("true");
    expect((form.get("cv") as File).name).toBe("cv.pdf");
  });

  it("shows the server's reason when an application is refused", async () => {
    stub([OPENING], 422, { detail: "We already have an application from this email address for this vacancy." });
    mount("/careers/HR-OPN-0001");
    await screen.findByRole("heading", { name: "Certification Officer" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ayanda Mthethwa" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ayanda@example.com" } });
    fireEvent.change(screen.getByLabelText(/^CV/), { target: { files: [new File(["%PDF"], "cv.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByLabelText(/I agree to ESWASA keeping/));
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
    expect(await screen.findByText(/already have an application/)).toBeInTheDocument();
  });

  it("says a closed vacancy is closed", async () => {
    stub([]);
    mount("/careers/HR-OPN-0009");
    expect(await screen.findByRole("heading", { name: "This vacancy is closed" })).toBeInTheDocument();
  });
});
