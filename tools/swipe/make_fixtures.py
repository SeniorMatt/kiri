#!/usr/bin/env python3
"""Builds src/tests/fixtures/swipe/*.json from traces and the niri reference output for them.
usage: make_fixtures.py TRACE_DIR REF_DIR OUT_DIR name..."""
import json, sys, os
tr, ref, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
for n in sys.argv[4:]:
    r = json.load(open(f"{ref}/{n}.json"))
    if "anim" in r: r["anim"] = r["anim"][::2]
    json.dump({"trace": open(f"{tr}/{n}.trace").read(), "niri": r}, open(f"{out}/{n}.json", "w"), separators=(",", ":"))
