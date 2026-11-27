#!/usr/bin/env python3
"""Fix prose where the old brand name was a common noun.

The source used "harness" both as the product name and as an ordinary word
("the harness environment", "a coding harness"). A blind replace turned those
into "aether", which reads wrong. These are the recurring phrasings, repaired
in place with wording that is correct for the Aether brand.
"""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

# Longest phrases first so a shorter rule cannot clobber part of a longer one.
RULES = [
    # "Aether <noun>" used as "the environment/harness <noun>"
    ("the Aether environment", "the Aether environment"),
    ("the Aether toolchain", "the Aether toolchain"),
    ("the Aether prompt", "the Aether prompt"),
    ("the Aether shell tool", "the Aether shell tool"),
    ("the Aether core", "the Aether core"),
    ("the Aether loop", "the Aether loop"),
    ("Aether now exports", "Aether now exports"),
    ("Aether knows", "Aether knows"),
    ("Aether sets", "Aether sets"),
    ("Aether selects", "Aether selects"),
    ("Aether supplies", "Aether supplies"),
    ("Aether can prove", "Aether can prove"),
    ("Aether actually retrieved", "Aether actually retrieved"),
    ("Aether does not use", "Aether does not use"),
    ("Aether does not run", "Aether does not run"),
    ("Aether needs", "Aether needs"),
    ("Aether writes", "Aether writes"),
    ("Aether hides", "Aether hides"),
    ("Aether fills", "Aether fills"),
    ("Aether spawns", "Aether spawns"),
    ("Aether reads", "Aether reads"),
    ("Aether relies", "Aether relies"),
    ("Aether errors", "Aether errors"),
    ("Aether verifies", "Aether verifies"),
    ("Aether has", "Aether has"),
    ("Aether's approval", "Aether's approval"),
    ("Aether's normal", "Aether's normal"),
    ("Aether's bug", "Aether's bug"),
    ("the Aether prefix", "the Aether prefix"),
    ("the Aether background shell", "the Aether background shell"),
    ("the Aether self-test", "the Aether self-test"),
    ("the Aether app", "the Aether app"),
    ("the Aether Tool surface", "the Aether Tool surface"),
    ("the Aether Tool", "the Aether Tool"),
    ("Aether reports", "Aether reports"),
    ("the Aether source", "the Aether source"),
    ("the Aether project", "the Aether project"),
    ("the Aether agent", "the Aether agent"),
    ("the Aether conversation", "the Aether conversation"),
    ("the Aether chat", "the Aether chat"),
    ("the Aether intro", "the Aether intro"),
    ("the Aether assistant", "the Aether assistant"),
    ("the Aether app", "the Aether app"),
    ("Aether is", "Aether is"),
    ("Aether was", "Aether was"),
    ("Aether will", "Aether will"),
    ("Aether should", "Aether should"),
    ("Aether must", "Aether must"),
    ("Aether might", "Aether might"),
    ("Aether may", "Aether may"),
    ("Aether could", "Aether could"),
    ("Aether would", "Aether would"),
    ("Aether only", "Aether only"),
    ("Aether also", "Aether also"),
    ("Aether still", "Aether still"),
    ("Aether already", "Aether already"),
    ("Aether never", "Aether never"),
    ("Aether always", "Aether always"),
    ("Aether itself", "Aether itself"),
    ("Aether instead", "Aether instead"),
    ("Aether together", "Aether together"),
    ("Aether returns", "Aether returns"),
    ("Aether renders", "Aether renders"),
    ("Aether handles", "Aether handles"),
    ("Aether keeps", "Aether keeps"),
    ("Aether makes", "Aether makes"),
    ("Aether takes", "Aether takes"),
    ("Aether puts", "Aether puts"),
    ("Aether adds", "Aether adds"),
    ("Aether removes", "Aether removes"),
    ("Aether creates", "Aether creates"),
    ("Aether installs", "Aether installs"),
    ("Aether ships", "Aether ships"),
    ("Aether vendors", "Aether vendors"),
    ("Aether carries", "Aether carries"),
    ("the Aether applies", "Aether applies"),
    ("Aether unpacked", "Aether unpacked"),
    ("Aether patches", "Aether patches"),
    ("Aether owns", "Aether owns"),
    ("Aether routes", "Aether routes"),
    ("Aether routes", "Aether routes"),
    # indefinite article
    ("a coding agent", "a coding agent"),
    ("a coding agent", "a coding agent"),
    ("an Aether", "an Aether"),
    ("An Aether", "An Aether"),
    # lowercase brand used as a common noun
    ("Aether.", "Aether."),
    ("Aether,", "Aether,"),
    ("Aether)", "Aether)"),
    ("Aether;", "Aether;"),
    ("Aether:", "Aether:"),
    # standalone lowercase "aether" referring to the app
    ("all Aether tools", "all Aether tools"),
    ("every Aether tool", "every Aether tool"),
    ("any Aether tool", "any Aether tool"),
    ("Aether tool", "Aether tool"),
    ("Aether tools", "Aether tools"),
    ("Aether self-checks", "Aether self-checks"),
    ("Aether configuration", "Aether configuration"),
    ("Aether settings", "Aether settings"),
    ("Aether build smoke", "Aether build smoke"),
    ("Start Aether", "Start Aether"),
    ("start Aether", "start Aether"),
    ("for Aether", "for Aether"),
    ("of Aether", "of Aether"),
    ("to Aether", "to Aether"),
    ("Aether", "Aether"),
]

SKIP_DIRS = {".git", "build", ".gradle", ".idea"}
EXTS = {".kt", ".java", ".kts", ".xml", ".md", ".json", ".jsonc", ".yml",
        ".yaml", ".sh", ".py", ".mjs", ".js", ".html", ".txt", ".pro",
        ".aidl", ".cpp", ".h", ".gradle", ".properties", ".bat"}


def main() -> int:
    changed = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in EXTS:
                continue
            path = os.path.join(dirpath, name)
            try:
                text = open(path, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            updated = text
            for old, new in RULES:
                updated = updated.replace(old, new)
            if updated != text:
                with open(path, "w", encoding="utf-8", newline="") as fh:
                    fh.write(updated)
                changed += 1
    print(f"prose fixed in {changed} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
