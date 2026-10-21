#!/usr/bin/env python3
"""Deduplicate only byte-identical Bengali mappings introduced by automatic source merges."""
import re
from pathlib import Path
path = Path("src/live/project-locale.ts")
source = path.read_text()
start = source.index("const bengali: Record<string, string> = {")
end = source.index("\n};", start)
prefix, mapping, suffix = source[:start], source[start:end], source[end:]
literal = re.compile(r"^\s*('(?:\\.|[^'\\])*'):\s*(.+),\s*$")
seen = {}
output = []
duplicates = []
conflicts = []
for line in mapping.splitlines(keepends=True):
    match = literal.match(line.rstrip("\n"))
    if match:
        key, value = match.groups()
        if key in seen:
            if seen[key] == value:
                duplicates.append(key)
                continue
            conflicts.append((key, seen[key], value))
        else:
            seen[key] = value
    output.append(line)
print("Identical duplicate translations:", len(duplicates), duplicates)
if conflicts:
    print("DIFFERENT translation values need owner decision:", conflicts)
    raise SystemExit(1)
if duplicates:
    path.write_text(prefix + "".join(output) + suffix)
    print("Removed only duplicate keys with identical values; no translation text changed.")
