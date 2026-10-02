import { apiFetch } from "@eswasaone/shared-ui";
import { pickMockGuide } from "./fallback";
import type { GuideRequest, GuideResponse } from "./types";

/** Prefer live Core; fall back to local fixtures so Home never shows a hard error. */
export async function buildGuide(body: GuideRequest): Promise<{
  guide: GuideResponse;
  fromFallback: boolean;
}> {
  try {
    const guide = await apiFetch<GuideResponse>("/guide", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { guide, fromFallback: false };
  } catch (err) {
    console.warn("[guide] API unavailable — using mock path", err);
    return { guide: pickMockGuide(body.goal), fromFallback: true };
  }
}
