"""Classical computer vision primitives, on numpy alone.

Everything the specialist models need that is *not* learned lives here:
thresholding, connected components, morphology, speckle filtering, spectral
indices. No OpenCV, no scipy — both are heavy and neither is guaranteed on a
venue machine.

These are not placeholders for the vision models. They are the measurement
layer underneath them: a vision-language model can say *"there are buildings"*,
but the count, the area in hectares and the bounding boxes come from here, and
that separation is what lets the language layer be handed facts rather than
pixels (ADR-007).
"""

from __future__ import annotations

import numpy as np

# --------------------------------------------------------------------------- #
# thresholding
# --------------------------------------------------------------------------- #

def otsu_multi(x: np.ndarray, classes: int = 3, bins: int = 128) -> list[float]:
    """Multi-level Otsu: `classes - 1` thresholds by exhaustive search.

    Single-level Otsu answers "where is the best split into two groups?", which
    is the wrong question for a scene containing water, vegetation, soil *and*
    built-up. It lands between the two middle modes, so a mask built from it
    picks up the tail of a class you did not want.

    A real SAR scene has this exact structure — four scattering regimes, and
    only the brightest is structures. Taking the *upper* threshold of a
    three-class split isolates that mode instead of splitting the scene in half.

    Exhaustive over a 128-bin histogram: ~8k pairs, microseconds.
    """
    v = x[np.isfinite(x)].ravel()
    if v.size == 0:
        return [0.0] * (classes - 1)
    lo, hi = float(v.min()), float(v.max())
    if hi - lo < 1e-9:
        return [lo] * (classes - 1)

    hist, edges = np.histogram(v, bins=bins, range=(lo, hi))
    p = hist.astype(np.float64) / max(hist.sum(), 1)
    centres = (edges[:-1] + edges[1:]) / 2

    if classes == 2:
        return [otsu(x, bins)]

    # cumulative moments make each candidate split O(1)
    w = np.cumsum(p)
    m = np.cumsum(p * centres)

    def band(i: int, j: int) -> float:
        """Between-class contribution of bins (i, j]."""
        wt = w[j] - (w[i] if i >= 0 else 0.0)
        if wt < 1e-12:
            return 0.0
        mu = (m[j] - (m[i] if i >= 0 else 0.0)) / wt
        return wt * mu * mu

    best, best_pair = -1.0, (bins // 3, 2 * bins // 3)
    for i in range(1, bins - 2):
        b0 = band(-1, i)
        for j in range(i + 1, bins - 1):
            val = b0 + band(i, j) + band(j, bins - 1)
            if val > best:
                best, best_pair = val, (i, j)
    return [float(centres[best_pair[0]]), float(centres[best_pair[1]])]


def otsu(x: np.ndarray, bins: int = 256) -> float:
    """Otsu's threshold: the value that minimises intra-class variance.

    Used instead of a hand-picked constant so the change detector adapts to
    whatever the difference image actually looks like, rather than to whatever
    it looked like on the scene it was tuned on.
    """
    v = x[np.isfinite(x)].ravel()
    if v.size == 0:
        return 0.0
    lo, hi = float(v.min()), float(v.max())
    if hi - lo < 1e-9:
        return lo
    hist, edges = np.histogram(v, bins=bins, range=(lo, hi))
    p = hist.astype(np.float64) / max(hist.sum(), 1)
    centres = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(p)
    w1 = 1.0 - w0
    m0 = np.cumsum(p * centres) / np.where(w0 < 1e-12, 1, w0)
    total = float((p * centres).sum())
    m1 = (total - np.cumsum(p * centres)) / np.where(w1 < 1e-12, 1, w1)
    between = w0 * w1 * (m0 - m1) ** 2
    return float(centres[int(np.argmax(between))])


# --------------------------------------------------------------------------- #
# morphology  (separable, so O(n) in the kernel size)
# --------------------------------------------------------------------------- #

def _shift_or(m: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(m)
    ys = slice(max(0, dy), m.shape[0] + min(0, dy))
    xs = slice(max(0, dx), m.shape[1] + min(0, dx))
    yt = slice(max(0, -dy), m.shape[0] + min(0, -dy))
    xt = slice(max(0, -dx), m.shape[1] + min(0, -dx))
    out[yt, xt] = m[ys, xs]
    return out


def dilate(mask: np.ndarray, r: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        acc = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc |= _shift_or(out, dy, dx)
        out = acc
    return out


def erode(mask: np.ndarray, r: int = 1) -> np.ndarray:
    return ~dilate(~mask, r)


def opening(mask: np.ndarray, r: int = 1) -> np.ndarray:
    """Erode then dilate: removes speckle smaller than the kernel."""
    return dilate(erode(mask, r), r)


def closing(mask: np.ndarray, r: int = 1) -> np.ndarray:
    """Dilate then erode: fills holes smaller than the kernel."""
    return erode(dilate(mask, r), r)


def box_blur(x: np.ndarray, r: int) -> np.ndarray:
    """Separable box blur via summed-area table. O(1) per pixel in r."""
    if r < 1:
        return x
    pad = np.pad(x.astype(np.float64), r + 1, mode="edge")
    s = pad.cumsum(0).cumsum(1)
    k = 2 * r + 1
    h, w = x.shape
    a = s[k:k + h, k:k + w]
    b = s[0:h, k:k + w]
    c = s[k:k + h, 0:w]
    d = s[0:h, 0:w]
    return ((a - b - c + d) / (k * k)).astype(np.float32)


# --------------------------------------------------------------------------- #
# connected components  (two-pass, union-find)
# --------------------------------------------------------------------------- #

def connected_components(mask: np.ndarray, connectivity: int = 8
                         ) -> tuple[np.ndarray, int]:
    """Label 4- or 8-connected regions. Returns (labels, count).

    Run-based union-find rather than the textbook per-pixel scan.

    The naive two-pass algorithm visits every foreground pixel in Python, which
    at 512x512 is a quarter of a million interpreter iterations and took ~8.9 s
    inside a single query — most of the end-to-end latency, and far outside the
    demo budget.

    This version encodes each row as horizontal *runs* using numpy, then unions
    only runs that vertically overlap. A scene with a few thousand runs replaces
    a quarter-million pixel visits, and the per-pixel work that remains
    (extracting runs, painting labels) is vectorised. Measured ~60x faster on
    the demo scene, with byte-identical output.

    scipy.ndimage.label would also do this, but scipy is a heavy dependency that
    a venue machine may not have -- see the module docstring.
    """
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    if not mask.any():
        return labels, 0

    # ---- 1. horizontal runs per row, found with a single diff per row -------
    # runs[r] = list of (start, end_exclusive, run_id)
    runs: list[tuple[int, int, int, int]] = []          # (row, s, e, id)
    row_runs: list[list[int]] = [[] for _ in range(h)]
    padded = np.zeros((h, w + 2), bool)
    padded[:, 1:-1] = mask
    diff = np.diff(padded.astype(np.int8), axis=1)
    for r in range(h):
        starts = np.flatnonzero(diff[r] == 1)
        ends = np.flatnonzero(diff[r] == -1)
        for s, e in zip(starts, ends):
            row_runs[r].append(len(runs))
            runs.append((r, int(s), int(e), len(runs)))

    n_runs = len(runs)
    if n_runs == 0:
        return labels, 0

    # ---- 2. union runs that touch vertically --------------------------------
    parent = list(range(n_runs))

    def find(x: int) -> int:
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    # 8-connectivity lets a run touch a neighbour that only meets it diagonally,
    # so widen the overlap test by one column on each side.
    slack = 1 if connectivity == 8 else 0
    for r in range(1, h):
        above, here = row_runs[r - 1], row_runs[r]
        if not above or not here:
            continue
        i = j = 0
        while i < len(above) and j < len(here):
            _, s0, e0, id0 = runs[above[i]]
            _, s1, e1, id1 = runs[here[j]]
            if s1 - slack < e0 and s0 - slack < e1:      # they overlap
                union(id0, id1)
            if e0 <= e1:
                i += 1
            else:
                j += 1

    # ---- 3. paint, renumbering roots to 1..n in first-seen order ------------
    remap: dict[int, int] = {}
    count = 0
    for (r, s, e, rid) in runs:
        root = find(rid)
        lab = remap.get(root)
        if lab is None:
            count += 1
            lab = remap[root] = count
        labels[r, s:e] = lab
    return labels, count


def region_props(labels: np.ndarray, count: int, min_area: int = 0) -> list[dict]:
    """Per-region area, bounding box and centroid, largest first.

    One vectorised pass over the label image rather than `count` full-array
    comparisons -- the old form was O(labels x pixels) and dominated runtime on
    scenes with many small regions.
    """
    if count == 0:
        return []
    flat = labels.ravel()
    keep = flat > 0
    if not keep.any():
        return []

    lab = flat[keep]
    ys, xs = np.divmod(np.flatnonzero(keep), labels.shape[1])

    areas = np.bincount(lab, minlength=count + 1)
    min_x = np.full(count + 1, labels.shape[1], np.int64)
    max_x = np.full(count + 1, -1, np.int64)
    min_y = np.full(count + 1, labels.shape[0], np.int64)
    max_y = np.full(count + 1, -1, np.int64)
    np.minimum.at(min_x, lab, xs)
    np.maximum.at(max_x, lab, xs)
    np.minimum.at(min_y, lab, ys)
    np.maximum.at(max_y, lab, ys)
    sum_x = np.bincount(lab, weights=xs, minlength=count + 1)
    sum_y = np.bincount(lab, weights=ys, minlength=count + 1)

    props = []
    for i in range(1, count + 1):
        a = int(areas[i])
        if a == 0 or a < min_area:
            continue
        bw = int(max_x[i] - min_x[i] + 1)
        bh = int(max_y[i] - min_y[i] + 1)
        props.append({
            "label": i,
            "area_px": a,
            "bbox": [int(min_x[i]), int(min_y[i]), int(max_x[i]), int(max_y[i])],
            "centroid": [float(sum_x[i] / a), float(sum_y[i] / a)],
            "extent": float(a / max(bw * bh, 1)),
        })
    props.sort(key=lambda p: -p["area_px"])
    return props


# --------------------------------------------------------------------------- #
# SAR
# --------------------------------------------------------------------------- #

def lee_filter(img: np.ndarray, size: int = 5, looks: int = 4) -> np.ndarray:
    """Lee speckle filter.

    SAR speckle is *multiplicative*, so an averaging filter that would suit
    additive noise destroys edges here. Lee adapts: where local variance is
    close to what pure speckle would produce it smooths hard, and where it is
    higher — meaning real structure — it leaves the pixel alone.

    This is why the built-up cluster survives filtering while the field
    interiors go smooth, and it is what makes the backscatter threshold
    downstream meaningful.
    """
    r = size // 2
    mean = box_blur(img, r)
    sq = box_blur(img * img, r)
    var = np.maximum(sq - mean * mean, 0)
    cu2 = 1.0 / looks                       # speckle coefficient of variation²
    ci2 = var / np.maximum(mean * mean, 1e-8)
    w = np.clip(1.0 - cu2 / np.maximum(ci2, 1e-8), 0.0, 1.0)
    return (mean + w * (img - mean)).astype(np.float32)


def to_db(linear: np.ndarray, floor: float = 1e-4) -> np.ndarray:
    """Backscatter in decibels — the unit SAR is actually read in."""
    return (10.0 * np.log10(np.maximum(linear, floor))).astype(np.float32)


def percentile_stretch(x: np.ndarray, lo: float = 2.0, hi: float = 98.0
                       ) -> np.ndarray:
    """Linear stretch between two percentiles, for display only.

    Raw SAR backscatter is concentrated near zero — water and smooth ground sit
    at the bottom of the range and a handful of corner reflectors occupy the
    top. Displayed unstretched it reads as a near-black rectangle, which makes
    the optical/SAR comparison impossible to see even though the data is fine.

    Every SAR viewer applies this. It changes nothing about the analysis, which
    always runs on the linear values.
    """
    v = x[np.isfinite(x)]
    if v.size == 0:
        return x
    a, b = np.percentile(v, [lo, hi])
    if b - a < 1e-9:
        return np.clip(x, 0, 1)
    return np.clip((x - a) / (b - a), 0, 1).astype(np.float32)


# --------------------------------------------------------------------------- #
# spectral indices
# --------------------------------------------------------------------------- #

def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Normalised Difference Vegetation Index. High for vegetation."""
    return ((nir - red) / np.maximum(nir + red, 1e-6)).astype(np.float32)


def ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Normalised Difference Water Index. High for water."""
    return ((green - nir) / np.maximum(green + nir, 1e-6)).astype(np.float32)


def cloud_mask(rgb_nir: np.ndarray, thresh: float = 0.85,
               spread_max: float = 0.08, ndvi_max: float = 0.12) -> np.ndarray:
    """Cloud: bright, spectrally flat, and carrying no vegetation signal.

    Three conditions, because brightness alone is not enough — bright bare soil
    passes it and gets falsely called cloud, which then inflates every claim
    resting on "how much of the optical scene is unusable". Since the headline
    cross-modal claim is *structures recovered beneath cloud*, a false cloud
    pixel directly inflates the thing we most want to be trustworthy.

    So the thresholds are tuned for **precision over recall**. Measured against
    the generator's own opacity field:

        brightness   precision   recall   F1
           0.62        0.622      0.978   0.760
           0.78        0.888      0.978   0.931
           0.85        1.000      0.923   0.960    <- chosen
           0.90        1.000      0.793   0.884

    At 0.85 every pixel called cloud really is cloud. The 7.7% of thin cloud
    missed is the correct thing to give up: it costs a little recovery credit,
    where the alternative would be claiming recovery that did not happen.

    The NDVI condition is what separates cloud from soil. Soil retains a real
    red/NIR difference (|NDVI| ~ 0.19 in the transition band); cloud reflects
    almost equally across every band and its NDVI collapses toward zero
    (~0.02 where opacity exceeds 0.25).
    """
    r, g, b = rgb_nir[0], rgb_nir[1], rgb_nir[2]
    brightness = (r + g + b) / 3.0
    spread = np.max(rgb_nir[:3], axis=0) - np.min(rgb_nir[:3], axis=0)
    flat = spread < spread_max

    if rgb_nir.shape[0] >= 4:
        veg = np.abs(ndvi(rgb_nir[3], r)) < ndvi_max
    else:
        veg = np.ones_like(brightness, bool)

    return (brightness > thresh) & flat & veg


# --------------------------------------------------------------------------- #
# change
# --------------------------------------------------------------------------- #

def change_vector(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Change Vector Analysis magnitude across bands.

    Per-pixel Euclidean distance between the two spectral vectors. Standard in
    remote sensing because it uses every band rather than collapsing to one,
    and it produces a continuous magnitude that Otsu can then split.
    """
    n = min(a.shape[0], b.shape[0])
    d = a[:n].astype(np.float32) - b[:n].astype(np.float32)
    return np.sqrt((d * d).sum(axis=0)).astype(np.float32)
