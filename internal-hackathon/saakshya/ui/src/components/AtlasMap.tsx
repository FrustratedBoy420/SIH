import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre fetches its worker at runtime, and that worker imports a sibling
// shared chunk by relative path — so the pair has to ship verbatim, at stable
// names, or every GeoJSON source silently stays empty in a production build.
// scripts/copy-maplibre-worker.mjs puts them in public/ before dev and build.
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);
import {
  CLAIMS, CONFLICTS, DISTRICT, VILLAGE_RING, VILLAGES, VILLAGE_CENTER,
  evidenceStrength, isRecoverable, parcelRing, villageName,
} from "../engine/data";
import type { ClaimStatus } from "../engine/types";

export type Basemap = "terrain" | "imagery";
export interface AtlasFilters {
  status: Record<ClaimStatus, boolean>;
  types: Record<"IFR" | "CR" | "CFR", boolean>;
  conflicts: boolean;
  strength: boolean;
  parcels: boolean;
}

const claimsFC = () => ({
  type: "FeatureCollection" as const,
  features: CLAIMS.map((c) => ({
    type: "Feature" as const,
    id: undefined,
    geometry: { type: "Point" as const, coordinates: [c.geometry_centroid[1], c.geometry_centroid[0]] },
    properties: {
      id: c.claim_id, status: c.status, type: c.claim_type, cat: c.claimant_category,
      village: villageName(c.village_lgd), area: c.area_ha,
      strength: +evidenceStrength(c.claim_id).toFixed(3),
      recoverable: c.status === "rejected" && isRecoverable(c.claim_id) ? 1 : 0,
    },
  })),
});

const parcelsFC = () => ({
  type: "FeatureCollection" as const,
  features: CLAIMS.map((c) => ({
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [parcelRing(c)] },
    properties: { id: c.claim_id, status: c.status, type: c.claim_type, strength: +evidenceStrength(c.claim_id).toFixed(3) },
  })),
});

const villagesFC = () => ({
  type: "FeatureCollection" as const,
  features: VILLAGES.map((v) => ({
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [VILLAGE_RING[v.lgd_code]] },
    properties: { code: v.lgd_code, name: v.name },
  })),
});

const conflictFC = () => ({
  type: "FeatureCollection" as const,
  features: CONFLICTS.map((k) => {
    const a = CLAIMS.find((c) => c.claim_id === k.a)!;
    const b = CLAIMS.find((c) => c.claim_id === k.b)!;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [a.geometry_centroid[1], a.geometry_centroid[0]],
          [b.geometry_centroid[1], b.geometry_centroid[0]],
        ],
      },
      properties: { overlap: k.overlap_ha },
    };
  }),
});

const STATUS_MATCH: maplibregl.ExpressionSpecification = [
  "match", ["get", "status"],
  "granted", "#4FA86B",
  "pending", "#6E8BA8",
  "rejected", "#E8446B",
  "#8B9AA3",
];
const STRENGTH_RAMP: maplibregl.ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "strength"],
  0.2, "#3A2A30", 0.45, "#8C4A50", 0.65, "#C8763F", 0.8, "#D9A441", 0.95, "#8FC98A",
];

function styleFor(base: Basemap): maplibregl.StyleSpecification {
  const raster =
    base === "imagery"
      ? {
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          attribution: "Imagery — Esri, Maxar, Earthstar Geographics",
        }
      : {
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          ],
          attribution: "© OpenStreetMap contributors, © CARTO",
        };
  return {
    version: 8,
    sources: {
      base: { type: "raster", tileSize: 256, maxzoom: 18, ...raster },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#07090C" } },
      {
        id: "base",
        type: "raster",
        source: "base",
        paint: {
          "raster-opacity": base === "imagery" ? 0.60 : 0.85,
          "raster-saturation": base === "imagery" ? -0.62 : -0.3,
          "raster-contrast": base === "imagery" ? 0.16 : 0.1,
          "raster-brightness-max": base === "imagery" ? 0.58 : 0.95,
        },
      },
    ],
  };
}

