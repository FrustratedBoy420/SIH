# ADR-009 — PostgreSQL + PostGIS; rasters in object storage

**Status:** Proposed
**Date:** 2026-09-09

## Context

The system produces results carrying real geometry — bounding boxes and change masks converted from pixel coordinates to EPSG:4326 via the GeoTIFF geotransform. Useful questions about those results are spatial: *"show every detected change within this district."*

Separately, the imagery itself is large. A single Sentinel-2 scene runs to hundreds of megabytes.

## Decision

**PostgreSQL + PostGIS** for metadata, geometry and results. **S3-compatible object storage** for rasters. Imagery is never stored as a database blob.

## Alternatives considered

**MongoDB.** Rejected: geospatial support is materially weaker than PostGIS, and the query patterns here are spatial joins rather than document lookups.

**SQLite + SpatiaLite.** A reasonable MVP choice — one file, no service, trivially portable to a venue laptop. Rejected for the main path because the scalability story is part of the pitch, but see *Revisit* below.

**Rasters as database blobs.** Rejected outright. It inflates backups, slows every query and provides nothing a filesystem or object store does not.

## Consequences

**+** Spatial queries come free rather than as application code.
**+** Standard, well understood, and the obvious choice to a geospatial audience.

**−** One more service in `docker compose`, and one more thing that can fail at a venue.

## Revisit if

The MVP stays single-machine through December. In that case SpatiaLite is a defensible simplification for the demo build, provided the schema stays portable and the choice is stated rather than hidden.
