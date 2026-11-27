#!/usr/bin/env python3
"""Rename files and directories that still carry the old brand.

Renames are applied bottom-up (deepest paths first) so that moving a parent
directory does not invalidate the paths of its children.
"""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKIP_DIRS = {".git", "build", ".gradle", ".idea"}

RULES = [
    ("androidharness", "aether"),
    ("AndroidHarness", "Aether"),
    ("Harness", "Aether"),
    ("harness", "aether"),
]


def convert(name: str) -> str:
    for old, new in RULES:
        if old in name:
            name = name.replace(old, new)
    return name


def main() -> int:
    moves = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in list(dirnames) + filenames:
            new = convert(name)
            if new != name and new not in (dirnames + filenames):
                moves.append((os.path.join(dirpath, name), os.path.join(dirpath, new)))

    # Deepest first.
    moves.sort(key=lambda pair: pair[0].count(os.sep), reverse=True)
    done = 0
    for src, dst in moves:
        if os.path.exists(dst):
            print(f"skip (exists): {dst}")
            continue
        os.rename(src, dst)
        done += 1
    print(f"renamed: {done} paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
