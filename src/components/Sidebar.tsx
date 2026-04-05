import { useMapState, type MapCounty } from "@/Map";
import { VALID_HORIZONS, VALID_SECTORS } from "@/constants/sectors";
import type { BusinessPlace, InferenceRequest, RankedCounty } from "@/types/businesses";
import { stringToHash } from "@/util/hash";
import { useMemo, useState } from "react";
import { Line, LineChart } from "recharts";

const SideBarTabNames = {
    demographics: "Demographics",
    businesses: "Businesses",
} as const;

type SidebarTab = keyof typeof SideBarTabNames;

//antony
type FormErrors = Partial<Record<keyof InferenceRequest, string>>;

function validateInferenceForm(form: {
    sector: string;
    revenue: string;
    employee_count: string;
    founding_year: string;
    horizon: "1y" | "3y" | "5y";
}): FormErrors {
    const errors: FormErrors = {};

    if (!VALID_SECTORS.includes(form.sector as (typeof VALID_SECTORS)[number])) {
        errors.sector = "Please select a valid sector.";
    }

    if (!VALID_HORIZONS.includes(form.horizon)) {
        errors.horizon = "Please select a valid forecast horizon.";
    }

    const revenue = Number(form.revenue);
    if (!Number.isInteger(revenue)) {
        errors.revenue = "Revenue must be an integer.";
    }

    const employeeCount = Number(form.employee_count);
    if (!Number.isInteger(employeeCount)) {
        errors.employee_count = "Employee count must be an integer.";
    }

    const foundingYear = Number(form.founding_year);
    if (!Number.isInteger(foundingYear)) {
        errors.founding_year = "Founding year must be an integer.";
    }

    return errors;
}

function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

function formatDecimalPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(value);
}




function getDummyGdpSectorPrediction(county: MapCounty): React.JSX.Element {
    // Super simple, fake “prediction” based only on countyId
    const base = 8*stringToHash(county.name) - 4; // gives [-2, 2]    
    const percent = (base * 1.5).toFixed(1);  // scale to something like -3.0%, 0.0%, 3.0%

    return <span className={`font-semibold ${base >= 0 ? "text-green-600" : "text-red-600"}`}>{base > 0 ? "+" : ""}{percent}% GDP &Delta;</span>
}


function Demographics() {
    return (
        <div className="flex flex-col gap-3 p-3 h-full overflow-scroll">
            <div className="grid grid-cols-2">
                <div className="bg-sky-50 rounded-2xl mr-1.5 p-3">
                    <p className="text-slate-600 text-sm">Population</p>
                    <p className="font-bold text-xl">1.09 million</p>
                </div>
                <div className="bg-sky-50 rounded-2xl ml-1.5 p-3">
                    <p className="text-slate-600 text-sm">Population Growth</p>
                    <p className="font-bold text-xl">+0.5% Growth</p>
                </div>
            </div>
            <div>
                <SampleChart />
            </div>
            <div className="grid grid-cols-2">
                <div className="bg-sky-50 rounded-2xl mr-1.5 p-3">
                    <p className="text-slate-600 text-sm">
                        Median Household Income
                    </p>
                    <p className="font-bold text-xl">$67,000</p>
                </div>
                <div className="bg-sky-50 rounded-2xl ml-1.5 p-3">
                    <p className="text-slate-600 text-sm">
                        Percent with College Degree
                    </p>
                    <p className="font-bold text-xl">47.9%</p>
                </div>
            </div>
            <div>
                <SampleChart />
            </div>
            <div className="grid grid-cols-2">
                <div className="bg-sky-50 rounded-2xl mr-1.5 p-3">
                    <p className="text-slate-600 text-sm">
                        Violent Crime Rate (per 1000)
                    </p>
                    <p className="font-bold text-xl">7.18</p>
                </div>
                <div className="bg-sky-50 rounded-2xl ml-1.5 p-3">
                    <p className="text-slate-600 text-sm">
                        Property Crime Rate
                    </p>
                    <p className="font-bold text-xl">40.42</p>
                </div>
            </div>
            <div>
                <SampleChart />
            </div>
        </div>
    );
}

