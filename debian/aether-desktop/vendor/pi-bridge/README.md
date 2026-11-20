# Vendored pi-bridge

This directory contains a copy of the `pi-bridge` sources from this repository (`pi-bridge/` at the repo root) vendored for the Aether Desktop Debian deliverable.

- **Origin:** copied from `aether-lab/pi-bridge` in the same source tree.
- **Purpose:** allow the installed Aether Desktop application to run the Pi agent runtime/bridge without depending on the monorepo layout at runtime.
- **Build note:** `dist/` bundles are not vendored here (offline/size). To use the vendored bridge, run `npm install` and `npm run build` in this directory (requires Node.js >= 22.19 and network access to fetch dependencies), or ensure `dist/bridge.mjs` and related artifacts are present. The desktop runtime adapter prefers a repo-local built bridge when launched from a source checkout.
- **Licensing:** subject to the licensing of this repository and third-party notices. See the repository root `LICENSE` and `THIRD_PARTY_NOTICES.md` for applicable terms and attributions for bundled dependencies.

Do not edit vendored files here except to refresh the copy from upstream `pi-bridge/`.