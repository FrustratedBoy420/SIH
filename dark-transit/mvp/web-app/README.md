# The workstation

React 19 · Vite · TypeScript · MapLibre GL. It reads one run and renders it.

```bash
npm install
npm run build                                   # dist/, served by cli serve
node verify.mjs http://127.0.0.1:8000           # 24 headless checks + screenshots
```

Development, with the pipeline on another port:

```bash
python3 -m darktransit.cli serve                # terminal 1 — API on :8000
npm run dev                                     # terminal 2 — UI on :5173, proxying
```

## The rule

The app holds no incident knowledge of its own. Every number on screen came out
of `run.json`, which is why the same view serves any scenario the pipeline can
produce — including the ones that halt at a gate and emit no raster at all.

`verify.mjs` checks that claim rather than trusting it: it fetches the run from
the API and asserts that no vessel name, MMSI or detection timestamp from it
appears anywhere in the built bundle. A hardcoded number would survive any
amount of clicking and fails this in a second.

## Two things that are not obvious

**No basemap.** No tile server is reachable at a venue, and a chart that needs
one is a chart that fails when it matters. The sea is a flat fill, the land is
the run's own coastline, and the imagery is the run's own georeferenced SAR
raster. Everything drawn is evidence.

**The time control plots its own uncertainty.** Its track is not a groove — it
is r95, the radius containing 95 % of the particle cloud, against time. Scrub
back and the envelope widens beneath the handle, 3.4 km at detection to 14.1 km
forty hours earlier. Backward drift diverges, and a workstation that drew a
confident dot at the origin would be hiding the one fact an analyst most needs.

## Colour

The palette is the IHO S-52 night colour table that ECDIS displays switch to
after dark. Magenta is not decoration: on an Admiralty chart it is the overprint
colour for everything *regulated or reported*, and here it marks the origin
region and the ranked suspects. `src/index.css` carries the reasoning.
