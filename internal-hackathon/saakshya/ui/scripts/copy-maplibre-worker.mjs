/* MapLibre loads its worker from a URL at runtime, and that worker imports a
   sibling shared chunk by relative path. Neither survives Vite's bundling —
   the files are either not emitted, or emitted under hashed names the
   relative import can no longer resolve, and every GeoJSON source then stays
   silently empty in a production build.

   Copy both files verbatim into public/ so they ship at stable paths and keep
   resolving each other. Run automatically before dev and before build. */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "node_modules/maplibre-gl/dist");
const to = resolve(root, "public/maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(to, { recursive: true });
for (const f of files) await copyFile(resolve(from, f), resolve(to, f));
console.log(`maplibre worker → public/maplibre/ (${files.join(", ")})`);
