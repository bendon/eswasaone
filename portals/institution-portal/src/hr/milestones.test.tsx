/** HR additions plan 08: the Overview's Service milestones box (hidden when none are due; says so while A8 is open). */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HrLiveOverview } from "../api/types";
import { MilestonesBox } from "./HrSummaryView";

const base = { milestones: [], milestone_years: [] } as unknown as HrLiveOverview;

describe("Service milestones", () => {
  it("says the years are awaited while ESWASA hasn't set them", () => {
    render(<MilestonesBox live={base} />);
    expect(screen.getByText("Milestone years not set (awaiting ESWASA A8)")).toBeInTheDocument();
  });

  it("hides when years are set and nothing falls due", () => {
    const { container } = render(<MilestonesBox live={{ ...base, milestone_years: [5, 10] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists who reaches a milestone", () => {
    render(<MilestonesBox live={{ ...base, milestone_years: [10], milestones: [{ employee: "E1", name: "Thandi Mamba", years: 10, date: "2026-11-01" }] }} />);
    expect(screen.getByText("Thandi Mamba")).toBeInTheDocument();
    expect(screen.getByText("10 years")).toBeInTheDocument();
  });
});
