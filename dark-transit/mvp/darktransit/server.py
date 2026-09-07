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

WEB = Path(__file__).resolve().parent.parent / "web"


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

        def _static(self, rel):
            p = (WEB / rel).resolve()
            if not str(p).startswith(str(WEB.resolve())) or not p.is_file():
                return self._send(404, "not found", "text/plain")
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            self._send(200, p.read_bytes(), ctype)

        # ---- routes ----
        def do_GET(self):
            path = urlparse(self.path).path
            parts = [p for p in path.split("/") if p]

            if not parts:
                return self._static("index.html")
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
                if parts[2] == "dossier.html":
                    return self._send(200, (d / "dossier.html").read_bytes(), "text/html")
                if parts[2] == "log":
                    return self._send(200, (d / "log.jsonl").read_bytes(), "text/plain")
                if parts[2] == "artifacts" and len(parts) == 4:
                    f = next((x for x in d.glob(f"*{parts[3]}*.json")), None)
                    return self._json(json.loads(f.read_text())) if f \
                        else self._json({"error": "unknown artefact"}, 404)
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
