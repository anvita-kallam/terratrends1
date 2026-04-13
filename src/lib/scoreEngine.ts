/**
 * Client-side port of:
 *   analysis/train_inference_scripts/score_engine.py  (score_all_counties)
 *   analysis/train_inference_scripts/survival_base_rates.py (SurvivalModel)
 *
 * Data files are fetched from /data/ (served by the Vite plugin in vite.config.ts
 * and copied to dist/data/ during production build).
 */

import type { InferenceRequest, RankedCounty } from "@/types/businesses";

// ---------------------------------------------------------------------------
// Constants (mirrors Python constants)
// ---------------------------------------------------------------------------

const CURRENT_YEAR   = 2025;
const BASE_DATA_YEAR = 2023;
const POP_DAMPEN_THRESHOLD = 40_000;

// BLS BED National Survival Rates — P(firm alive at year X | founded at year 0)
// Source: BLS Table 7, cohorts 2000-2019 average
const SURVIVAL_RATES: Record<string, Record<string, number>> = {
    "Accommodation and food services":                                          { "1y": 0.79, "3y": 0.54, "5y": 0.41 },
    "Administrative and support and waste management and remediation services": { "1y": 0.81, "3y": 0.57, "5y": 0.44 },
    "Agriculture, forestry, fishing and hunting":                               { "1y": 0.85, "3y": 0.65, "5y": 0.53 },
    "Arts, entertainment, and recreation":                                      { "1y": 0.80, "3y": 0.55, "5y": 0.42 },
    "Construction":                                                             { "1y": 0.80, "3y": 0.55, "5y": 0.42 },
    "Durable goods manufacturing":                                              { "1y": 0.83, "3y": 0.61, "5y": 0.49 },
    "Educational services":                                                     { "1y": 0.84, "3y": 0.63, "5y": 0.51 },
    "Finance and insurance":                                                    { "1y": 0.84, "3y": 0.63, "5y": 0.50 },
    "Government and government enterprises":                                    { "1y": 0.95, "3y": 0.88, "5y": 0.82 },
    "Health care and social assistance":                                        { "1y": 0.85, "3y": 0.65, "5y": 0.53 },
    "Information":                                                              { "1y": 0.79, "3y": 0.53, "5y": 0.40 },
    "Natural resources and mining":                                             { "1y": 0.83, "3y": 0.61, "5y": 0.48 },
    "Nondurable goods manufacturing":                                           { "1y": 0.82, "3y": 0.59, "5y": 0.47 },
    "Other services (except government and government enterprises)":            { "1y": 0.81, "3y": 0.57, "5y": 0.44 },
    "Private industries":                                                       { "1y": 0.81, "3y": 0.57, "5y": 0.44 },
    "Professional and business services":                                       { "1y": 0.82, "3y": 0.59, "5y": 0.47 },
    "Real estate and rental and leasing":                                       { "1y": 0.82, "3y": 0.60, "5y": 0.47 },
    "Retail trade":                                                             { "1y": 0.79, "3y": 0.54, "5y": 0.41 },
    "Transportation and warehousing":                                           { "1y": 0.81, "3y": 0.57, "5y": 0.44 },
    "Utilities":                                                                { "1y": 0.88, "3y": 0.71, "5y": 0.59 },
    "Wholesale trade":                                                          { "1y": 0.82, "3y": 0.60, "5y": 0.48 },
};
const DEFAULT_SURVIVAL: Record<string, number> = { "1y": 0.81, "3y": 0.57, "5y": 0.44 };

// [lo, hi] inclusive -> multiplier
const AGE_MULTIPLIERS: [[number, number], number][] = [
    [[0,   1],   1.00],
    [[2,   3],   1.08],
    [[4,   5],   1.14],
    [[6,  10],   1.20],
    [[11, 20],   1.28],
    [[21, 999],  1.35],
];

const SIZE_MULTIPLIERS: [[number, number], number][] = [
    [[1,    4],    0.90],
    [[5,   19],    1.00],
    [[20,  49],    1.08],
    [[50,  99],    1.14],
    [[100, 249],   1.20],
    [[250, 999],   1.26],
    [[1000, 99999],1.32],
];

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface QcewRow {
    GeoID: number;
    County: string;
    Year: number;
    Sector: string;
    avg_wage_per_employee: number | null;
    avg_establishments: number | null;
    employment_growth_rate: number | null;
}

interface MergedRow {
    GeoID: number;
    County: string;
    Year: number;
    TOT_POP: number | null;
    Per_Capita_Personal_Income: number | null;
}

