/** Recruitment part 2 (J2): pipeline, applicant actions by stage, panel feedback. Core stubbed at fetch. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

vi.mock("../../layout/InstitutionLayout", () => ({
  useInstitution: () => ({
    user: { username: "hr@eswasa.co.sz", full_name: "Nokuthula Shongwe", email: "hr@eswasa.co.sz", roles: ["HR Manager"] },
    openAuth: () => undefined,
    refreshUser: () => undefined,
    sessionKey: "hr",
  }),
}));

import { PipelineView } from "./PipelineView";
import { ApplicantView } from "./ApplicantView";
import { MyInterviews } from "../../me/MyInterviews";
import { settingsResponse } from "../../test/hrSettings";

const BASE = { id: "HR-APP-0001", applicant_name: "Ayanda Mthethwa", email: "ayanda@example.com", status: "Open", has_cv: true,
  applied_on: "2026-10-14", source: "Website Listing", opening: { name: "HR-OPN-0001", job_title: "Certification Officer" }, interviews: [], offer: null, stage: "Applied" };
const INTERVIEW = { id: "HR-INT-1", status: "Under Review", scheduled_on: "2026-11-03", from_time: "10:00", to_time: "11:00", interview_type: "Panel",
  panel: ["Sipho Magagula", "Zanele Nkosi"], waiting_for: 1, feedback: [{ interviewer: "Sipho Magagula", result: "Cleared", rating: 4, feedback: "Strong" }] };

type Call = { url: string; method: string; body?: Record<string, unknown> };
function stub(applicant: unknown, postReply: (url: string) => unknown = () => applicant) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const settings = settingsResponse(url);
      if (settings) return settings;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (method === "POST") return json(postReply(url), url.endsWith("/employee") ? 201 : 200);
      if (url.includes("/pipeline")) return json({ opening: { name: "HR-OPN-0001", job_title: "Certification Officer", department: "Certification", closes_on: "2026-10-30" },
        applicants: [{ id: "HR-APP-0001", applicant_name: "Ayanda Mthethwa", status: "Open", applied_on: "2026-10-14", stage: "Applied" },
          { id: "HR-APP-0002", applicant_name: "Nosipho Xaba", status: "Shortlisted", stage: "Interview", interview_status: "Pending" },
          { id: "HR-APP-0003", applicant_name: "Thulani Simelane", status: "Rejected", stage: "Not taken forward" }] });
      if (url.includes("/interview-types")) return json({ items: ["Panel"] });
      if (url.includes("/hr/employee-options")) return json({ genders: ["Female", "Male"] });
      if (url.includes("/hr/employees")) return json({ items: [{ id: "HR-EMP-0031", employee_name: "Sipho Magagula", user_id: "sipho@x", designation: "Certification Manager" }] });
      if (url.includes("/hr/me/interviews")) return json({ items: [{ id: "HR-INT-1", applicant_name: "Ayanda Mthethwa", designation: "Certification Officer", scheduled_on: "2026-11-03", from_time: "10:00", interview_type: "Panel", skills: ["Auditing", "Report writing"] }] });
      if (url.includes("/hr/recruitment/applicants/")) return json(applicant);
      return json({ detail: "offline" }, 503);
    }),
  );
  return calls;
}

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/hr/recruitment/openings/:opening", element: <PipelineView /> },
      { path: "/hr/recruitment/applicants/:id", element: <ApplicantView /> },
      { path: "/me/interviews", element: <MyInterviews /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe("Pipeline (H6b)", () => {
  it("shows candidates by stage and the next one to screen", async () => {
    stub(BASE);
    mount("/hr/recruitment/openings/HR-OPN-0001");
    expect(await screen.findByRole("heading", { name: "Certification Officer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Interview" })).toHaveTextContent("Nosipho Xaba");
    expect(screen.getByText("1 not taken forward.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Ayanda Mthethwa/ })).toHaveAttribute("href", "/hr/recruitment/applicants/HR-APP-0001");
  });
});

describe("Applicant (H6c)", () => {
  it("screens: declining needs a note, shortlisting moves them on", async () => {
    const calls = stub(BASE, () => ({ ...BASE, status: "Shortlisted", stage: "Shortlist" }));
    mount("/hr/recruitment/applicants/HR-APP-0001");
    expect(await screen.findByRole("heading", { name: "Ayanda Mthethwa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open CV" }).getAttribute("href")).toMatch(/\/hr\/recruitment\/applicants\/HR-APP-0001\/cv$/);
    expect(screen.getByRole("button", { name: "Not taken forward" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Shortlist" }));
    expect(await screen.findByRole("heading", { name: "Schedule an interview" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ status: "Shortlisted", note: "", confirm: true });
  });

  it("schedules with a panel", async () => {
    const calls = stub({ ...BASE, status: "Shortlisted", stage: "Shortlist" }, () => ({ ...BASE, status: "Shortlisted", stage: "Interview", interviews: [{ ...INTERVIEW, status: "Pending", feedback: [], waiting_for: 1, panel: ["Sipho Magagula"] }] }));
    mount("/hr/recruitment/applicants/HR-APP-0001");
    await screen.findByRole("heading", { name: "Schedule an interview" });
    fireEvent.change(await screen.findByLabelText("Interview type"), { target: { value: "Panel" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "11:00" } });
    fireEvent.click(await screen.findByLabelText(/Sipho Magagula/));
    fireEvent.click(screen.getByRole("button", { name: "Schedule interview" }));
    expect(await screen.findByText(/Waiting for 1 panel member to record feedback/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ interview_type: "Panel", interviewers: ["sipho@x"], confirm: true });
  });

  it("waits for the whole panel before a result", async () => {
    stub({ ...BASE, status: "Shortlisted", stage: "Interview", interviews: [INTERVIEW] });
    mount("/hr/recruitment/applicants/HR-APP-0001");
    expect(await screen.findByText("Sipho Magagula: Cleared, 4 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cleared" })).toBeDisabled();
  });

  it("shows a prepared offer as waiting for another HR Manager", async () => {
    stub({ ...BASE, status: "Shortlisted", stage: "Offer", interviews: [{ ...INTERVIEW, status: "Cleared", waiting_for: 0 }],
      offer: { name: "HR-OFF-1", status: "Awaiting Response", docstatus: 0, offer_date: "2026-11-05", designation: "Certification Officer", state: "Draft, waiting for approval" } });
    mount("/hr/recruitment/applicants/HR-APP-0001");
    expect(await screen.findByText("Another HR Manager approves the offer")).toBeInTheDocument();
  });

  it("creates the employee once the offer is accepted", async () => {
    const accepted = { ...BASE, status: "Accepted", stage: "Offer", interviews: [{ ...INTERVIEW, status: "Cleared", waiting_for: 0 }],
      offer: { name: "HR-OFF-1", status: "Accepted", docstatus: 1, offer_date: "2026-11-05", designation: "Certification Officer", state: "Accepted" } };
    const calls = stub(accepted, () => ({ employee: "HR-EMP-00087", employee_name: "Ayanda Mthethwa" }));
    mount("/hr/recruitment/applicants/HR-APP-0001");
    await screen.findByRole("heading", { name: "Create the employee" });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-12-01" } });
    fireEvent.change(await screen.findByLabelText(/^Line manager/), { target: { value: "HR-EMP-0031" } });
    fireEvent.change(screen.getByLabelText("Gender"), { target: { value: "Female" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1997-03-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText("Ayanda Mthethwa is now an employee")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: expect.stringMatching(/offers\/HR-OFF-1\/employee$/),
      body: { date_of_joining: "2026-12-01", gender: "Female", date_of_birth: "1997-03-14", reports_to: "HR-EMP-0031", confirm: true },
    });
  });
});

describe("Interviews to score", () => {
  it("rates every skill before recording feedback", async () => {
    const calls = stub(BASE, () => ({ interview: "HR-INT-1", result: "Cleared" }));
    mount("/me/interviews");
    expect(await screen.findByRole("heading", { name: "Ayanda Mthethwa" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Record feedback" });
    fireEvent.click(screen.getByRole("radiogroup", { name: "Auditing" }).querySelectorAll("input")[3]);
    fireEvent.click(screen.getByLabelText("Take them forward"));
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radiogroup", { name: "Report writing" }).querySelectorAll("input")[2]);
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByText("Feedback recorded for 1 interview")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      result: "Cleared", ratings: [{ skill: "Auditing", stars: 4 }, { skill: "Report writing", stars: 3 }], feedback: null, confirm: true,
    });
  });
});
