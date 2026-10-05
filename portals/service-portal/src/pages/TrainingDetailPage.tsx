import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { enrolCourse, getCourse, type Course } from "../api/training";
import { useAuth } from "../auth/AuthProvider";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { safeText } from "../lib/safe";

export function TrainingDetailPage() {
  const { id = "" } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { requireAuth } = useAuth();

  useEffect(() => {
    void getCourse(id).then(setCourse);
  }, [id]);

  async function enrol() {
    if (
      !requireAuth({
        title: "Sign in to enrol",
        reason: "Enrolment is linked to your learner record.",
        next: `/training/${id}`,
      })
    ) {
      return;
    }
    await enrolCourse(id);
    setNote("Enrolled. Open LMS from My account → Training.");
  }

  if (!course) {
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Training", to: "/training" },
            { label: "Loading…" },
          ]}
        />
        <p className="page-note">Loading course…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Training", to: "/training" },
          { label: course.title },
        ]}
      />
      <h1 className="page-h">{safeText(course.title)}</h1>
      <p className="page-lead">{safeText(course.summary)}</p>
      <div className="meta-row">
        <span>{safeText(course.duration)}</span>
        <span>{safeText(course.fee)}</span>
      </div>
      <button type="button" className="btn-primary" onClick={() => void enrol()}>
        Enrol
      </button>
      {note ? <p className="page-note">{note}</p> : null}
    </div>
  );
}
