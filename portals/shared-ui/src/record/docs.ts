/**
 * Documents and attachments for any record (gap 01 C6): categories, versions, who/when, gate
 * artefacts that can only be superseded. Files go to Core /media/upload when it answers; otherwise
 * small files are kept as data URLs on this device so the demo survives a reload.
 * TODO: wire real — GET/POST /records/{doctype}/{name}/documents (Frappe File attached to the doc).
 */
import { uploadMedia, validateUpload } from "../api/upload";
import { createLocalStore, isoIn, nowIso, uid } from "../store/localStore";

export type RecordDoc = {
  id: string;
  /** Stable id across versions of the same document. */
  family: string;
  name: string;
  category: string;
  version: number;
  uploaded_by: string;
  at: string;
  size: number;
  url?: string;
  content_type?: string;
  /** Gate artefact — never replaced, only superseded by a new version. */
  gate?: boolean;
  superseded_by?: string;
  note?: string;
};

type DocsState = { v: 1; byRecord: Record<string, RecordDoc[]> };

const rk = (doctype: string, name: string) => `${doctype}:${name}`;

function seedDoc(family: string, name: string, category: string, by: string, days: number, version = 1, extra: Partial<RecordDoc> = {}): RecordDoc {
  return { id: `${family}-v${version}`, family, name, category, version, uploaded_by: by, at: isoIn(days, 10), size: 180_000 + version * 23_000, content_type: "application/pdf", ...extra };
}

export const docsStore = createLocalStore<DocsState>({
  key: "eswasaone.docs.v1",
  v: 1,
  seed: () => ({
    v: 1,
    byRecord: {
      "Board Meeting:BM-2026-Q3": [
        seedDoc("bm3-notice", "Notice of meeting — Q3 Board.pdf", "Notice", "Nomsa Dlamini", -12),
        seedDoc("bm3-afs", "Management accounts to 30 Sep.pdf", "Papers", "Themba Motsa", -3),
        seedDoc("bm3-strat", "Strategic plan mid-term review.pdf", "Papers", "Sipho Mamba", -4, 2),
        seedDoc("bm3-strat", "Strategic plan mid-term review.pdf", "Papers", "Sipho Mamba", -6, 1, { superseded_by: "bm3-strat-v2" }),
      ],
      "Board Meeting:BM-2026-Q2": [
        seedDoc("bm2-min", "Approved minutes — Q2 Board.pdf", "Minutes", "Nomsa Dlamini", -60, 1, { gate: true }),
        seedDoc("bm2-pack", "Board pack v2 — Q2.pdf", "Pack", "Nomsa Dlamini", -100, 2, { gate: true }),
      ],
      "Board Resolution:RES-2026-014": [seedDoc("r14-paper", "Fee schedule 2026-27 — proposal.pdf", "Papers", "Themba Motsa", -40)],
      "Governance Risk:RSK-007": [seedDoc("rsk7-bcp", "ICT continuity test report.pdf", "Evidence", "Lungile Mkhabela", -20)],
    },
  }),
});

export function listRecordDocs(doctype: string, name: string): RecordDoc[] {
  docsStore.guard("Documents");
  return docsStore.view((s) => (s.byRecord[rk(doctype, name)] ?? []).slice().sort((a, b) => a.category.localeCompare(b.category) || b.version - a.version));
}

async function asStoredUrl(file: File): Promise<{ url?: string; content_type: string }> {
  const up = await uploadMedia(file, "records");
  if (!up.mocked) return { url: up.url, content_type: up.content_type };
  if (file.size > 1_500_000) return { url: up.url, content_type: up.content_type };
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { url: dataUrl, content_type: up.content_type };
}

export async function uploadRecordDoc(args: {
  doctype: string;
  name: string;
  file: File;
  category: string;
  by: string;
  /** New version of an existing document family. */
  family?: string;
  gate?: boolean;
  accept?: string;
}): Promise<RecordDoc> {
  docsStore.guard("Uploading documents");
  const bad = validateUpload(args.file, { accept: args.accept ?? "*" });
  if (bad) throw new Error(bad);
  const stored = await asStoredUrl(args.file);
  return docsStore.mutate((s) => {
    const list = (s.byRecord[rk(args.doctype, args.name)] ??= []);
    const family = args.family ?? uid("doc");
    const prev = list.filter((d) => d.family === family && !d.superseded_by).sort((a, b) => b.version - a.version)[0];
    const doc: RecordDoc = {
      id: `${family}-v${(prev?.version ?? 0) + 1}`,
      family,
      name: args.file.name,
      category: args.category,
      version: (prev?.version ?? 0) + 1,
      uploaded_by: args.by,
      at: nowIso(),
      size: args.file.size,
      url: stored.url,
      content_type: stored.content_type,
      gate: args.gate ?? prev?.gate,
    };
    if (prev) prev.superseded_by = doc.id;
    list.push(doc);
    return doc;
  });
}

/** Add a document record without a file body (generated PDFs, minutes, packs). */
export function addGeneratedDoc(doctype: string, name: string, doc: Omit<RecordDoc, "id" | "version" | "at"> & { version?: number }): RecordDoc {
  return docsStore.mutate((s) => {
    const list = (s.byRecord[rk(doctype, name)] ??= []);
    const prev = list.filter((d) => d.family === doc.family && !d.superseded_by).sort((a, b) => b.version - a.version)[0];
    const version = doc.version ?? (prev?.version ?? 0) + 1;
    const row: RecordDoc = { ...doc, id: `${doc.family}-v${version}`, version, at: nowIso() };
    if (prev) prev.superseded_by = row.id;
    list.push(row);
    return row;
  });
}

export function removeRecordDoc(doctype: string, name: string, id: string): void {
  docsStore.mutate((s) => {
    const list = s.byRecord[rk(doctype, name)] ?? [];
    const d = list.find((x) => x.id === id);
    if (!d) return;
    if (d.gate) throw new Error("This is a gate document — it can only be superseded by a new version, not removed.");
    s.byRecord[rk(doctype, name)] = list.filter((x) => x.id !== id);
  });
}