interface ForecastRow {
    compound_multiplier: number;
    total_growth: number;
    annual_growth_rate: number;
    economic_adjustment: number;
    revenue_score: number;
    p_shrinking: number;
    p_flat: number;
    p_moderate: number;
    p_strong: number;
}

interface SignalRow {
    County: string;
    Sector: string;
    Year: number;
    emp_trend_3yr:    number | null;
    wage_ratio:       number | null;
    pci_ratio:        number | null;
    saturation_ratio: number | null;
    emp_volatility:   number | null;
}

interface DataCache {
    forecastMap:    Map<string, ForecastRow>;
    signalRows:     SignalRow[];
    counties:       string[];
    countyPop:      Map<string, number>;
    countyGeoId:    Map<string, string>;
    geoidToIndex:   Map<string, number>;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split("\n");
    const headers = parseCSVLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
        rows.push(row);
    }
    return rows;
}

function num(v: string | undefined): number | null {
    if (v === undefined || v === "" || v === "nan") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Rolling mean (ddof=0). Matches pandas rolling(window, min_periods).mean() */
function rollingMean(values: (number | null)[], window: number, minPeriods: number): (number | null)[] {
    return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1)
            .filter((v): v is number => v !== null);
        if (slice.length < minPeriods) return null;
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
}

/** Rolling std (ddof=1). Matches pandas rolling(window, min_periods).std() */
function rollingStd(values: (number | null)[], window: number, minPeriods: number): (number | null)[] {
    return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1)
            .filter((v): v is number => v !== null);
        if (slice.length < minPeriods) return null;
        const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
        return Math.sqrt(variance);
    });
}

function getRangeMultiplier(value: number, table: [[number, number], number][]): number {
    for (const [[lo, hi], mult] of table) {
        if (value >= lo && value <= hi) return mult;
    }
    return 1.0;
}