function SampleChart() {
    return (
        <LineChart
            className="border-2 rounded-2xl border-slate-300"
            style={{
                width: "100%",
                aspectRatio: 1.618,
                maxWidth: 600,
            }}
            responsive
            data={[
                {
                    name: "Page A",
                    uv: 400,
                    pv: 2400,
                    amt: 2400,
                },
                {
                    name: "Page B",
                    uv: 300,
                    pv: 4567,
                    amt: 2400,
                },
                {
                    name: "Page C",
                    uv: 320,
                    pv: 1398,
                    amt: 2400,
                },
                {
                    name: "Page D",
                    uv: 200,
                    pv: 9800,
                    amt: 2400,
                },
                {
                    name: "Page E",
                    uv: 278,
                    pv: 3908,
                    amt: 2400,
                },
                {
                    name: "Page F",
                    uv: 189,
                    pv: 4800,
                    amt: 2400,
                },
            ]}
        >
            <Line dataKey="uv"></Line>
        </LineChart>
    );
}


//antony
function InferenceForm() {
    const {
        runInference,
        isRunningInference,
        inferenceError,
        clearInferenceResults,
        rankedCounties,
    } = useMapState();

    const [form, setForm] = useState({
        sector: "",
        revenue: "",
        employee_count: "",
        founding_year: "",
        horizon: "3y" as "1y" | "3y" | "5y",
    });

    const [errors, setErrors] = useState<FormErrors>({});

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const validationErrors = validateInferenceForm(form);
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length > 0) {
            return;
        }

        await runInference({
            sector: form.sector,
            revenue: Number(form.revenue),
            employee_count: Number(form.employee_count),
            founding_year: Number(form.founding_year),
            horizon: form.horizon,
        });
    }

    return (
        <div className="p-6 flex flex-col gap-5 overflow-y-auto">
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-slate-800">Rank Georgia counties</h2>
                <p className="text-sm text-slate-600">
                    Enter your business details to rank all 159 Georgia counties by expansion potential.
                </p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">Sector</label>
                    <select
                        className="rounded-xl border border-slate-300 px-3 py-2 bg-white"
                        value={form.sector}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, sector: e.target.value }))
                        }
                    >
                        <option value="">Select a sector</option>
                        {VALID_SECTORS.map((sector) => (
                            <option key={sector} value={sector}>
                                {sector}
                            </option>
                        ))}
                    </select>
                    {errors.sector && <p className="text-sm text-red-600">{errors.sector}</p>}
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">Revenue</label>
                    <input
                        className="rounded-xl border border-slate-300 px-3 py-2"
                        type="number"
                        step="1"
                        value={form.revenue}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, revenue: e.target.value }))
                        }
                        placeholder="150000"
                    />
                    {errors.revenue && <p className="text-sm text-red-600">{errors.revenue}</p>}
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">Employee count</label>
                    <input
                        className="rounded-xl border border-slate-300 px-3 py-2"
                        type="number"
                        step="1"
                        value={form.employee_count}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, employee_count: e.target.value }))
                        }
                        placeholder="8"
                    />
                    {errors.employee_count && (
                        <p className="text-sm text-red-600">{errors.employee_count}</p>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">Founding year</label>
                    <input
                        className="rounded-xl border border-slate-300 px-3 py-2"
                        type="number"
                        step="1"
                        value={form.founding_year}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, founding_year: e.target.value }))
                        }
                        placeholder="2020"
                    />
                    {errors.founding_year && (
                        <p className="text-sm text-red-600">{errors.founding_year}</p>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">Forecast horizon</label>
                    <select
                        className="rounded-xl border border-slate-300 px-3 py-2 bg-white"
                        value={form.horizon}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                horizon: e.target.value as "1y" | "3y" | "5y",
                            }))
                        }
                    >
                        {VALID_HORIZONS.map((horizon) => (
                            <option key={horizon} value={horizon}>
                                {horizon}
                            </option>
                        ))}
                    </select>
                    {errors.horizon && <p className="text-sm text-red-600">{errors.horizon}</p>}
                </div>

                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={isRunningInference}
                        className={`p-4 rounded-xl font-semibold text-base transition-all duration-200 ${
                            isRunningInference
                                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                                : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl"
                        }`}
                    >
                        {isRunningInference ? "Ranking counties..." : "Run county ranking"}
                    </button>

                    {rankedCounties.length > 0 && (
                        <button
                            type="button"
                            onClick={clearInferenceResults}
                            className="p-4 rounded-xl font-semibold text-base border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </form>

            {isRunningInference && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
                    Running the inference pipeline. This usually takes around 4 seconds.
                </div>
            )}

            {inferenceError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {inferenceError}
                </div>
            )}
        </div>
    );
}









