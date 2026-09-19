"""Raster primitives: box statistics, speckle filtering, morphology, labelling,
contour tracing. numpy only, no scipy.
"""

from __future__ import annotations

from collections import deque

import numpy as np


def _integral(a: np.ndarray) -> np.ndarray:
    s = np.zeros((a.shape[0] + 1, a.shape[1] + 1), dtype=float)
    s[1:, 1:] = a.cumsum(0).cumsum(1)
    return s


def box_mean(a: np.ndarray, r: int) -> np.ndarray:
    """Mean over a (2r+1)^2 window, edges handled by shrinking the window."""
    h, w = a.shape
    s = _integral(a)
    o = _integral(np.ones_like(a, dtype=float))
    ys = np.clip(np.arange(h) - r, 0, h)
    ye = np.clip(np.arange(h) + r + 1, 0, h)
    xs = np.clip(np.arange(w) - r, 0, w)
    xe = np.clip(np.arange(w) + r + 1, 0, w)
    tot = s[ye][:, xe] - s[ys][:, xe] - s[ye][:, xs] + s[ys][:, xs]
    cnt = o[ye][:, xe] - o[ys][:, xe] - o[ye][:, xs] + o[ys][:, xs]
    return tot / np.maximum(cnt, 1.0)


def box_mean_std(a: np.ndarray, r: int):
    m = box_mean(a, r)
    m2 = box_mean(a * a, r)
    return m, np.sqrt(np.maximum(m2 - m * m, 0.0))


def lee_filter(img: np.ndarray, r: int = 3, looks: float = 4.0) -> np.ndarray:
    """Lee speckle filter.

    Speckle in SAR is multiplicative: I = R * n with E[n]=1, Var[n]=1/L.
    The estimator shrinks each pixel toward its local mean by the fraction of
    local variance that cannot be explained by speckle alone.
    """
    m, s = box_mean_std(img, r)
    var = s * s
    cu2 = 1.0 / looks
    k = np.maximum(0.0, (var - m * m * cu2)) / np.maximum(var, 1e-12)
    return m + k * (img - m)


def refined_lee(img: np.ndarray, r: int = 3, looks: float = 4.0) -> np.ndarray:
    """Directional variant: keep the plain Lee estimate where the neighbourhood
    is homogeneous, and fall back to the raw pixel where a strong edge runs
    through the window, so boundaries survive.

    Edge preservation matters more here than anywhere else in the pipeline:
    edge sharpness is the primary look-alike discriminator (PRD 10.3).
    """
    sm = lee_filter(img, r, looks)
    gy, gx = np.gradient(box_mean(img, r))
    g = np.hypot(gx, gy)
    thr = np.percentile(g, 97.0)
    edge = g > thr
    return np.where(edge, img, sm)


def gradient_magnitude(a: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(a)
    return np.hypot(gx, gy)


def dilate(mask: np.ndarray, it: int = 1) -> np.ndarray:
    m = mask.copy()
    for _ in range(it):
        out = m.copy()
        out[1:, :] |= m[:-1, :]
        out[:-1, :] |= m[1:, :]
        out[:, 1:] |= m[:, :-1]
        out[:, :-1] |= m[:, 1:]
        m = out
    return m


def erode(mask: np.ndarray, it: int = 1) -> np.ndarray:
    return ~dilate(~mask, it)


def close(mask: np.ndarray, it: int = 1) -> np.ndarray:
    return erode(dilate(mask, it), it)


def label(mask: np.ndarray, connectivity: int = 8):
    """Connected-component labelling. Returns (labels, count); 0 is background."""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    if connectivity == 8:
        nbr = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    else:
        nbr = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        cur += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = cur
        while q:
            y, x = q.popleft()
            for dy, dx in nbr:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    q.append((ny, nx))
    return lab, cur


def trace_boundary(mask: np.ndarray):
    """Moore-neighbourhood contour trace of the outer boundary of one blob.

    Returns pixel (col, row) pairs in order. Used to turn a detection mask into
    a polygon (CH-3); a convex hull would invent water the slick never covered.
    """
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return np.zeros((0, 2))
    start = (int(ys.min()), int(xs[ys == ys.min()].min()))
    nbr8 = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    h, w = mask.shape

    def solid(p):
        return 0 <= p[0] < h and 0 <= p[1] < w and mask[p[0], p[1]]

    contour = [start]
    cur = start
    b_idx = 6  # came from the west
    guard = 0
    limit = 8 * int(mask.sum()) + 64
    while guard < limit:
        guard += 1
        found = False
        for k in range(8):
            i = (b_idx + 1 + k) % 8
            cand = (cur[0] + nbr8[i][0], cur[1] + nbr8[i][1])
            if solid(cand):
                b_idx = (i + 4) % 8  # back-track direction, pointing at the pixel we left
                cur = cand
                contour.append(cur)
                found = True
                break
        if not found:
            break
        if cur == start and len(contour) > 2:
            break
    pts = np.array([[c[1], c[0]] for c in contour], dtype=float)
    return pts


def perimeter_pixels(mask: np.ndarray) -> float:
    """8-connectivity perimeter with the diagonal correction."""
    b = mask & ~erode(mask, 1)
    n = int(b.sum())
    if n == 0:
        return 0.0
    # straight vs diagonal steps along the traced contour
    c = trace_boundary(mask)
    if len(c) < 2:
        return float(n)
    d = np.linalg.norm(np.diff(c, axis=0), axis=1)
    return float(d.sum())
