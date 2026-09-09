"""A stdlib HTTP server standing in for the FastAPI service of PRD 12.

Same routes, same contract. `/rescore` is deliberately a pure function of
stored artefacts -- weights change ranking and nothing upstream of stage 7
depends on them -- which is what lets a weight slider re-rank instantly instead
of re-running the pipeline.

There is no transmit endpoint. Sending a dossier to an enforcement body is a
human action with a human name attached (NFR-4).
"""

from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from . import score as scoring

MVP = Path(__file__).resolve().parent.parent
WEB = MVP / "web"

# The built React + MapLibre workstation, when it has been built. It is served
# from the same origin as the API on purpose -- one port, no CORS, and nothing
# to configure on a venue machine (TECHNICAL_SPEC section 18, delta 7).
APP = MVP / "web-app" / "dist"


def app_built() -> bool:
    return (APP / "index.html").is_file()


def capabilities() -> dict:
    """Which optional paths are live on this machine (TR-G1).

    Every entry here is a degradation the pipeline can survive. Publishing them
    on one route means a venue machine can be checked in a second, before the
    demo rather than during it.
    """
    from . import detect_ml, pdf
    from .readers import sentinel1

    return {
        "workstation_built": app_built(),
        "segmentation": detect_ml.load().describe(),
        "pdf": pdf.available(),
        "sentinel1_reader": sentinel1.available(),
        "note": "each false entry is a documented degraded path, not a failure",
    }


def latest_run(root: Path):
    runs = sorted([p for p in root.glob("*") if (p / "run.json").exists()],
                  key=lambda p: p.stat().st_mtime)
    return runs[-1] if runs else None


def make_handler(runs_root: Path):
    class Handler(BaseHTTPRequestHandler):
        server_version = "DarkTransit/0.5"

        def log_message(self, fmt, *args):
            pass

        # ---- helpers ----
        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else str(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj), "application/json")

        def _run_dir(self, rid):
            if rid in ("latest", "", None):
                return latest_run(runs_root)
            p = runs_root / rid
            return p if (p / "run.json").exists() else None

        def _file(self, root: Path, rel: str) -> bool:
            """Serve `rel` under `root`, refusing anything that escapes it."""
            try:
                p = (root / rel).resolve()
            except (OSError, ValueError):
                return False
            if not str(p).startswith(str(root.resolve())) or not p.is_file():
                return False
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            self._send(200, p.read_bytes(), ctype)
            return True

        def _static(self, rel):
            """Static files: the workstation bundle first, then the legacy views.

            The React app owns `/` and its own assets; `web/` keeps serving the
            narrative view and the pre-React workstation, because PRD UI-5 wants
            more than one independent consumer of `run.json` and losing the
            second one would remove the check that the contract is honoured.
            """
            if app_built() and self._file(APP, rel):
                return
            if self._file(WEB, rel):
                return
            self._send(404, "not found", "text/plain")

        # ---- routes ----
        def handle_one_request(self):
            """One bad path must not take the connection down with it.

            The default handler lets an exception propagate out of the socket
            server, which shows up in a browser as a dropped connection and in
            a demo as a workstation that stopped working for no stated reason.
            """
            try:
                super().handle_one_request()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as exc:                    # noqa: BLE001
                try:
                    self._json({"error": f"{type(exc).__name__}: {exc}"}, 500)
                except Exception:
                    pass

        def do_GET(self):
            path = urlparse(self.path).path
            parts = [p for p in path.split("/") if p]

            if not parts:
                return self._static("index.html")
            if parts == ["classic"] or parts == ["classic.html"]:
                return self._file(WEB, "index.html") or self._send(404, "not found", "text/plain")
            if parts == ["capabilities"]:
                return self._json(capabilities())
            if parts == ["runs"]:
                return self._json([p.name for p in sorted(runs_root.glob("*"))
                                   if (p / "run.json").exists()])
            if parts == ["run.json"]:
                d = self._run_dir("latest")
                return self._json(json.loads((d / "run.json").read_text())) if d \
                    else self._json({"error": "no runs"}, 404)
            if parts[0] == "runs" and len(parts) >= 2:
                d = self._run_dir(parts[1])
                if d is None:
                    return self._json({"error": "unknown run"}, 404)
                if len(parts) == 2:
                    return self._json(json.loads((d / "run.json").read_text()))
                if parts[2] == "run.json":
                    return self._json(json.loads((d / "run.json").read_text()))
                if parts[2] == "capabilities":
                    return self._json(capabilities())
                if parts[2] == "dossier.html":
                    f = d / "dossier.html"
                    return self._send(200, f.read_bytes(), "text/html") if f.is_file() \
                        else self._json({"error": "no dossier for this run"}, 404)
                if parts[2] == "log":
                    # A run still being written has no log yet, and a run that
                    # halted at gate 5 emits fewer files than a complete one.
                    # Either way the answer is 404, not a dead handler.
                    f = d / "log.jsonl"
                    return self._send(200, f.read_bytes(), "text/plain") if f.is_file() \
                        else self._json({"error": "no log for this run"}, 404)
                if parts[2] == "artifacts" and len(parts) == 4:
                    f = next((x for x in d.glob(f"*{parts[3]}*.json")), None)
                    return self._json(json.loads(f.read_text())) if f \
                        else self._json({"error": "unknown artefact"}, 404)
                if len(parts) == 3:
                    # any other file the run produced: rasters, cloud.json.
                    # Name-only, no separators, so the run directory cannot be
                    # escaped (TR-S2).
                    name = parts[2]
                    if "/" in name or "\\" in name or name.startswith("."):
                        return self._json({"error": "bad name"}, 400)
                    f = (d / name)
                    if f.is_file() and f.resolve().parent == d.resolve():
                        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                        return self._send(200, f.read_bytes(), ctype)
                return self._json({"error": "unknown route"}, 404)
            return self._static(path.lstrip("/"))

        def do_POST(self):
            path = urlparse(self.path).path
            parts = [p for p in path.split("/") if p]
            n = int(self.headers.get("Content-Length", 0) or 0)
            payload = json.loads(self.rfile.read(n) or b"{}")

            if len(parts) == 3 and parts[0] == "runs" and parts[2] == "rescore":
                d = self._run_dir(parts[1])
                if d is None:
                    return self._json({"error": "unknown run"}, 404)
                doc = json.loads((d / "run.json").read_text())
                att = doc.get("attribution")
                if not att:
                    return self._json({"error": "run halted before attribution"}, 409)
                weights = payload.get("weights") or att["weights"]
                out = scoring.rescore([dict(r) for r in att["ranked"]], weights)
                out["ablation"] = scoring.ablate(att["ranked"], weights)
                return self._json(out)
            return self._json({"error": "unknown route"}, 404)

    return Handler


def serve(runs_root="runs", port=8000):
    root = Path(runs_root)
    root.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(root))
    d = latest_run(root)
    print(f"[dark-transit] serving http://127.0.0.1:{port}/")
    print(f"[dark-transit] latest run: {d.name if d else 'none -- run the pipeline first'}")
    httpd.serve_forever()
