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
    approved = {"'Leave Requests'", "'Attendance Requests'", "'Attendance summary by employee'", "'Out Time'"}
    if {key for key, _, _ in conflicts} != approved:
        raise SystemExit(f"Unexpected divergent translations: {conflicts}")
    import subprocess
    baseline = subprocess.run(["git", "show", "286bc1881966aefe1da1e0a579d31bb9e5e3fa04:src/live/project-locale.ts"],
                              check=True, capture_output=True, text=True).stdout
    baseline_values = {m.group(1): m.group(2) for line in baseline.splitlines() if (m := literal.match(line))}
    for key, current, alternative in conflicts:
        if baseline_values.get(key) != current:
            raise SystemExit(f"Existing approved WS08 translation changed for {key}")
        print(f"Preserved WS08 approved wording for {key}; WS07 variant remains documented for review.")
        duplicates.append(key)
    Path("integration-evidence/locale-variant-decisions.txt").write_text(
        "\n".join(f"{key}: retained {current} ; WS07 proposed {alternative}" for key, current, alternative in conflicts) + "\n"
    )
    # Re-scan while retaining the first, exact-WS08 value for these four known keys.
    output, seen = [], set()
    for line in mapping.splitlines(keepends=True):
        match = literal.match(line.rstrip("\n"))
        if match:
            key = match.group(1)
            if key in seen:
                continue
            seen.add(key)
        output.append(line)
if duplicates:
    path.write_text(prefix + "".join(output) + suffix)
    print("Merged Bengali mapping keys without altering the original approved WS08 translations.")
