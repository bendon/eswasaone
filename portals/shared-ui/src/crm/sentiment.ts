/**
 * Sentiment and urgency flags on incoming text (04 P3). A keyword heuristic that only flags — staff decide.
 * TODO: wire real — POST /agent/classify {text} (Esi) once the assistant service is connected.
 */
import type { Case } from "./types";

export type TextFlags = { angry: boolean; urgent: boolean; cues: string[] };

const ANGRY = [/\bunacceptable\b/i, /\bdisgust/i, /\bfurious\b/i, /\boutrage/i, /\bridiculous\b/i, /\bscam\b/i, /\bfraud\b/i, /\bworst\b/i, /\bfed up\b/i, /\bincompeten/i, /\blawyer\b/i, /\bsue\b/i, /\bmedia\b/i, /\bnever again\b/i, /!{2,}/];
const URGENT = [/\burgent(ly)?\b/i, /\bimmediately\b/i, /\basap\b/i, /\btoday\b/i, /\bemergency\b/i, /\bdanger(ous)?\b/i, /\bunsafe\b/i, /\binjur/i, /\bchild(ren)?\b/i, /\bfire\b/i, /\bpoison/i, /\bexpired?\b.*\b(food|medicine)\b/i, /\bshipment\b.*\bheld\b/i];

export function textFlags(text: string): TextFlags {
  const cues: string[] = [];
  const hit = (list: RegExp[]) => list.filter((r) => r.test(text)).map((r) => (text.match(r)?.[0] ?? "").trim());
  const a = hit(ANGRY);
  const u = hit(URGENT);
  cues.push(...a, ...u);
  // Shouting: a run of capitalised words.
  const shouting = /\b[A-Z]{4,}(\s+[A-Z]{3,}){2,}\b/.test(text);
  if (shouting) cues.push("ALL CAPS");
  return { angry: a.length > 0 || shouting, urgent: u.length > 0, cues: [...new Set(cues.filter(Boolean))] };
}

/** Flags over the description and the customer's own messages. */
export function caseFlags(c: Pick<Case, "description" | "thread">): TextFlags {
  return textFlags([c.description, ...c.thread.filter((m) => m.role === "customer").map((m) => m.body)].join("\n"));
}
