#!/usr/bin/env python3
"""Repair translated strings that still carry the old brand.

The rebrand replaced the Latin spelling everywhere, but several locales had
transliterated the word (হার্নেস, ハーネス, 하네스, harnais, مهار, ...) and some
kept a lowercase "aether". The resource test compares the count of the
technical token "Aether" between English and each translation, so those strings
fail.

Strategy: for every string that exists in English and contains "Aether", find
the translation's non-ASCII word that English does not have and swap it for
"Aether". Lowercase "aether" is only rewritten when it is not part of a file
or host name (aether.json, aether.jsonc, aether.workspace, .aether/).
"""
import glob
import os
import re

RES = "app/src/main/res"
NAME_RE = re.compile(r'<string name="([^"]+)"[^>]*>(.*?)</string>', re.S)
WORD_RE = re.compile(r"[^\x00-\x7F]+")
# Tokens that must keep their lowercase spelling.
KEEP = ("aether.json", "aether.jsonc", "aether.workspace", ".aether", "aether/")


def english_strings() -> dict:
    """Every string in values/ (English lives in several files, not one)."""
    out = {}
    for path in sorted(glob.glob(os.path.join(RES, "values", "*.xml"))):
        text = open(path, encoding="utf-8").read()
        out.update({m.group(1): m.group(2) for m in NAME_RE.finditer(text)})
    return out


def fix_body(body: str) -> str:
    new = body
    # Lowercase brand used as a word, but never inside a file/host name.
    for token in KEEP:
        new = new.replace(token, "\u0000" + token + "\u0000")
    new = re.sub(r"(?<![A-Za-z0-9_.])aether(?![A-Za-z0-9_.])", "Aether", new)
    new = new.replace("\u0000", "")
    return new


def main() -> int:
    english = english_strings()
    changed = 0
    for path in sorted(glob.glob(os.path.join(RES, "values-*", "*.xml"))):
        text = open(path, encoding="utf-8").read()
        out = text
        for m in NAME_RE.finditer(text):
            name, body = m.group(1), m.group(2)
            en = english.get(name)
            if not en or "Aether" not in en:
                continue
            if "Aether" in body and "aether" not in body:
                continue
            new = fix_body(body)
            # A transliteration: a non-ASCII word the English string lacks.
            if "Aether" not in new:
                extra = [w for w in WORD_RE.findall(new) if w not in en]
                if len(extra) == 1:
                    new = new.replace(extra[0], "Aether")
            if new != body:
                out = out.replace(body, new, 1)
        if out != text:
            open(path, "w", encoding="utf-8", newline="").write(out)
            changed += 1
    print(f"locales updated: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
