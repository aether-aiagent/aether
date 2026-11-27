#!/usr/bin/env python3
"""One-way Aether -> Aether rebrand for the Aether Android client.

Order matters: the longer compound identifiers are rewritten before the bare
word so that e.g. "Aether" does not become "AndroAether".
"""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKIP_DIRS = {".git", "build", ".gradle", ".idea"}

# Longest / most specific first.
RULES = [
    ("AETHER", "AETHER"),
    ("Aether", "Aether"),
    ("aether", "aether"),
    ("Aether", "Aether"),
    ("AETHER", "AETHER"),
    ("aether", "aether"),
]

TEXT_EXT = {
    ".kt", ".java", ".kts", ".xml", ".md", ".json", ".jsonc", ".yml", ".yaml",
    ".sh", ".bash", ".py", ".mjs", ".js", ".html", ".css", ".txt", ".pro",
    ".aidl", ".cpp", ".h", ".cmake", ".gradle", ".properties", ".gitignore",
    ".bat", ".ps1", ".toml", ".cfg", ".ini", ".sql", ".svg",
}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".jar", ".so",
              ".zip", ".keystore", ".jks", ".ttf", ".otf", ".woff", ".woff2"}


def convert(text: str) -> str:
    for old, new in RULES:
        if old in text:
            text = text.replace(old, new)
    return text


def main() -> int:
    changed, skipped = 0, 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            path = os.path.join(dirpath, name)
            ext = os.path.splitext(name)[1].lower()
            if ext in BINARY_EXT:
                skipped += 1
                continue
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    original = fh.read()
            except (UnicodeDecodeError, OSError):
                skipped += 1
                continue
            updated = convert(original)
            if updated != original:
                with open(path, "w", encoding="utf-8", newline="") as fh:
                    fh.write(updated)
                changed += 1
    print(f"content changed: {changed} files, skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
