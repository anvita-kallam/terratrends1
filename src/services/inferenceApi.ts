import type { InferenceRequest, RankedCounty } from "@/types/businesses";
import { DEMO_RANKED_COUNTIES } from "@/data/demoBusinesses";
import { scoreAllCounties } from "@/lib/scoreEngine";

const DEMO_MODE        = import.meta.env.VITE_DEBUG_DEMO_DATA === "true";
// Set VITE_USE_SERVER_SCORING=true to fall back to the server-side fetch path.
const USE_SERVER_SCORING = import.meta.env.VITE_USE_SERVER_SCORING === "true";
const INFERENCE_API_URL  = import.meta.env.VITE_INFERENCE_API_URL as string | undefined;

export async function fetchCountyRankings(
    payload: InferenceRequest
): Promise<RankedCounty[]> {
    if (DEMO_MODE) {
        return DEMO_RANKED_COUNTIES;
    }

    // --- Client-side scoring (default) ---
    if (!USE_SERVER_SCORING) {
        return scoreAllCounties(payload);
    }

    // --- Server-side fetch fallback ---
    if (!INFERENCE_API_URL) {
        throw new Error(
            "VITE_USE_SERVER_SCORING=true but VITE_INFERENCE_API_URL is not set."
        );
    }

    const response = await fetch(INFERENCE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `Inference request failed (${response.status}): ${text || "Unknown error"}`
        );
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
        throw new Error("Invalid response format: expected an array of ranked counties.");
    }

    return data as RankedCounty[];
}
