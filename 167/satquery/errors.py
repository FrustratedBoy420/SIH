"""Typed, readable errors — API-12.

One exception type crosses the API boundary. It carries a stable machine code,
a sentence a person can read, and a remedy that says what to do instead. The
frontend renders all three (`web/src/lib/api.ts`, `asApiError`), so an error
with an empty remedy is a half-finished error.

No stack trace ever reaches a client. The server logs it; the client is told
what happened and what to do.
"""

from __future__ import annotations


class SatQueryError(Exception):
    """A refusal or a failure that the user is entitled to understand."""

    def __init__(self, code: str, message: str, remedy: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.remedy = remedy
        self.status = status

    def payload(self) -> dict:
        return {"error": {"code": self.code, "message": self.message,
                          "remedy": self.remedy}}


def unsupported(name: str, accepted: list[str]) -> SatQueryError:
    return SatQueryError(
        "unsupported_format",
        f"{name!r} is not a format this system reads.",
        "Upload a GeoTIFF (.tif/.tiff) for georeferenced imagery, or a PNG/JPEG "
        f"for benchmark data. Accepted: {', '.join(accepted)}.")


def too_large(what: str, actual: str, limit: str) -> SatQueryError:
    return SatQueryError(
        "too_large",
        f"That file's {what} is {actual}, above the limit of {limit}.",
        "Crop or downsample the scene before uploading it. Tiling for very "
        "large scenes is a Build-phase item (ING-06).",
        status=413)


def not_found(what: str) -> SatQueryError:
    return SatQueryError("not_found", f"No {what} by that identifier.",
                         "Check the identifier, or upload the imagery again.",
                         status=404)
