export type BusinessPlace = {
    placeId: string;
    name: string;
    address: string;
    rating: number | null;
    totalRatings: number;
    priceLevel: number | null;
    types: string[];
};

export type FetchBusinessesRequest = {
    countyName: string;
    stateId: string;
    businessType: string;
    radiusMeters?: number;
};

export type FetchBusinessesSuccess = {
    businesses: BusinessPlace[];
};

export type FetchBusinessesError = {
    error: string;
};

export type InferenceRequest = {
    sector: string;
    revenue: number;
    employee_count: number;
    founding_year: number;
    horizon: "1y" | "3y" | "5y";
};

export type RankedCounty = {
    rank: number;
    id: number;
    county: string;
    population: number;
    score: number;
    tier: string;
    survival_prob: number;
    revenue_score: number;
    projected_revenue: number;
    sector_growth_pct: number;
    annual_growth_rate: number;
    economic_adjustment: number;
    p_shrinking: number;
    p_flat: number;
    p_moderate: number;
    p_strong: number;
    status: string;
    notes: string;
};