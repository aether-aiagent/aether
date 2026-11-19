# Vendored Pi extensions

This directory vendors Aether/Pi extensions from the source repository so the desktop deliverable can expose the same extension-powered agent capabilities when configured.

Included:
- `aether-ai-lab` — AI Lab / goal-scoped sub-agent orchestration with reviewer flow.
- `aether-lab-power` — runtime/background task and power-user lab features.
- `pi-subagents` — autonomous sub-agents extension.
- `pi-mcp-adapter` — MCP adapter for external tool servers.
- `pi-web-access` — web access/search/fetch capabilities.

**Build/runtime notes:** some extensions (e.g. `pi-subagents`, `pi-web-access`, `pi-mcp-adapter`) are TypeScript packages in upstream form and may require their own dependency installation/build steps (`npm install`, `tsc`/bundling) to run outside the original Android/app runtime. They are vendored here as source assets for parity and future packaging. The desktop app wires extension paths into the Pi bridge session configuration (`extension_paths`) when available; enablement depends on a built/compatible bridge and extension runtime environment.

See also `../pi-bridge/README.md` and repository root licensing/third-party notices.
