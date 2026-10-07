import { useEffect, useState, type FormEvent } from "react";
import { useApiResource } from "../hooks/useApiResource";
import { EmptyState, ResourceGate } from "../components/PageStates";
import { RequireStaff } from "../components/RequireStaff";
import { useInstitution } from "../layout/InstitutionLayout";
import { apiFetch, AuthError, Icon, ModuleHeader, Select } from "@eswasaone/shared-ui";
import type { TrainingCoursesResponse } from "../api/types";

/** Enrol — Register a participant in a training course. */

type FlashKind = "ok" | "err";

export function EnrolView() {
  const { openAuth, user, sessionKey } = useInstitution();
  const {
    data,
    loading,
    refreshing,
    error,
    authRequired,
    reload,
  } = useApiResource<TrainingCoursesResponse>("/training/courses", {
    enabled: Boolean(user),
    refreshKey: sessionKey,
  });

  const [member, setMember] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashKind, setFlashKind] = useState<FlashKind>("ok");

  useEffect(() => {
    if (authRequired) openAuth("Staff sign-in required");
  }, [authRequired, openAuth]);

  const courses = data?.items ?? [];

  function showFlash(message: string, kind: FlashKind) {
    setFlash(message);
    setFlashKind(kind);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!course) {
      showFlash("Select a course first.", "err");
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      await apiFetch("/training/enrol", {
        method: "POST",
        body: JSON.stringify({
          course,
          member: member.trim() || undefined, // TODO: wire real — contract requires `confirm`; member is pending schema field.
          confirm: true,
        }),
      });
      showFlash(`Enrolled ${member.trim() || "member"} in ${course}.`, "ok");
      setMember("");
      setCourse("");
    } catch (err) {
      if (err instanceof AuthError && err.authRequired) {
        openAuth(err.reason);
        showFlash("Sign in required to enrol members.", "err");
      } else {
        showFlash(err instanceof Error ? err.message : "Enrolment failed", "err");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireStaff reason="Staff sign-in required">
      <ResourceGate
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={reload}
        hasData={data != null}
        skeleton="panel"
        label="Loading courses…"
      >
        {courses.length === 0 ? (
        <EmptyState
          title="No courses available"
          detail="Create a course before enrolling members."
        />
      ) : (
        <>
          <ModuleHeader
            title="Enrol a Member"
            subtitle="Register a participant in a training course."
          />

          {flash ? (
            <p
              className="tagpill"
              style={{
                marginBottom: 12,
                display: "inline-block",
                background: flashKind === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: flashKind === "ok" ? "var(--green)" : "var(--red)",
              }}
            >
              {flash}
            </p>
          ) : null}

          <div className="panel" style={{ maxWidth: 520, padding: 24 }}>
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 13 }}>
                Member name
                <input
                  type="text"
                  required
                  placeholder="Full name of the participant"
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 13 }}>
                Course
                <Select
                  block
                  required
                  value={course}
                  onChange={setCourse}
                  placeholder="Select a course…"
                  options={courses.map((c) => ({ value: c.id, label: `${c.title} (${c.id})` }))}
                />
              </label>

              <button
                type="submit"
                className="btn gold"
                disabled={busy}
                style={{ justifySelf: "start" }}
              >
                <Icon name="i-plus" />
                {busy ? "Enrolling…" : "Enrol member"}
              </button>
            </form>
          </div>
        </>
      )}
      </ResourceGate>
    </RequireStaff>
  );
}