import { useEffect } from "react";
import type { TrainingCoursesResponse, TrainingEnrolmentsResponse } from "../api/types";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";

export function LmsPage() {
  const { openAuth, user, sessionKey } = useInstitution();
  const courses = useApiResource<TrainingCoursesResponse>("/training/courses", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });
  const enrolments = useApiResource<TrainingEnrolmentsResponse>("/training/enrolments", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  useEffect(() => {
    if (courses.authRequired || enrolments.authRequired) {
      openAuth("Staff sign-in required for training");
    }
  }, [courses.authRequired, enrolments.authRequired, openAuth]);

  const loading = courses.loading || enrolments.loading;
  const error = courses.error || enrolments.error;
  const retry = () => {
    courses.reload();
    enrolments.reload();
  };

  return (
    <RequireStaff reason="Staff sign-in required for training">
      {loading ? (
        <LoadingState label="Loading training…" />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <>
          <PageHeader title="LMS & Training" subtitle="Courses and enrolments from Core" />

          <div className="sec-label">Courses</div>
          {(courses.data?.items ?? []).length === 0 ? (
            <EmptyState title="No courses" detail="Course catalogue is empty." />
          ) : (
            <div className="panel" style={{ marginBottom: 24 }}>
              <div className="act">
                {(courses.data?.items ?? []).map((c) => (
                  <div key={c.id} className="act__i">
                    <span
                      className="act__d"
                      style={{ background: c.published ? "var(--green)" : "var(--amber)" }}
                    />
                    <div>
                      <p>{c.title}</p>
                      <span>
                        {c.id} · {c.published ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sec-label">Enrolments</div>
          {(enrolments.data?.items ?? []).length === 0 ? (
            <EmptyState title="No enrolments" detail="Enrolments will appear when Core returns them." />
          ) : (
            <div className="panel">
              <div className="act">
                {(enrolments.data?.items ?? []).map((e) => (
                  <div key={e.id} className="act__i">
                    <span className="act__d" style={{ background: "var(--navy)" }} />
                    <div>
                      <p>
                        {e.course}
                        {e.member ? ` — ${e.member}` : ""}
                      </p>
                      <span>
                        {e.id} · {e.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </RequireStaff>
  );
}
