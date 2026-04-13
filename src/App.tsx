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
    const { setCounty } = useMapState();

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
        )

        setFilteredCounties(filtered);
        setShowDropdown(filtered.length > 0);
    }, [searchTerm]);

    const handleCountySelect = (county: MapCounty) => {
        setCounty?.({
            name: county.name,
            stateId: county.stateId,
            countyId: county.countyId
        });
    };

    return (
        <div className="bg-white p-3 rounded-xl shadow-md relative">
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search counties..."
                className="w-60 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-md max-h-60 overflow-y-auto z-10">
                    {filteredCounties.map((county) => (
                        <div
                            key={`${county.stateId}-${county.countyId}`}
                            onClick={() => handleCountySelect(county)}
                            className="p-3 hover:bg-blue-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                        >
                            <p className="text-sm font-medium">{county.name}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
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
                        weight: 1.5,
                        opacity: 0.9,
                        color: "#475569",
                        fillOpacity: 0.75,
                    };
                }
            }

            return {
                fillColor: "#d6e7ff",
                weight: 1.5,
                opacity: 0.9,
                color: "#475569",
                fillOpacity: 0.6,
            };
        },
        [businessType, rankedCountyMap]
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
                path.setStyle({ weight: 2.5, color: "#2b236b", opacity: 1 });
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

            layer.on("mousedown", () => {
                setCounty?.({ stateId, countyId, name });
            });
        },
        [setCounty]
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
            <div className="flex flex-row w-screen h-screen">
                <Sidebar />
                <div className="w-full flex flex-col">
                    <MapContainer
                        center={[33.275, -84.441]}
                        minZoom={7.5}
                        zoom={8}
                        maxZoom={9}
                        scrollWheelZoom={false}
                        style={{
                            height: "100vh",
                            width: "100%"
                        }}
                    >
                        <RenderCounties />
                    </MapContainer>
                </div>
            </div>
            <div className="absolute top-3 right-3 z-1000 flex flex-col gap-2">
                <div className="bg-white p-3 rounded-xl flex flex-col gap-2 shadow-md">
                    <h1 className="font-bold text-xl text-center">Forecasted Growth</h1>
                    <div className="w-60 h-10 rounded-lg border border-slate-200 shadow-sm" style={{background: 'linear-gradient(to right, #ea580c, white, #0d9488)'}}></div>
                    <div className="grid grid-cols-2 text-xs text-slate-600 font-medium">
                        <p style={{color: '#ea580c'}}>Decline</p>
                        <p className="text-right" style={{color: '#0d9488'}}>Growth</p>
                    </div>
                </div>
                <CountySearch />
            </div>
        </MapProvider>
    );
}

export default App;
