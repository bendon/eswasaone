import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { InstitutionLayout } from "./layout/InstitutionLayout";
import { PageSkeleton } from "./components/PageStates";
import { ErrorPage } from "./pages/ErrorPage";

type PageFactory = () => Promise<{ default: ComponentType }>;

// lazy() must run once per page — calling it during render mints a new component
// type each time, so every layout re-render unmounted and remounted the page
// (skeleton flash + all fetches again = the post-login flicker loop).
const lazyPages = new WeakMap<PageFactory, ComponentType>();

function lazyOnce(factory: PageFactory): ComponentType {
  let Comp = lazyPages.get(factory);
  if (!Comp) {
    Comp = lazy(factory);
    lazyPages.set(factory, Comp);
  }
  return Comp;
}

function L({
  factory,
  skeleton = "list",
}: {
  factory: PageFactory;
  skeleton?: "list" | "dashboard" | "panel";
}) {
  const Comp = lazyOnce(factory);
  return (
    <Suspense
      fallback={<PageSkeleton variant={skeleton} label="Loading module…" />}
    >
      <Comp />
    </Suspense>
  );
}

function nest(
  pageFactory: () => Promise<{ default: ComponentType }>,
  children: { index?: true; path?: string; element: ReactNode }[],
) {
  const Page = lazy(pageFactory);
  return {
    element: (
      <Suspense
        fallback={<PageSkeleton variant="list" label="Loading module…" />}
      >
        <Page />
      </Suspense>
    ),
    children,
  };
}

