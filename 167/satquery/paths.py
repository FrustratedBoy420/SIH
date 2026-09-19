"""Where the project's files are, however the package was installed.

The built-in scenes, the built interface (`web/dist`) and the recorded
calibration and stress runs live beside the package in the repository, not
inside it. A non-editable `pip install .` copies only `satquery/` into
site-packages, so "next to this file" stops pointing at them. The home is
resolved once, in this order:

    1. $SATQUERY_HOME                  set it on a machine with an unusual layout
    2. the checkout the package runs from (source tree or `pip install -e .`)
    3. the current directory, if it holds web/   (`pip install .` then run from the repo)
"""

from __future__ import annotations

import os
from pathlib import Path


def home() -> Path:
    env = os.environ.get("SATQUERY_HOME")
    if env:
        return Path(env).resolve()
    here = Path(__file__).resolve().parent.parent
    if (here / "web").is_dir():
        return here
    cwd = Path.cwd()
    if (cwd / "web").is_dir():
        return cwd.resolve()
    return here


def web() -> Path:
    return home() / "web"


def public() -> Path:
    return web() / "public"


def scenes() -> Path:
    return public() / "scenes"


def dist() -> Path:
    return web() / "dist"
