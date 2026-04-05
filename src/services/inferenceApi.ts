import type { InferenceRequest, RankedCounty } from "@/types/businesses";

const INFERENCE_API_URL = import.meta.env.VITE_INFERENCE_API_URL;

if (!INFERENCE_API_URL) {
    throw new Error("Missing VITE_INFERENCE_API_URL environment variable.");
}

export async function fetchCountyRankings(
    payload: InferenceRequest
): Promise<RankedCounty[]> {
    const response = await fetch(INFERENCE_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
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