export const router = createBrowserRouter(
  [
    {
      // Board member area (gap 03 G4): own minimal shell, no staff sidebar.
      path: "/member",
      errorElement: <ErrorPage standalone />,
      ...nest(
        () =>
          import("./board/MemberArea").then((m) => ({
            default: m.MemberLayout,
          })),
        [
        {
          index: true,
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberHome,
                }))
              }
            />
          ),
        },
        {
          path: "meetings/:id",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberMeeting,
                }))
              }
            />
          ),
        },
        {
          path: "votes",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberVotes,
                }))
              }
            />
          ),
        },
        {
          path: "minutes",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberMinutes,
                }))
              }
            />
          ),
        },
        {
          path: "declarations",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberDeclarations,
                }))
              }
            />
          ),
        },
        {
          path: "evaluation",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberEvaluation,
                }))
              }
            />
          ),
        },
        {
          path: "profile",
          element: (
            <L
              factory={() =>
                import("./board/MemberArea").then((m) => ({
                  default: m.MemberProfile,
                }))
              }
            />
          ),
        },
        ],
      ),
    },
    {
      // Printable documents (gap 01 C10) — outside the app shell.
      path: "/print/:kind/:id",
      errorElement: <ErrorPage standalone />,
      element: (
        <L
          factory={() =>
            import("./print/PrintPage").then((m) => ({
              default: m.PrintPage,
            }))
          }
          skeleton="panel"
        />
      ),
    },
    {
      path: "/",
      element: <InstitutionLayout />,
      // Layout itself failed — no sidebar/topbar to render inside.
      errorElement: <ErrorPage standalone />,
      children: [
        {
          // Page-level failures render inside the layout so navigation stays usable.
          errorElement: <ErrorPage />,
          children: [
            {
              index: true,
              element: (
                <L
                  factory={() =>
                    import("./pages/InstitutionHomePage").then((m) => ({
                      default: m.InstitutionHomePage,
                    }))
                  }
                  skeleton="dashboard"
                />
              ),
            },
            {
              path: "approvals",
              ...nest(
                () =>
                  import("./pages/ApprovalsPage").then((m) => ({
                    default: m.ApprovalsPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./approvals/sub-views").then((m) => ({
                            default: m.InboxView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "team",
                    element: (
                      <L
                        factory={() =>
                          import("./approvals/sub-views").then((m) => ({
                            default: m.TeamView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "delegations",
                    element: (
                      <L
                        factory={() =>
                          import("./approvals/sub-views").then((m) => ({
                            default: m.DelegationsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "done",
                    element: (
                      <L
                        factory={() =>
                          import("./approvals/sub-views").then((m) => ({
                            default: m.DoneView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "certification",
              ...nest(
                () =>
                  import("./pages/CertificationPage").then((m) => ({
                    default: m.CertificationPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.PipelineView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "audits",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.AuditsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "certificates",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.CertificatesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "quotes",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.QuotesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "findings",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.FindingsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "decisions",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.DecisionsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "register",
                    element: (
                      <L
                        factory={() =>
                          import("./certification/sub-views").then((m) => ({
                            default: m.RegisterView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "standards",
              ...nest(
                () =>
                  import("./pages/StandardsPage").then((m) => ({
                    default: m.StandardsPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./standards/sub-views").then((m) => ({
                            default: m.CatalogueView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "drafts",
                    element: (
                      <L
                        factory={() =>
                          import("./standards/sub-views").then((m) => ({
                            default: m.DraftsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "workitems",
                    element: (
                      <L
                        factory={() =>
                          import("./standards/sub-views").then((m) => ({
                            default: m.WorkItemsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "ballots",
                    element: (
                      <L
                        factory={() =>
                          import("./standards/sub-views").then((m) => ({
                            default: m.BallotsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "comments",
                    element: (
                      <L
                        factory={() =>
                          import("./standards/sub-views").then((m) => ({
                            default: m.CommentsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "metrology",
              ...nest(
                () =>
                  import("./pages/MetrologyPage").then((m) => ({
                    default: m.MetrologyPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./metrology/sub-views").then((m) => ({
                            default: m.JobsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "instruments",
                    element: (
                      <L
                        factory={() =>
                          import("./metrology/sub-views").then((m) => ({
                            default: m.InstrumentsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "results",
                    element: (
                      <L
                        factory={() =>
                          import("./metrology/sub-views").then((m) => ({
                            default: m.ResultsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "tbt",
              ...nest(
                () =>
                  import("./pages/TbtPage").then((m) => ({
                    default: m.TbtPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./tbt/sub-views").then((m) => ({
                            default: m.TbtAlertsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "subscriptions",
                    element: (
                      <L
                        factory={() =>
                          import("./tbt/sub-views").then((m) => ({
                            default: m.TbtSubscriptionsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "finance",
              ...nest(
                () =>
                  import("./pages/FinancePage").then((m) => ({
                    default: m.FinancePage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./finance/sub-views").then((m) => ({
                            default: m.FinanceDashboardView,
                          }))
                        }
                        skeleton="dashboard"
                      />
                    ),
                  },
                  {
                    path: "invoices",
                    element: (
                      <L
                        factory={() =>
                          import("./finance/sub-views").then((m) => ({
                            default: m.InvoicesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "budget",
                    element: (
                      <L
                        factory={() =>
                          import("./finance/sub-views").then((m) => ({
                            default: m.BudgetView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "revenue",
                    element: (
                      <L
                        factory={() =>
                          import("./finance/sub-views").then((m) => ({
                            default: m.RevenueView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "settings",
                    element: (
                      <L
                        factory={() =>
                          import("./finance/sub-views").then((m) => ({
                            default: m.FinanceSettingsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "hr",
              ...nest(
                () =>
                  import("./pages/HrPage").then((m) => ({ default: m.HrPage })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.HrSummaryView,
                          }))
                        }
                        skeleton="dashboard"
                      />
                    ),
                  },
                  {
                    path: "directory",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.EmployeesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "structure",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.StructureView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "time-off",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.LeaveView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "recruitment",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.RecruitmentView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "performance",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.AppraisalsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "payroll",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.PayrollView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "access",
                    element: (
                      <L
                        factory={() =>
                          import("./hr/sub-views").then((m) => ({
                            default: m.AccessRequestsView,
                          }))
                        }
                      />
                    ),
                  },
                  /* Legacy path aliases → mock tab names */
                  {
                    path: "employees",
                    element: <Navigate to="../directory" replace />,
                  },
                  {
                    path: "leave",
                    element: <Navigate to="../time-off" replace />,
                  },
                  {
                    path: "appraisals",
                    element: <Navigate to="../performance" replace />,
                  },
                ],
              ),
            },
            {
              path: "board",
              ...nest(
                () =>
                  import("./pages/BoardPage").then((m) => ({
                    default: m.BoardPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.BoardOverview,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "meetings",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.MeetingsList,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "meetings/:id",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.MeetingRecordPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "meetings/:id/agenda",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.AgendaBuilderPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "meetings/:id/run",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.RunMeetingPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "meetings/:id/minutes",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.MinutesEditorPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "pack",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.PackIndex,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "pack/:meetingId",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.PackBuilderPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "resolutions",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.ResolutionsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "resolutions/written/new",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.WrittenResolutionNewPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "resolutions/:id",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.ResolutionRecordPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "cac",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.CacSessionView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "risks",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.RiskRegisterView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "risks/:id",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.RiskRecordPage,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "declarations",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.DeclarationsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "members",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.MembersView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "calendar",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.CalendarView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "settings",
                    element: (
                      <L
                        factory={() =>
                          import("./board/sub-views").then((m) => ({
                            default: m.GovSettingsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "crm",
              ...nest(
                () =>
                  import("./pages/CrmPage").then((m) => ({
                    default: m.CrmPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmOverviewView,
                          }))
                        }
                        skeleton="dashboard"
                      />
                    ),
                  },
                  {
                    path: "cases",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmCasesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "cases/:ref",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmCaseWorkspace,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "appeals",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmAppealsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "clients",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmClientsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "clients/:id",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmClient360,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "signals",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmSignalsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "pipeline",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmPipelineView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "quotes",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmQuotesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "renewals",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmRenewalsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "insights",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmInsightsView,
                          }))
                        }
                        skeleton="dashboard"
                      />
                    ),
                  },
                  {
                    path: "settings",
                    element: (
                      <L
                        factory={() =>
                          import("./crm/sub-views").then((m) => ({
                            default: m.CrmSettingsView,
                          }))
                        }
                      />
                    ),
                  },
                  { path: "leads", element: <Navigate to="../pipeline" replace /> },
                  { path: "deals", element: <Navigate to="../pipeline" replace /> },
                ],
              ),
            },
            {
              path: "lms",
              ...nest(
                () =>
                  import("./pages/LmsPage").then((m) => ({
                    default: m.LmsPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./lms/sub-views").then((m) => ({
                            default: m.CoursesView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "enrolments",
                    element: (
                      <L
                        factory={() =>
                          import("./lms/sub-views").then((m) => ({
                            default: m.EnrolmentsView,
                          }))
                        }
                      />
                    ),
                  },
                  {
                    path: "enrol",
                    element: (
                      <L
                        factory={() =>
                          import("./lms/sub-views").then((m) => ({
                            default: m.EnrolView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "marketing",
              ...nest(
                () =>
                  import("./pages/MarketingPage").then((m) => ({
                    default: m.MarketingPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./marketing/sub-views").then((m) => ({
                            default: m.MarketingCampaignsView,
                          }))
                        }
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "reports",
              ...nest(
                () =>
                  import("./pages/ReportsPage").then((m) => ({
                    default: m.ReportsPage,
                  })),
                [
                  {
                    index: true,
                    element: (
                      <L
                        factory={() =>
                          import("./reports/sub-views").then((m) => ({
                            default: m.ExecutiveReportsView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "finance",
                    element: (
                      <L
                        factory={() =>
                          import("./reports/sub-views").then((m) => ({
                            default: m.FinanceReportsView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                  {
                    path: "operations",
                    element: (
                      <L
                        factory={() =>
                          import("./reports/sub-views").then((m) => ({
                            default: m.OperationsReportsView,
                          }))
                        }
                        skeleton="panel"
                      />
                    ),
                  },
                ],
              ),
            },
            {
              path: "admin",
              element: (
                <L
                  factory={() =>
                    import("./pages/SystemAdminPage").then((m) => ({
                      default: m.SystemAdminPage,
                    }))
                  }
                  skeleton="dashboard"
                />
              ),
            },
            { path: "*", element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: "/institution" },
);
