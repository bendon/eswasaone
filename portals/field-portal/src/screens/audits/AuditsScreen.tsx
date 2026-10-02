import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthError } from "@eswasaone/shared-ui";
import { useAuth } from "../../auth/AuthProvider";
import { readSnapshot, writeSnapshot } from "../../lib/localSnapshot";
import { AuditDetail } from "./AuditDetail";
import { AuditList } from "./AuditList";
import { fetchAudits } from "./api";
import { loadDraft } from "./draftStore";
import { filterBySegment, filterForCurrentUser } from "./segments";
import type { AuditSegment, FieldAuditRow } from "./types";

/** Field Audits — list + checklist / NC / sign-off detail for mobile auditors. */
export function AuditsScreen() {
  const { user, openAuth } = useAuth();
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState<FieldAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<AuditSegment>(() => {
    const seg = params.get("seg");
    if (seg === "upcoming" || seg === "submitted" || seg === "today") return seg;
    return "today";
  });
  const [openId, setOpenId] = useState<string | null>(() => params.get("open"));
  const [localSubmitted, setLocalSubmitted] = useState<Set<string>>(
    () => new Set(),
  );

  const load = useCallback(async () => {
    const cachePath = "/certification/audits?limit=50";
    const cached = readSnapshot<{ items: FieldAuditRow[] }>(cachePath);
    if (cached?.data.items?.length) {
      const scoped = filterForCurrentUser(
        cached.data.items,
        user?.username,
        user?.full_name,
      );
      setItems(scoped);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetchAudits(50);
      const raw = (res.items ?? []) as FieldAuditRow[];
      writeSnapshot(cachePath, res);
      // TODO: wire real — list endpoint has no auditor=me; filter client-side for now.
      const scoped = filterForCurrentUser(
        raw,
        user?.username,
        user?.full_name,
      );
      setItems(scoped);

      const submitted = new Set<string>();
      for (const a of scoped) {
        const d = loadDraft(a.id);
        if (d.locallySubmitted) submitted.add(a.id);
      }
      setLocalSubmitted(submitted);
    } catch (e) {
      if (e instanceof AuthError) {
        openAuth({
          title: "Sign in to Field",
          reason: "Audits require a staff session.",
        });
        setError("Sign in required to load audits.");
      } else if (cached?.data.items?.length) {
        // Keep last-known-good — no blank reload.
        setError(null);
      } else {
        try {
          const { MOCK_FIELD_AUDITS } = await import(
            "../../mocks/auditHandlers"
          );
          const scoped = filterForCurrentUser(
            MOCK_FIELD_AUDITS,
            user?.username,
            user?.full_name,
          );
          setItems(scoped);
          setError(null);
        } catch {
          setError(e instanceof Error ? e.message : "Failed to load audits");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [openAuth, user?.full_name, user?.username]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep-link: /audits?open=ID (Home uses auditsHref from ./index)
  useEffect(() => {
    const open = params.get("open");
    if (open) setOpenId(open);
    const seg = params.get("seg");
    if (seg === "upcoming" || seg === "submitted" || seg === "today") {
      setSegment(seg);
    }
  }, [params]);

  const filtered = useMemo(
    () => filterBySegment(items, segment, localSubmitted),
    [items, segment, localSubmitted],
  );

  const selected = useMemo(
    () => items.find((a) => a.id === openId) ?? null,
    [items, openId],
  );

  function syncUrl(nextOpen: string | null, nextSeg: AuditSegment) {
    const next = new URLSearchParams();
    if (nextOpen) next.set("open", nextOpen);
    if (nextSeg !== "today") next.set("seg", nextSeg);
    setParams(next, { replace: true });
  }

  function onOpen(id: string) {
    setOpenId(id);
    syncUrl(id, segment);
  }

  function onBack() {
    setOpenId(null);
    syncUrl(null, segment);
  }

  function onSegment(s: AuditSegment) {
    setSegment(s);
    syncUrl(openId, s);
  }

  function onLocallySubmitted(id: string) {
    setLocalSubmitted((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setOpenId(null);
      setSegment("submitted");
      syncUrl(null, "submitted");
    }, 700);
  }

  const auditorName = user?.full_name || user?.username || "Auditor";

  if (selected) {
    return (
      <section className="field-screen aud-screen">
        <AuditDetail
          audit={selected}
          auditorDisplayName={auditorName}
          onBack={onBack}
          onLocallySubmitted={onLocallySubmitted}
        />
      </section>
    );
  }

  return (
    <section className="field-screen aud-screen">
      <h1 className="field-screen__title">Audits</h1>
      <AuditList
        segment={segment}
        onSegment={onSegment}
        items={filtered}
        onOpen={onOpen}
        loading={loading}
        error={error}
        onRetry={() => void load()}
      />
    </section>
  );
}