export function AtlasMap({
  filters, basemap, selected, onSelect, onReady,
}: {
  filters: AtlasFilters;
  basemap: Basemap;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onReady?: (m: MLMap) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pulse = useRef(0);

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = new maplibregl.Map({
      container: host.current,
      style: styleFor(basemap),
      center: [DISTRICT.center[1], DISTRICT.center[0]],
      zoom: 10.1,
      minZoom: 9,
      maxZoom: 16.5,
      pitch: 0,
      attributionControl: { compact: true },
      dragRotate: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.scrollZoom.setWheelZoomRate(1 / 380);

    m.on("load", () => {
      m.addSource("villages", { type: "geojson", data: villagesFC() });
      m.addSource("parcels", { type: "geojson", data: parcelsFC() });
      m.addSource("claims", { type: "geojson", data: claimsFC() });
      m.addSource("conflicts", { type: "geojson", data: conflictFC() });

      m.addLayer({ id: "village-fill", type: "fill", source: "villages", paint: { "fill-color": "#7FD4D9", "fill-opacity": 0.035 } });
      m.addLayer({
        id: "village-line", type: "line", source: "villages",
        paint: { "line-color": "#3F5D68", "line-width": 1, "line-dasharray": [3, 3], "line-opacity": 0.7 },
      });

      m.addLayer({
        id: "conflict-line", type: "line", source: "conflicts",
        layout: { visibility: "none" },
        paint: { "line-color": "#E8446B", "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0.85 },
      });

      m.addLayer({
        id: "parcel-fill", type: "fill", source: "parcels",
        paint: {
          "fill-color": STATUS_MATCH,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 13.5, 0.22],
        },
      });
      m.addLayer({
        id: "parcel-line", type: "line", source: "parcels",
        paint: {
          "line-color": STATUS_MATCH,
          "line-width": 1.1,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 13.5, 0.9],
        },
      });

      // rejected claims carry a slow halo so the eye lands on them first
      m.addLayer({
        id: "claim-halo", type: "circle", source: "claims",
        filter: ["==", ["get", "status"], "rejected"],
        paint: {
          "circle-radius": 9, "circle-color": "#E8446B", "circle-opacity": 0.18,
          "circle-stroke-color": "#E8446B", "circle-stroke-width": 1, "circle-stroke-opacity": 0.35,
        },
      });
      m.addLayer({
        id: "claim-dot", type: "circle", source: "claims",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.6, 12, 4.6, 15, 7],
          "circle-color": STATUS_MATCH,
          "circle-stroke-color": "#07090C",
          "circle-stroke-width": 1,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 14.6, 0.35],
        },
      });
      m.addLayer({
        id: "claim-selected", type: "circle", source: "claims",
        filter: ["==", ["get", "id"], "___none___"],
        paint: {
          "circle-radius": 13, "circle-color": "transparent",
          "circle-stroke-color": "#F5EFE2", "circle-stroke-width": 1.6,
        },
      });

      for (const v of VILLAGES) {
        const el = document.createElement("div");
        el.className = "console pointer-events-none text-[8.5px] tracking-[0.2em] text-dim whitespace-nowrap";
        el.style.textShadow = "0 0 6px #07090C, 0 1px 2px #07090C";
        el.textContent = v.name.toUpperCase();
        new maplibregl.Marker({ element: el, offset: [0, -54] })
          .setLngLat([VILLAGE_CENTER[v.lgd_code][1], VILLAGE_CENTER[v.lgd_code][0]])
          .addTo(m);
      }

      for (const l of ["claim-dot", "claim-halo"]) {
        m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
        m.on("click", l, (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (f) onSelect(String(f.properties!.id));
        });
      }
      m.on("click", (e: MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ["claim-dot", "claim-halo", "parcel-fill"] });
        if (!hits.length) onSelect(null);
        else if (hits[0].layer.id === "parcel-fill") onSelect(String(hits[0].properties!.id));
      });

      // the halo breathes — slowly, once every four seconds
      const tick = () => {
        pulse.current += 0.016;
        if (m.getLayer("claim-halo")) {
          const k = (Math.sin(pulse.current * 1.5) + 1) / 2;
          m.setPaintProperty("claim-halo", "circle-radius", 8 + k * 7);
          m.setPaintProperty("claim-halo", "circle-opacity", 0.2 - k * 0.15);
          m.setPaintProperty("claim-halo", "circle-stroke-opacity", 0.45 - k * 0.35);
        }
        raf = requestAnimationFrame(tick);
      };
      let raf = requestAnimationFrame(tick);
      m.once("remove", () => cancelAnimationFrame(raf));
      const lons = CLAIMS.map((c) => c.geometry_centroid[1]);
      const lats = CLAIMS.map((c) => c.geometry_centroid[0]);
      m.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: { top: 120, bottom: 130, left: 320, right: 340 }, duration: 0 },
      );
      onReady?.(m);
    });

    // the container settles after the shell lays out
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host.current);
    requestAnimationFrame(() => m.resize());

    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* basemap swap keeps every overlay in place */
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource("base") as maplibregl.RasterTileSource | undefined;
    if (!src) return;
    const s = styleFor(basemap);
    const r = (s.sources.base as maplibregl.RasterSourceSpecification);
    src.setTiles(r.tiles!);
    m.setPaintProperty("base", "raster-opacity", basemap === "imagery" ? 0.6 : 0.85);
    m.setPaintProperty("base", "raster-saturation", basemap === "imagery" ? -0.62 : -0.3);
    m.setPaintProperty("base", "raster-contrast", basemap === "imagery" ? 0.16 : 0.1);
    m.setPaintProperty("base", "raster-brightness-max", basemap === "imagery" ? 0.58 : 0.95);
  }, [basemap]);

  /* filters */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const statuses = (Object.keys(filters.status) as ClaimStatus[]).filter((k) => filters.status[k]);
      const types = (Object.keys(filters.types) as ("IFR" | "CR" | "CFR")[]).filter((k) => filters.types[k]);
      const f: maplibregl.FilterSpecification = [
        "all",
        ["in", ["get", "status"], ["literal", statuses]],
        ["in", ["get", "type"], ["literal", types]],
      ];
      if (m.getLayer("claim-dot")) m.setFilter("claim-dot", f);
      if (m.getLayer("parcel-fill")) m.setFilter("parcel-fill", f);
      if (m.getLayer("parcel-line")) m.setFilter("parcel-line", f);
      if (m.getLayer("claim-halo"))
        m.setFilter("claim-halo", ["all", ["==", ["get", "status"], "rejected"], ["literal", filters.status.rejected]] as maplibregl.FilterSpecification);
      if (m.getLayer("conflict-line")) m.setLayoutProperty("conflict-line", "visibility", filters.conflicts ? "visible" : "none");
      if (m.getLayer("claim-dot")) m.setPaintProperty("claim-dot", "circle-color", filters.strength ? STRENGTH_RAMP : STATUS_MATCH);
      if (m.getLayer("parcel-fill")) m.setPaintProperty("parcel-fill", "fill-color", filters.strength ? STRENGTH_RAMP : STATUS_MATCH);
      if (m.getLayer("parcel-line")) m.setPaintProperty("parcel-line", "line-color", filters.strength ? STRENGTH_RAMP : STATUS_MATCH);
      if (m.getLayer("parcel-fill"))
        m.setPaintProperty("parcel-fill", "fill-opacity",
          filters.parcels ? 0.3 : (["interpolate", ["linear"], ["zoom"], 11.5, 0, 13.5, 0.22] as maplibregl.ExpressionSpecification));
      if (m.getLayer("parcel-line"))
        m.setPaintProperty("parcel-line", "line-opacity",
          filters.parcels ? 0.95 : (["interpolate", ["linear"], ["zoom"], 11.5, 0, 13.5, 0.9] as maplibregl.ExpressionSpecification));
    };
    if (m.isStyleLoaded()) apply(); else m.once("load", apply);
  }, [filters]);

  /* selection */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (m.getLayer("claim-selected"))
        m.setFilter("claim-selected", ["==", ["get", "id"], selected ?? "___none___"]);
      if (selected) {
        const c = CLAIMS.find((x) => x.claim_id === selected);
        if (c) m.easeTo({ center: [c.geometry_centroid[1], c.geometry_centroid[0]], zoom: Math.max(m.getZoom(), 12.4), duration: 900, padding: { right: 420 } });
      }
    };
    if (m.isStyleLoaded()) apply(); else m.once("load", apply);
  }, [selected]);

  return <div ref={host} className="h-full w-full" />;
}