function clip(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Signal multiplier functions (mirror survival_base_rates.py)
// ---------------------------------------------------------------------------

function empTrendMult(v: number | null): number {
    if (v === null || isNaN(v)) return 1.0;
    return clip(1.0 + v * 1.67, 0.80, 1.25);
}

function wageHealthMult(v: number | null): number {
    if (v === null || isNaN(v) || v <= 0) return 1.0;
    return clip(v ** 0.20, 0.90, 1.15);
}

function incomeMult(v: number | null): number {
    if (v === null || isNaN(v) || v <= 0) return 1.0;
    return clip(v ** 0.25, 0.88, 1.18);
}

function saturationMult(v: number | null): number {
    if (v === null || isNaN(v) || v <= 0) return 1.0;
    return clip(1.0 + (1.0 - v) * 0.08, 0.92, 1.08);
}

function volatilityMult(v: number | null): number {
    if (v === null || isNaN(v)) return 1.0;
    const penalty = Math.max(0, (v - 0.09) * 0.50);
    return clip(1.0 - penalty, 0.85, 1.00);
}

// ---------------------------------------------------------------------------
// Signal table construction (mirrors SurvivalModel._build_signal_table)
// ---------------------------------------------------------------------------

function buildSignalTable(qcewRows: QcewRow[], mergedRows: MergedRow[]): SignalRow[] {
    // PCI lookup: `${GeoID}_${Year}` -> PCI
    const pciMap = new Map<string, number>();
    const pciByYear = new Map<number, number[]>();
    for (const r of mergedRows) {
        if (r.Per_Capita_Personal_Income !== null) {
            pciMap.set(`${r.GeoID}_${r.Year}`, r.Per_Capita_Personal_Income);
            const arr = pciByYear.get(r.Year) ?? [];
            arr.push(r.Per_Capita_Personal_Income);
            pciByYear.set(r.Year, arr);
        }
    }
    const pciMedianByYear = new Map<number, number>();
    for (const [yr, vals] of pciByYear) pciMedianByYear.set(yr, median(vals));

    // Pop lookup: `${GeoID}_${Year}` -> TOT_POP
    const popMap = new Map<string, number>();
    for (const r of mergedRows) {
        if (r.TOT_POP !== null) popMap.set(`${r.GeoID}_${r.Year}`, r.TOT_POP);
    }

    // State median wage: `${Sector}_${Year}` -> median wage
    const wagesBySecYear = new Map<string, number[]>();
    for (const r of qcewRows) {
        if (r.avg_wage_per_employee !== null) {
            const key = `${r.Sector}_${r.Year}`;
            const arr = wagesBySecYear.get(key) ?? [];
            arr.push(r.avg_wage_per_employee);
            wagesBySecYear.set(key, arr);
        }
    }
    const wageMedian = new Map<string, number>();
    for (const [k, vals] of wagesBySecYear) wageMedian.set(k, median(vals));

    // Establishments per 10k pop — needed for saturation_ratio
    // Collect raw values to compute state median per (Sector, Year)
    const estabsBySecYear = new Map<string, number[]>();
    for (const r of qcewRows) {
        const pop = popMap.get(`${r.GeoID}_${r.Year}`);
        if (r.avg_establishments !== null && pop !== undefined && pop > 0) {
            const e10k = r.avg_establishments / (pop / 10_000);
            const key = `${r.Sector}_${r.Year}`;
            const arr = estabsBySecYear.get(key) ?? [];
            arr.push(e10k);
            estabsBySecYear.set(key, arr);
        }
    }
    const estabsMedian = new Map<string, number>();
    for (const [k, vals] of estabsBySecYear) estabsMedian.set(k, median(vals));

    // Group QCEW rows by (GeoID, Sector), sorted by Year — for rolling ops
    const groups = new Map<string, QcewRow[]>();
    for (const r of qcewRows) {
        const key = `${r.GeoID}_${r.Sector}`;
        const arr = groups.get(key) ?? [];
        arr.push(r);
        groups.set(key, arr);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.Year - b.Year);

    // Build signal rows
    const signalRows: SignalRow[] = [];

    for (const groupRows of groups.values()) {
        const growthRates = groupRows.map(r => r.employment_growth_rate);
        const empTrend3yr = rollingMean(growthRates, 3, 2);
        const empVolatility = rollingStd(growthRates, 5, 3);

        groupRows.forEach((r, idx) => {
            const pci     = pciMap.get(`${r.GeoID}_${r.Year}`) ?? null;
            const pciMed  = pciMedianByYear.get(r.Year) ?? null;
            const pci_ratio = pci !== null && pciMed !== null && pciMed > 0
                ? pci / pciMed : null;

            const stateWage = wageMedian.get(`${r.Sector}_${r.Year}`) ?? null;
            const wage_ratio = r.avg_wage_per_employee !== null && stateWage !== null && stateWage > 0
                ? r.avg_wage_per_employee / stateWage : null;

            const pop = popMap.get(`${r.GeoID}_${r.Year}`);
            let saturation_ratio: number | null = null;
            if (r.avg_establishments !== null && pop !== undefined && pop > 0) {
                const e10k = r.avg_establishments / (pop / 10_000);
                const stateE = estabsMedian.get(`${r.Sector}_${r.Year}`) ?? null;
                if (stateE !== null && stateE > 0) saturation_ratio = e10k / stateE;
            }

            signalRows.push({
                County:           r.County,
                Sector:           r.Sector,
                Year:             r.Year,
                emp_trend_3yr:    empTrend3yr[idx],
                wage_ratio,
                pci_ratio,
                saturation_ratio,
                emp_volatility:   empVolatility[idx],
            });
        });
    }

    return signalRows;
}

// ---------------------------------------------------------------------------
// Signal lookup (mirrors SurvivalModel._get_signals)
// ---------------------------------------------------------------------------

type Signals = {
    emp_trend_3yr?:    number;
    wage_ratio?:       number;
    pci_ratio?:        number;
    saturation_ratio?: number;
    emp_volatility?:   number;
};

function lookupSignals(rows: SignalRow[], county: string, sector: string, forecastYear: number): Signals {
    const matches = rows.filter(r => r.County === county && r.Sector === sector && r.Year <= forecastYear);

    if (matches.length === 0) {
        // Sector not in QCEW — fall back to county-level PCI only
        const pciMatches = rows.filter(r => r.County === county && r.Year <= forecastYear && r.pci_ratio !== null);
        if (pciMatches.length > 0) {
            const latest = pciMatches.reduce((a, b) => a.Year > b.Year ? a : b);
            return { pci_ratio: latest.pci_ratio ?? undefined };
        }
        return {};
    }

    const row = matches.reduce((a, b) => a.Year > b.Year ? a : b);
    return {
        emp_trend_3yr:    row.emp_trend_3yr    ?? undefined,
        wage_ratio:       row.wage_ratio       ?? undefined,
        pci_ratio:        row.pci_ratio        ?? undefined,
        saturation_ratio: row.saturation_ratio ?? undefined,
        emp_volatility:   row.emp_volatility   ?? undefined,
    };
}

// ---------------------------------------------------------------------------
// Survival probability (mirrors SurvivalModel.compute)
// ---------------------------------------------------------------------------

function computeSurvivalProbability(
    sector: string,
    county: string,
    businessAgeYears: number,
    employeeCount: number,
    horizon: string,
    signalRows: SignalRow[],
    forecastYear: number = BASE_DATA_YEAR,
): number {
    const rates = SURVIVAL_RATES[sector] ?? DEFAULT_SURVIVAL;
    const base  = rates[horizon] ?? DEFAULT_SURVIVAL[horizon];

    const ageMult  = getRangeMultiplier(businessAgeYears, AGE_MULTIPLIERS);
    const sizeMult = getRangeMultiplier(employeeCount, SIZE_MULTIPLIERS);

    const signals = lookupSignals(signalRows, county, sector, forecastYear);

    const empTrendM  = empTrendMult(signals.emp_trend_3yr    ?? null);
    const wageM      = wageHealthMult(signals.wage_ratio     ?? null);
    const incomeM    = incomeMult(signals.pci_ratio          ?? null);
    const satM       = saturationMult(signals.saturation_ratio ?? null);
    const volM       = volatilityMult(signals.emp_volatility ?? null);

    // Combine in logit space — prevents any combination pushing above 1.0
    const logitBase = Math.log(base / (1.0 - base));
    const logitAdj  = Math.log(ageMult) + Math.log(sizeMult) + Math.log(empTrendM)
                    + Math.log(wageM)   + Math.log(incomeM)  + Math.log(satM) + Math.log(volM);

    const adjusted = 1.0 / (1.0 + Math.exp(-(logitBase + logitAdj)));
    return clip(adjusted, 0.01, 0.98);
}

// ---------------------------------------------------------------------------
// Data loading with in-memory cache
// ---------------------------------------------------------------------------

let _cache: DataCache | null = null;
let _loadPromise: Promise<DataCache> | null = null;

async function loadData(): Promise<DataCache> {
    if (_cache) return _cache;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async (): Promise<DataCache> => {
        const [forecastText, mergedText, qcewText] = await Promise.all([
            fetch("/data/static_forecasts.csv").then(r => r.text()),
            fetch("/data/merged_data_v2.csv").then(r => r.text()),
            fetch("/data/qcew_long.csv").then(r => r.text()),
        ]);

        // --- static_forecasts ---
        const forecastRaw = parseCSV(forecastText).filter(r => r["status"] === "ok");
        const forecastMap = new Map<string, ForecastRow>();
        for (const r of forecastRaw) {
            const key = `${r["county"]}_${r["sector"]}_${r["horizon"]}`;
            forecastMap.set(key, {
                compound_multiplier: Number(r["compound_multiplier"]),
                total_growth:        Number(r["total_growth"]),
                annual_growth_rate:  Number(r["annual_growth_rate"]),
                economic_adjustment: Number(r["economic_adjustment"]),
                revenue_score:       Number(r["revenue_score"]),
                p_shrinking:         Number(r["p_shrinking"]),
                p_flat:              Number(r["p_flat"]),
                p_moderate:          Number(r["p_moderate"]),
                p_strong:            Number(r["p_strong"]),
            });
        }

        // --- merged_data_v2 ---
        const mergedRaw = parseCSV(mergedText);
        const mergedRows: MergedRow[] = mergedRaw.map(r => ({
            GeoID:                      Number(r["GeoID"]),
            County:                     r["County"],
            Year:                       Number(r["Year"]),
            TOT_POP:                    num(r["TOT_POP"]),
            Per_Capita_Personal_Income: num(r["Per_Capita_Personal_Income"]),
        }));

        // County metadata from merged data
        const countyGeoId  = new Map<string, string>();
        const countyPopAll = new Map<string, number>(); // keep latest year's pop
        for (const r of mergedRows) {
            if (r.County) {
                countyGeoId.set(r.County, String(r.GeoID));
                if (r.TOT_POP !== null) countyPopAll.set(r.County, r.TOT_POP);
            }
        }

        const counties = [...countyGeoId.keys()].sort();

        // GeoID -> 1-based index (sorted numerically, matching Python behaviour)
        const sortedGeoIds = [...new Set(mergedRows.map(r => r.GeoID))].sort((a, b) => a - b);
        const geoidToIndex = new Map<string, number>();
        sortedGeoIds.forEach((g, i) => geoidToIndex.set(String(g), i + 1));

        // --- qcew_long ---
        const qcewRaw  = parseCSV(qcewText);
        const qcewRows: QcewRow[] = qcewRaw.map(r => ({
            GeoID:                  Number(r["GeoID"]),
            County:                 r["County"],
            Year:                   Number(r["Year"]),
            Sector:                 r["Sector"],
            avg_wage_per_employee:  num(r["avg_wage_per_employee"]),
            avg_establishments:     num(r["avg_establishments"]),
            employment_growth_rate: num(r["employment_growth_rate"]),
        }));

        const signalRows = buildSignalTable(qcewRows, mergedRows);

        _cache = { forecastMap, signalRows, counties, countyPop: countyPopAll, countyGeoId, geoidToIndex };
        return _cache;
    })();

    return _loadPromise;
}

