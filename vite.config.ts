import tailwindcss from '@tailwindcss/vite'

import react from '@vitejs/plugin-react'
import { copyFileSync, createReadStream, existsSync, mkdirSync } from "fs"
import path from "path"
import { defineConfig } from 'vite'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite"
import { fetchCountyBusinessesServer } from "./server/googlePlaces"

function createBusinessApiMiddleware(): Connect.NextHandleFunction {
    return async (req, res, next) => {
        if (!req.url?.startsWith("/api/businesses")) {
            return next();
        }

        if (req.method !== "GET") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
        }

        const requestUrl = new URL(req.url, "http://localhost");
        const countyName = requestUrl.searchParams.get("countyName");
        const stateId = requestUrl.searchParams.get("stateId");
        const businessType = requestUrl.searchParams.get("businessType");
        const radiusMeters = requestUrl.searchParams.get("radiusMeters");

        if (!countyName || !stateId || !businessType) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing countyName, stateId, or businessType." }));
            return;
        }

        try {
            const businesses = await fetchCountyBusinessesServer({
                countyName,
                stateId,
                businessType,
                radiusMeters: radiusMeters ? Number(radiusMeters) : undefined,
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ businesses }));
        } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unable to fetch businesses from Google Maps.",
                })
            );
        }
    };
}

function businessesApiPlugin(): Plugin {
    const handler = createBusinessApiMiddleware();
    return {
        name: "terratrends-businesses-api",
        configureServer(server: ViteDevServer) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server: PreviewServer) {
            server.middlewares.use(handler);
        },
    };
}

// ---------------------------------------------------------------------------
// Plugin: serve analysis CSV data files at /data/* during dev + preview,
// and copy them into dist/data/ after the production build.
// ---------------------------------------------------------------------------

const ANALYSIS_DATA_FILES: [string, string][] = [
    [path.resolve(__dirname, "analysis/data/merged_data_v2.csv"),                    "merged_data_v2.csv"],
    [path.resolve(__dirname, "analysis/data/qcew_long.csv"),                         "qcew_long.csv"],
    [path.resolve(__dirname, "analysis/train_inference_scripts/static_forecasts.csv"), "static_forecasts.csv"],
];

function createAnalysisDataMiddleware(): Connect.NextHandleFunction {
    return (req, res, next) => {
        if (!req.url?.startsWith("/data/")) return next();

        const filename = req.url.slice("/data/".length).split("?")[0];
        const entry = ANALYSIS_DATA_FILES.find(([, name]) => name === filename);
        if (!entry) return next();

        const [srcPath] = entry;
        if (!existsSync(srcPath)) return next();

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        createReadStream(srcPath).pipe(res as unknown as NodeJS.WritableStream);
    };
}

function analysisDataPlugin(): Plugin {
    const handler = createAnalysisDataMiddleware();
    return {
        name: "terratrends-analysis-data",
        configureServer(server: ViteDevServer) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server: PreviewServer) {
            server.middlewares.use(handler);
        },
        closeBundle() {
            const distData = path.resolve(__dirname, "dist/data");
            if (!existsSync(distData)) mkdirSync(distData, { recursive: true });
            for (const [srcPath, name] of ANALYSIS_DATA_FILES) {
                if (existsSync(srcPath)) {
                    copyFileSync(srcPath, path.join(distData, name));
                }
            }
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        businessesApiPlugin(),
        analysisDataPlugin(),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    }
})
