# Project sub-agents

`.pi/agents/` contains the sub-agent definitions this repository ships for
Aether's `pi-subagents` runtime. Each file is a markdown file with YAML
frontmatter (`name`, `description`, `tools`, …) and a system prompt body; the
frontmatter `name` is the `subagent_type` used for dispatch.

Project definitions in `.pi/agents/` take precedence over `.agents/agents/` and
over global definitions in `~/.pi/agent/agents/`, so these files are what an
Aether checkout actually runs.

## Agents

| Agent | Role | Tools | Frontmatter worth knowing |
| --- | --- | --- | --- |
| `aether-lab-orchestrator` | Decomposes one goal into sub-goals, dispatches workers, verifies their claims and integrates one result | `read`, `grep`, `find`, `ls`, `bash`, `Agent`, `get_subagent_result`, `steer_subagent` | `display_name: AI Lab Orchestrator`, `inherit_context: true`, `allowed_subagents: all`, `prompt_mode: replace`, `thinking: high`, `max_turns: 80`, `memory: project`, `output_transcript: true`, `color: "#8B5CF6"` |
| `root-bridge-auditor` | Traces the device-root path (settings page, `DeviceRootController`, `su` probing, chroot scope) and removes Termux dependencies from it | `read`, `grep`, `find`, `ls`, `bash` | `model: deepseek-v4.1-flash-1017`, `thinking: high` — read-only, cannot edit |
| `native-feature-dev` | Implements native Kotlin/Compose and iOS behaviour that extensions cannot reach (window flags, renderers, settings plumbing) | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` | `model: deepseek-v4.1-flash-1017`, `thinking: high` |
| `extension-ui-artisan` | Builds the extension UI layer: `render...Html(state)` modules for `ui.web` plus declarative `ui.*` trees; owns the AI Lab and Lab Power look | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` | `model: deepseek-v4.1-flash-1017`, `thinking: high` |
| `ci-build-guardian` | Owns `.github/workflows/*.yml`; keeps the debug/nightly APK pipeline green, orders compile gates before packaging, and does static compile-risk review of Kotlin/Gradle changes | `read`, `grep`, `find`, `ls`, `bash` | `model: deepseek-v4.1-flash-1017`, `thinking: high` — read-only, cannot edit workflows |
| `docs-scribe` | Writes and audits documentation — extension READMEs, `docs/*.md`, CHANGELOG entries, agent and skill instructions | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` | `model: deepseek-v4.1-flash-1017`, `thinking: medium` |

`root-bridge-auditor` and `ci-build-guardian` deliberately have no `edit`/`write`
tools: they are investigation and review agents. If their findings need a code
change, hand the finding to `native-feature-dev` or to the main agent.

## How to call an agent

1. **Mention** — start a composer message with `@<name>`:

   ```
   @root-bridge-auditor check why the root toggle crashes on a fresh install
   ```

   Only a leading mention is routed; the agent is started if it is not already
   running. Mentions never spend a main-model turn.

2. **Agent tool** — the main agent (and any agent with `allowed_subagents`) can
   dispatch explicitly:

   ```
   Agent({ subagent_type: "native-feature-dev", prompt: "…", run_in_background: true })
   ```

3. **Subagents settings page** — enable, disable, reload and inspect the
   definitions that were discovered in `.pi/agents/`.

The Lab extensions use the same mechanism through the sub-agents bridge: AI Lab
defaults to `aether-lab-worker` / `aether-lab-reviewer`, and Lab Power's Fan-out
defaults to `aether-lab-worker` for the angles and `aether-lab-orchestrator` for
the merge. Those worker/reviewer definitions are created on demand in
`~/.pi/agent/agents/` by AI Lab and are described in
[`extensions/aether-ai-lab/README.md`](../extensions/aether-ai-lab/README.md).

## Report contract

Every project agent ends its answer with fixed sections, because AI Lab's
reviewer and the Lab Power merge step parse them:

- `docs-scribe`, `root-bridge-auditor`, `native-feature-dev`,
  `extension-ui-artisan`, `ci-build-guardian`: `## Result`, `## Evidence`,
  `## Verification`, `## Risks`.
- `aether-lab-orchestrator`: `## Result`, `## Evidence`, `## Verification`,
  `## Sub-agents`, `## Risks`.

Evidence means commands and real output, file:line citations, and for the
orchestrator the handle of the agent that verified each claim. "Done" without a
reproduction is treated as a hypothesis.

## Environment assumptions baked into the prompts

- There is no JDK, Gradle or Android SDK on the development machine; GitHub
  Actions is the only compiler. Agents must not claim a build result they did not
  see in a workflow log.
- The shell is BusyBox userland: `grep` has no `--include`, and `sleep` is not
  used in commands.
- Platform work is expected on both Android and iOS with the same user-visible
  behaviour; shared logic belongs in `shared/src/commonMain`.
- Model keys are pinned in the five specialist definitions
  (`model: deepseek-v4.1-flash-1017`). Frontmatter wins over `Agent` tool
  parameters, so change the file if that model is not configured.