function BusinessCard({ business, index }: { business: BusinessPlace; index: number }) {
    const typeList = business.types.slice(0, 3).map((type) => type.replace(/_/g, " "));
    const mapLink = `https://www.google.com/maps/place/?q=place_id:${business.placeId}`;
    const ratingText =
        typeof business.rating === "number" ? business.rating.toFixed(1) : "N/A";

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex flex-row justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <p className="text-xs text-slate-400 font-semibold tracking-wide">
                        #{index + 1}
                    </p>
                    <p className="font-semibold text-lg">{business.name}</p>
                    <p className="text-sm text-slate-500">{business.address}</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-slate-800">{ratingText}</p>
                    <p className="text-xs text-slate-500">
                        {business.totalRatings} review{business.totalRatings === 1 ? "" : "s"}
                    </p>
                    {business.priceLevel !== null && (
                        <p className="text-xs text-slate-500">
                            {"$".repeat(Math.max(1, business.priceLevel))}
                        </p>
                    )}
                </div>
            </div>
            {typeList.length > 0 && (
                <p className="text-xs text-slate-500">{typeList.join(" • ")}</p>
            )}
            <a
                href={mapLink}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-600 font-medium"
            >
                Open in Google Maps →
            </a>
        </div>
    );
}

function BusinessesTab() {
    const {
        businessType,
        county,
        businesses,
        isFetchingBusinesses,
        businessError,
    } = useMapState();

    if (!businessType) {
        return (
            <div className="p-6 text-slate-600">
                Enter a business type to see tailored Google Maps insights here.
            </div>
        );
    }

    if (!county) {
        return (
            <div className="p-6 text-slate-600">
                Click on a county to pull the highest-rated {businessType} businesses nearby.
            </div>
        );
    }

    if (businessError) {
        return (
            <div className="p-6 text-red-600">
                {businessError}
            </div>
        );
    }

    if (isFetchingBusinesses) {
        return (
            <div className="p-6 flex flex-col gap-3 animate-pulse text-slate-600">
                <p className="font-semibold">Fetching Google Maps listings...</p>
                <p>We are geocoding {county.name} County and compiling the best-rated matches.</p>
            </div>
        );
    }

    if (businesses.length === 0) {
        return (
            <div className="p-6 text-slate-600">
                No Google Maps listings matched “{businessType}” for {county.name} County.
                Try another category or widen your search.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-3 h-full overflow-scroll">
            <div className="bg-slate-50 rounded-2xl p-3 text-sm text-slate-600 border border-slate-200">
                Showing <span className="font-semibold">{businessType}</span> businesses in{" "}
                <span className="font-semibold">{county.name} County</span>, sorted by rating.
            </div>
            {businesses.map((business, index) => (
                <BusinessCard key={business.placeId} business={business} index={index} />
            ))}
        </div>
    );
}

//antony
function RankedCountyCard({ county }: { county: RankedCounty }) {
    const hasWarning = county.status !== "ok" || county.notes.trim() !== "";

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs text-slate-400 font-semibold tracking-wide">
                        Rank #{county.rank}
                    </p>
                    <p className="font-semibold text-lg">{county.county}</p>
                    <p className="text-sm text-slate-500">Population {county.population.toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-slate-800">{county.score.toFixed(1)}</p>
                    <p className="text-xs text-slate-500">{county.tier}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                <p>Projected revenue: <span className="font-medium text-slate-800">{formatCurrency(county.projected_revenue)}</span></p>
                <p>Survival probability: <span className="font-medium text-slate-800">{formatDecimalPercent(county.survival_prob)}</span></p>
                <p>Sector growth: <span className="font-medium text-slate-800">{formatPercent(county.sector_growth_pct)}</span></p>
                <p>Annual growth: <span className="font-medium text-slate-800">{formatPercent(county.annual_growth_rate)}</span></p>
            </div>

            {hasWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-semibold">Status: {county.status}</p>
                    {county.notes.trim() !== "" && <p>{county.notes}</p>}
                </div>
            )}
        </div>
    );
}

