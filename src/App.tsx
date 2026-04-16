import "./App.css";

import { MapContainer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";

import countyData from "./data/us_counties.json";

import * as L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import { MapProvider, useMapState, type MapCounty } from "./Map";

function CountySearch() {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredCounties, setFilteredCounties] = useState<MapCounty[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const { setCounty, rankedCountyMap } = useMapState();

    const allCounties: MapCounty[] = useMemo(() =>
        countyData.features.map((feature) => ({
            name: feature.properties.NAME,
            stateId: feature.properties.STATE.toString(),
            countyId: feature.properties.COUNTY.toString()
        })),
        []
    );

    useEffect(() => {
        const filtered = allCounties.filter(county =>
            county.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const hasRankings = Object.keys(rankedCountyMap).length > 0;
        if (hasRankings) {
            filtered.sort((a, b) => {
                const aKey = `${a.name}, ga`.toLowerCase();
                const bKey = `${b.name}, ga`.toLowerCase();
                const aRank = rankedCountyMap[aKey]?.rank ?? Infinity;
                const bRank = rankedCountyMap[bKey]?.rank ?? Infinity;
                return aRank - bRank;
            });
        }

        setFilteredCounties(filtered);
        setShowDropdown(filtered.length > 0);
    }, [searchTerm, rankedCountyMap]);

    const handleCountySelect = (county: MapCounty) => {
        setCounty?.({
            name: county.name,
            stateId: county.stateId,
            countyId: county.countyId
        });
    };

    return (
        <div className="bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-emerald-100 relative">
            <label className="block text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold mb-2">
                County Search
            </label>
            <div className="relative">
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2"
                >
                    <path
                        fill="currentColor"
                        d="M10.5 3a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15m0 2a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11m10.2 13.8l-3.1-3.1a1 1 0 0 0-1.4 1.4l3.1 3.1a1 1 0 0 0 1.4-1.4"
                    />
                </svg>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search counties..."
                    className="w-72 pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-400 transition-all duration-200"
                />
            </div>
            {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-64 overflow-y-auto z-10">
                    {filteredCounties.map((county) => {
                        const rank = rankedCountyMap[`${county.name}, ga`.toLowerCase()]?.rank;
                        return (
                        <div
                            key={`${county.stateId}-${county.countyId}`}
                            onClick={() => handleCountySelect(county)}
                            className="p-3 hover:bg-emerald-50/80 cursor-pointer border-b border-slate-100 last:border-b-0 flex items-center justify-between transition-colors duration-200"
                        >
                            <p className="text-sm font-medium text-slate-700">{county.name}</p>
                            {rank !== undefined && (
                                <p className="text-xs text-emerald-700 font-semibold ml-2">#{rank}</p>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function contrastBorderColor(fillColor: string): string {
    let r: number, g: number, b: number;
    if (fillColor.startsWith("#")) {
        const hex = fillColor.slice(1);
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
    } else {
        const m = fillColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!m) return "#1e293b";
        [, r, g, b] = m.map(Number) as [string, number, number, number];
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#1e293b" : "#f8fafc";
}

/**
 * Renders the counties on our ReactLeaflet map. Depends on MapContextProvider.
 */
function RenderCounties(): React.JSX.Element {
    const geoJsonRef = useRef<L.GeoJSON>(null);

    const { county, setCounty, businessType, rankedCountyMap } = useMapState();

    // Keep a ref to the currently selected layer so we can restore its style
    const selectedLayerRef = useRef<L.Path | null>(null);

    // Mirror county in a ref so event-handler closures (set once) can read current value
    const countyRef = useRef(county);
    useEffect(() => { countyRef.current = county; }, [county]);

    // Ref to the latest getCountyStyle — updated synchronously each render so
    // event-handler closures (captured once at mount) always see current rankings.
    const getCountyStyleRef = useRef<(f: Feature<Geometry, any> | undefined) => object>(() => ({}));

    // Animated fill opacity: starts at 0 and fades in when ranked counties arrive
    const [animFillOpacity, setAnimFillOpacity] = useState(0);
    const animRef = useRef<number | null>(null);
    const prevRankedSizeRef = useRef(0);

    useEffect(() => {
        const currentSize = Object.keys(rankedCountyMap).length;
        const prevSize = prevRankedSizeRef.current;
        prevRankedSizeRef.current = currentSize;

        if (currentSize === 0) {
            if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
            setAnimFillOpacity(0);
            return;
        }

        if (prevSize === 0 && currentSize > 0) {
            if (animRef.current) cancelAnimationFrame(animRef.current);

            const duration = 1200;
            const targetOpacity = 0.75;
            const startTime = performance.now();

            function animate(now: number) {
                const progress = Math.min((now - startTime) / duration, 1);
                setAnimFillOpacity(progress * targetOpacity);
                if (progress < 1) {
                    animRef.current = requestAnimationFrame(animate);
                }
            }

            animRef.current = requestAnimationFrame(animate);
        }

        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [rankedCountyMap]);

    const getCountyStyle = useCallback(
        (feature: Feature<Geometry, any> | undefined) => {
            if (businessType) {
                const countyName = feature?.properties?.NAME;
                const countyKey = `${countyName}, ga`.toLowerCase();
                const rankedCounty = rankedCountyMap[countyKey];

                if (rankedCounty) {
                    const score = rankedCounty.score / 100;

                    let color: string;
                    if (score < 0.5) {
                        const norm = score * 2;
                        const r = 234 + (255 - 234) * norm;
                        const g = 88 + (255 - 88) * norm;
                        const b = 12 + (255 - 12) * norm;
                        color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
                    } else {
                        const norm = (score - 0.5) * 2;
                        const r = 255 - (255 - 13) * norm;
                        const g = 255 - (255 - 148) * norm;
                        const b = 255 - (255 - 136) * norm;
                        color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
                    }

                    return {
                        fillColor: color,
                        weight: 1.2,
                        opacity: 0.9,
                        color: "#64748b",
                        fillOpacity: animFillOpacity,
                    };
                }
            }

            return {
                fillColor: "#d6e7ff",
                weight: 1.2,
                opacity: 0.9,
                color: "#64748b",
                fillOpacity: 0.6,
            };
        },
        [businessType, rankedCountyMap, animFillOpacity]
    );

    // Synchronous update — no useEffect delay
    getCountyStyleRef.current = getCountyStyle;

    // Apply / remove the selection border whenever the selected county changes
    useEffect(() => {
        if (!geoJsonRef.current) return;

        if (selectedLayerRef.current) {
            const prev = selectedLayerRef.current as L.Path & { feature?: Feature };
            prev.setStyle(getCountyStyleRef.current(prev.feature));
            selectedLayerRef.current = null;
        }

        if (!county) return;

        geoJsonRef.current.eachLayer((layer) => {
            const path = layer as L.Path & { feature?: Feature };
            const props = path.feature?.properties;
            if (
                props?.STATE?.toString() === county.stateId &&
                props?.COUNTY?.toString() === county.countyId
            ) {
                const style = getCountyStyleRef.current(path.feature) as { fillColor?: string };
                const borderColor = contrastBorderColor(style.fillColor ?? "#d6e7ff");
                path.setStyle({ weight: 3, color: borderColor, opacity: 1 });
                path.bringToFront();
                selectedLayerRef.current = path;
            }
        });
    }, [county]);

    const onEachCounty: (feature: Feature, layer: L.Layer) => void = useCallback(
        (feature, layer) => {
            const name = feature.properties?.NAME;
            const countyId = feature.properties?.COUNTY?.toString() || "";
            const stateId = feature.properties?.STATE?.toString() || "";

            if (!name) return;

            const path = layer as L.Path;
            layer.bindTooltip(`${name} County`, {
                direction: "top",
                sticky: true,
                opacity: 0.95,
                className: "county-tooltip",
            });

            layer.on("mouseover", () => {
                const activeCounty = countyRef.current;
                const isSelected =
                    activeCounty?.stateId === stateId && activeCounty?.countyId === countyId;
                if (!isSelected) {
                    const nextFill = businessType ? Math.min(animFillOpacity + 0.08, 0.9) : 0.7;
                    path.setStyle({
                        weight: 2,
                        color: "#0f766e",
                        fillOpacity: nextFill,
                    });
                }
            });

            layer.on("mouseout", () => {
                const activeCounty = countyRef.current;
                const isSelected =
                    activeCounty?.stateId === stateId && activeCounty?.countyId === countyId;
                if (!isSelected) {
                    const featureWithProps = layer as L.Path & { feature?: Feature };
                    path.setStyle(getCountyStyleRef.current(featureWithProps.feature));
                }
            });

            layer.on("mousedown", () => {
                setCounty?.({ stateId, countyId, name });
            });
        },
        [setCounty, businessType, animFillOpacity]
    );

    return (
        <GeoJSON
            ref={geoJsonRef}
            data={countyData as GeoJsonObject}
            style={getCountyStyle}
            onEachFeature={onEachCounty}
        />
    );
}

function App() {
    return (
        <MapProvider>
            <div className="flex flex-row w-screen h-screen bg-gradient-to-br from-[#eef5f1] via-[#edf3f8] to-[#edf7f0] p-4 gap-4">
                <Sidebar />
                <div className="w-full flex flex-col relative">
                    <div className="bg-[#eef4ef] border border-emerald-100 rounded-3xl shadow-[0_12px_38px_rgba(15,23,42,0.08)] overflow-hidden h-full">
                        <MapContainer
                            center={[33.275, -84.441]}
                            minZoom={7.5}
                            zoom={8}
                            maxZoom={9}
                            scrollWheelZoom={false}
                            style={{
                                height: "100%",
                                width: "100%"
                            }}
                        >
                            <RenderCounties />
                        </MapContainer>
                    </div>
                </div>
                <div className="absolute top-4 right-4 z-1000 flex flex-col gap-3">
                    <div className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl flex flex-col gap-3 shadow-lg border border-emerald-100">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Data Legend</p>
                        <h1 className="font-semibold text-xl text-slate-800">Forecasted Growth</h1>
                        <div className="w-72 h-10 rounded-xl border border-slate-200 shadow-inner" style={{background: 'linear-gradient(to right, #ea580c, white, #0d9488)'}}></div>
                        <div className="grid grid-cols-2 text-xs text-slate-600 font-semibold uppercase tracking-wide">
                        <p style={{color: '#ea580c'}}>Decline</p>
                        <p className="text-right" style={{color: '#0d9488'}}>Growth</p>
                        </div>
                    </div>
                    <CountySearch />
                </div>
            </div>
        </MapProvider>
    );
}

export default App;
