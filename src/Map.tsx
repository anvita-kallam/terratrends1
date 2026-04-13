import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchCountyBusinesses } from "./lib/googlePlaces";
import { fetchCountyRankings } from "./services/inferenceApi";
import type { BusinessPlace, InferenceRequest, RankedCounty } from "./types/businesses";

export type MapCounty = {
    stateId: string;
    countyId: string;
    name: string;
};
//antony
export type CountyRankingMap = Record<string, RankedCounty>;

const MapContext = createContext<{
    // Represented by tuple of state id, and county id
    county: MapCounty | null;
    setCounty: (county: MapCounty) => void;

    businessType: string | null;
    setBusinessType: (businessType: string) => void;

    businesses: BusinessPlace[];
    isFetchingBusinesses: boolean;
    businessError: string | null;

    //antony
    inferenceInputs: InferenceRequest | null;
    rankedCounties: RankedCounty[];
    rankedCountyMap: CountyRankingMap;
    isRunningInference: boolean;
    inferenceError: string | null;
    runInference: (payload: InferenceRequest) => Promise<void>;
    clearInferenceResults: () => void;
    selectedCountyResult: RankedCounty | null;
}>({
    county: null,
    setCounty: () => {},

    businessType: null,
    setBusinessType: () => {},

    businesses: [],
    isFetchingBusinesses: false,
    businessError: null,

    //antony
    inferenceInputs: null,
    rankedCounties: [],
    rankedCountyMap: {},
    isRunningInference: false,
    inferenceError: null,
    runInference: async () => {},
    clearInferenceResults: () => {},
    selectedCountyResult: null,
});

type MapState = {
    county: MapCounty | null;
    businessType: string | null;
};

export function MapProvider({ children }: React.PropsWithChildren) {
    const [mapState, setMapState] = useState<MapState>({
        county: null,
        businessType: null,
    });

	// business competition metric logic
    const [businesses, setBusinesses] = useState<BusinessPlace[]>([]);
    const [isFetchingBusinesses, setIsFetchingBusinesses] = useState(false);
    const [businessError, setBusinessError] = useState<string | null>(null);

    const [inferenceInputs, setInferenceInputs] = useState<InferenceRequest | null>(null);
    const [rankedCounties, setRankedCounties] = useState<RankedCounty[]>([]);
    const [isRunningInference, setIsRunningInference] = useState(false);
    const [inferenceError, setInferenceError] = useState<string | null>(null);

    const rankedCountyMap = useMemo<CountyRankingMap>(() => {
            return rankedCounties.reduce<CountyRankingMap>((acc, county) => {
                acc[county.county.trim().toLowerCase()] = county;
                return acc;
            }, {});
    }, [rankedCounties]);

    const selectedCountyResult = useMemo(() => {
            if (!mapState.county) return null;

            const countyKey = `${mapState.county.name}, ga`.toLowerCase();
            return rankedCountyMap[countyKey] ?? null;
    }, [mapState.county, rankedCountyMap]);

    const rankedCountiesRef = useRef(rankedCounties);
    useEffect(() => { rankedCountiesRef.current = rankedCounties; }, [rankedCounties]);

    //antony
    const setCountyWithBusinessTypeCheck = useCallback((county: MapCounty) => {
            setMapState((s) => {
                if (rankedCountiesRef.current.length === 0) return s;

                return {
                    businessType: s.businessType,
                    county
                };
            });
    }, [setMapState]);

    const runInference = useCallback(async (payload: InferenceRequest) => {
        setIsRunningInference(true);
        setInferenceError(null);

        try {
            const results = await fetchCountyRankings(payload);

            setInferenceInputs(payload);
            setRankedCounties(results);

            setMapState((s) => ({
                ...s,
                businessType: payload.sector,
                county: results.length > 0
                    ? {
                        name: results[0].county.replace(", GA", ""),
                        stateId: "13",
                        countyId: s.county?.countyId ?? "",
                    }
                    : s.county,
            }));
        } catch (error) {
            setInferenceError(
                error instanceof Error
                    ? error.message
                    : "Unable to fetch ranked county results."
            );
            setRankedCounties([]);
        } finally {
            setIsRunningInference(false);
        }
    }, []);

    const clearInferenceResults = useCallback(() => {
        setInferenceInputs(null);
        setRankedCounties([]);
        setInferenceError(null);

        setMapState((s) => ({
            ...s,
            county: null,
        }));
    }, []);

    useEffect(() => {
        if (!mapState.county || !mapState.businessType) {
            setBusinesses([]);
            setIsFetchingBusinesses(false);
            setBusinessError(null);
            return;
        }

        let cancelled = false;

        async function loadBusinesses() {
            if (!mapState.county || !mapState.businessType) return;

            setIsFetchingBusinesses(true);
            setBusinessError(null);

            try {
                const results = await fetchCountyBusinesses({
                    countyName: mapState.county.name,
                    stateId: mapState.county.stateId,
                    businessType: mapState.businessType,
                });

                if (!cancelled) {
                    setBusinesses(results);
                }
            } catch (error) {
                if (!cancelled) {
                    setBusinessError(
                        error instanceof Error
                            ? error.message
                            : "Unable to fetch businesses for this county."
                    );
                    setBusinesses([]);
                }
            } finally {
                if (!cancelled) {
                    setIsFetchingBusinesses(false);
                }
            }
        }

        void loadBusinesses();

        return () => {
            cancelled = true;
        };
    }, [mapState.county, mapState.businessType]);

    return (
        <MapContext.Provider
            value={{
                county: mapState.county,
                setCounty: setCountyWithBusinessTypeCheck,

                businessType: mapState.businessType,
                setBusinessType: (b) => {
                    setMapState((s) => {
                        return {
                            businessType: b,
                            county: s.county
                        };
                    });
                },

                businesses,
                isFetchingBusinesses,
                businessError,
                inferenceInputs,
                rankedCounties,
                rankedCountyMap,
                isRunningInference,
                inferenceError,
                runInference,
                clearInferenceResults,
                selectedCountyResult,
            }}
        >
            {children}
        </MapContext.Provider>
    );
}

export function useMapState() {
    return useContext(MapContext);
}