// ---------------------------------------------------------------------------
// Public API — mirrors score_engine.score_all_counties + predict
// ---------------------------------------------------------------------------

export async function scoreAllCounties(request: InferenceRequest): Promise<RankedCounty[]> {
    const { sector, revenue, employee_count, founding_year, horizon } = request;
    const businessAge = Math.max(0, CURRENT_YEAR - founding_year);

    const { forecastMap, signalRows, counties, countyPop, countyGeoId, geoidToIndex } =
        await loadData();

    type Partial = RankedCounty & { expected_val: number };
    const results: Partial[] = [];

    for (const county of counties) {
        const geoId = countyGeoId.get(county) ?? "";
        const id    = geoidToIndex.get(geoId) ?? 0;
        const pop   = countyPop.get(county) ?? null;

        const fc = forecastMap.get(`${county}_${sector}_${horizon}`);
        if (!fc) {
            results.push({
                rank: 0, id, county,
                population: pop ? Math.round(pop) : 0,
                score: 0, expected_val: 0, tier: "",
                survival_prob: 0, revenue_score: 0, projected_revenue: 0,
                sector_growth_pct: 0, annual_growth_rate: 0, economic_adjustment: 0,
                p_shrinking: 0, p_flat: 0, p_moderate: 0, p_strong: 0,
                status: "error",
                notes: `No static forecast for (${county}, ${sector}, ${horizon})`,
            });
            continue;
        }

        const pSurvival   = computeSurvivalProbability(
            sector, county, businessAge, employee_count, horizon, signalRows,
        );
        const expectedVal = fc.compound_multiplier * pSurvival;

        results.push({
            rank:               0,
            id,
            county,
            population:         pop ? Math.round(pop) : 0,
            score:              0,          // filled after normalisation
            expected_val:       expectedVal,
            tier:               "",         // filled after normalisation
            survival_prob:      Math.round(pSurvival              * 10_000) / 10_000,
            revenue_score:      Math.round(fc.revenue_score        * 10_000) / 10_000,
            projected_revenue:  revenue > 0
                                    ? Math.round(revenue * fc.compound_multiplier * 100) / 100
                                    : 0,
            sector_growth_pct:  Math.round(fc.total_growth         * 100 * 100) / 100,
            annual_growth_rate: Math.round(fc.annual_growth_rate   * 100 * 100) / 100,
            economic_adjustment:Math.round(fc.economic_adjustment   * 1_000)    / 1_000,
            p_shrinking:        Math.round(fc.p_shrinking           * 1_000)    / 1_000,
            p_flat:             Math.round(fc.p_flat                * 1_000)    / 1_000,
            p_moderate:         Math.round(fc.p_moderate            * 1_000)    / 1_000,
            p_strong:           Math.round(fc.p_strong              * 1_000)    / 1_000,
            status:             "ok",
            notes:              pop !== null && pop < POP_DAMPEN_THRESHOLD ? "pop_dampened" : "",
        });
    }

    // Normalise expected_val -> score [0, 100]
    const okResults  = results.filter(r => r.status === "ok");
    const evValues   = okResults.map(r => r.expected_val);
    const evMax      = Math.max(...evValues);
    const evMin      = Math.min(...evValues);
    const evRange    = evMax > evMin ? evMax - evMin : 1.0;

    for (const r of results) {
        if (r.status === "ok") {
            r.score = Math.round(((r.expected_val - evMin) / evRange * 100) * 100) / 100;
        }
    }

    // Tier labels
    for (const r of results) {
        const ev = r.expected_val;
        r.tier = ev >= 0.9 ? "Strong Expand"
               : ev >= 0.7 ? "Cautious Expand"
               : ev >= 0.5 ? "Watch"
               : "Avoid";
    }

    // Sort descending, assign ranks
    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => { r.rank = i + 1; });

    // Strip internal field before returning
    return results.map(({ expected_val: _ev, ...rest }) => rest as RankedCounty);
}