function RankedCountiesList() {
    const { rankedCounties } = useMapState();

    const topCounties = useMemo(() => rankedCounties.slice(0, 159), [rankedCounties]);

    if (topCounties.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-3 p-3 h-full overflow-scroll">
            <div className="bg-slate-50 rounded-2xl p-3 text-sm text-slate-600 border border-slate-200">
                Showing <span className="font-semibold">{topCounties.length}</span> ranked Georgia counties.
            </div>
            {topCounties.map((county) => (
                <RankedCountyCard key={county.id} county={county} />
            ))}
        </div>
    );
}




function SidebarTab({
    tab,
    currTab,
    setCurrTab,
}: {
    tab: SidebarTab;
    currTab: SidebarTab;
    setCurrTab: React.Dispatch<React.SetStateAction<SidebarTab>>;
}) {
    return (
        <button
            className={`bg-transparent hover:cursor-pointer ${currTab == tab
                ? "border-b-2 text-blue-500"
                : "border-b border-slate-200"
                } p-3`}
            onClick={() => {
                setCurrTab(tab);
            }}
        >
            {SideBarTabNames[tab]}
        </button>
    );
}

export default function Sidebar(): React.JSX.Element {
    const {
        county,
        businessType,
        //setBusinessType,
        rankedCounties,
        selectedCountyResult,
    } = useMapState();

    const [tab, setTab] = useState<SidebarTab>("demographics");

    //const [inputBusType, setInputBusType] = useState<string>("");

    return (
        <>
            {/** Sidebar component */}
            <div className="min-w-100 max-w-100 shadow-xl z-1000 max-h-screen flex flex-col overflow-hidden">
                {rankedCounties.length === 0 ? (
                    <InferenceForm />
                ) : (
                    <>
                        <div className="flex items-center justify-between py-4 px-3 border-b border-slate-200">
                            <div>
                                <p className="text-slate-800 font-bold text-xl">
                                    {county ? `${county.name} County` : "County Rankings"}
                                </p>
                                <p className="text-sm text-slate-500">
                                    {businessType ?? "Selected sector"}
                                </p>
                            </div>
                            <p className="text-sm text-slate-600 text-right max-w-[10rem]">
                                {county && selectedCountyResult
                                    ? `${selectedCountyResult.tier} · ${selectedCountyResult.score.toFixed(1)}`
                                    : "Click a county on the map"}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 text-xs">
                            {Object.keys(SideBarTabNames).map((key) => {
                                return (
                                    <SidebarTab
                                        key={key}
                                        tab={key as SidebarTab}
                                        currTab={tab}
                                        setCurrTab={setTab}
                                    />
                                );
                            })}
                        </div>

                        {tab === "demographics" ? (
                            county && selectedCountyResult ? (
                                <div className="flex flex-col gap-3 p-3 h-full overflow-scroll">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">County Rank</p>
                                            <p className="font-bold text-xl">#{selectedCountyResult.rank}</p>
                                        </div>
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">Population</p>
                                            <p className="font-bold text-xl">
                                                {selectedCountyResult.population.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">Projected Revenue</p>
                                            <p className="font-bold text-xl">
                                                {formatCurrency(selectedCountyResult.projected_revenue)}
                                            </p>
                                        </div>
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">Survival Probability</p>
                                            <p className="font-bold text-xl">
                                                {formatDecimalPercent(selectedCountyResult.survival_prob)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">Sector Growth</p>
                                            <p className="font-bold text-xl">
                                                {formatPercent(selectedCountyResult.sector_growth_pct)}
                                            </p>
                                        </div>
                                        <div className="bg-sky-50 rounded-2xl p-3">
                                            <p className="text-slate-600 text-sm">Annual Growth</p>
                                            <p className="font-bold text-xl">
                                                {formatPercent(selectedCountyResult.annual_growth_rate)}
                                            </p>
                                        </div>
                                    </div>

                                    {(selectedCountyResult.status !== "ok" ||
                                        selectedCountyResult.notes.trim() !== "") && (
                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                            <p className="font-semibold">
                                                Status: {selectedCountyResult.status}
                                            </p>
                                            {selectedCountyResult.notes.trim() !== "" && (
                                                <p>{selectedCountyResult.notes}</p>
                                            )}
                                        </div>
                                    )}

                                    <SampleChart />
                                </div>
                            ) : (
                                <RankedCountiesList />
                            )
                        ) : (
                            <BusinessesTab />
                        )}
                    </>
                )}
            </div>
        </>
    );
}
