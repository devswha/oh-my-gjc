#!/usr/bin/env bash
# Install the orchestrator delegation policy into a project or user scope.
#
# Verified mechanics (GJC 0.11.x):
# - AGENTS.md is discovered per project (walk-up stops at the git repo root) and
#   is inlined into every top-level GJC system prompt.
# - .agents/rules/*.md (project) and ~/.gjc/agent/rules/*.md (user) feed the
#   rules capability: TTSR frontmatter rules interrupt mid-stream; plain rules
#   resolve via rule://<name>. alwaysApply rules do NOT render in the default
#   system prompt — the always-on policy text must live in AGENTS.md.
# - Sub-agents (executor/planner/architect/critic) inherit neither AGENTS.md
#   nor rules, so the policy binds only the top-level orchestrator.
#
# Usage:
#   install-orchestrator.sh --project [DIR]   install into a project (default: cwd)
#   install-orchestrator.sh --user            install rules machine-wide (~/.gjc/agent/rules)
#   install-orchestrator.sh --print-agents-md print the AGENTS.md policy section
set -euo pipefail

MARKER='## Orchestration policy'

read -r -d '' AGENTS_SECTION <<'EOF' || true
## Orchestration policy (top-level agent only)

This section binds the top-level (orchestrator) agent. Delegated sub-agents (executor, planner, architect, critic) are exempt and execute their assigned scope normally.

The top-level agent is an orchestrator. Its context budget is for routing, delegation-prompt design, integration, and verification — not bulk implementation.

### Delegate via task tool
Send to `executor` when ANY of:
- the change spans 2+ files
- the expected diff exceeds ~50 lines
- the work splits into independent, parallelizable slices

Use `planner` (sequencing), `architect` (architecture/code review), `critic` (plan critique) instead of performing those analyses inline.

### Do directly (delegation forbidden — overhead exceeds cost)
- single-file, known-location, small fixes (typo, config value, one function)
- reads, searches, and direct answers to questions
- integration of delegated results and ALL final verification

### Delegation prompt contract (required in every task call)
- exact file paths plus the smallest sufficient context
- completion criteria and expected output shape
- verification command(s): either assigned to the executor or explicitly retained by the parent
- explicit out-of-scope list ("do not touch ...")
- one behavioral spec source (existing tests or enumerated acceptance cases), not prose duplication

### Never
- implement a multi-file feature inline "to save time" — that is the violation this policy exists for
- mark delegated work done without running the focused verification yourself
- delegate trivial fixes or answers

A mid-stream reminder of this policy is enforced by `.agents/rules/orchestration-tripwire.md` (TTSR) the first time the top-level agent edits or writes a file directly in a session. The full policy is also readable at `rule://orchestration` (`.agents/rules/orchestration.md`).
EOF

read -r -d '' RULE_ORCHESTRATION <<'EOF' || true
---
description: Orchestrator-first policy - top-level agent routes, prompts, integrates, and verifies; bulk implementation is delegated
alwaysApply: true
---
# Orchestration policy

The top-level agent is an orchestrator. Its context budget is for routing, delegation-prompt design, integration, and verification — not bulk implementation.

## Delegate via task tool
Send to `executor` when ANY of:
- the change spans 2+ files
- the expected diff exceeds ~50 lines
- the work splits into independent, parallelizable slices

Use `planner` (sequencing), `architect` (architecture/code review), `critic` (plan critique) instead of performing those analyses inline.

## Do directly (delegation forbidden — overhead exceeds cost)
- single-file, known-location, small fixes (typo, config value, one function)
- reads, searches, and direct answers to questions
- integration of delegated results and ALL final verification

## Delegation prompt contract (required in every task call)
- exact file paths plus the smallest sufficient context
- completion criteria and expected output shape
- verification command(s): either assigned to the executor or explicitly retained by the parent
- explicit out-of-scope list ("do not touch ...")

## Never
- implement a multi-file feature inline "to save time" — that is the violation this rule exists for
- mark delegated work done without running the focused verification yourself
- delegate trivial fixes or answers
EOF

read -r -d '' RULE_TRIPWIRE <<'EOF' || true
---
description: Mid-stream reminder of the orchestration policy when the top-level agent starts editing files directly
condition: ".*"
scope:
  - "tool:edit"
  - "tool:write"
interruptMode: tool-only
repeatMode: once
---
Orchestration checkpoint: you are about to edit or write a file directly.

Allowed only if this is a single-file, known-location, small fix (or integration/verification of delegated work). If the change spans 2+ files or exceeds ~50 diff lines, STOP and delegate to `executor` via the task tool with exact paths, completion criteria, verification commands, and an out-of-scope list. See rule://orchestration.
EOF

write_rules() {
	local rules_dir="$1"
	mkdir -p "$rules_dir"
	printf '%s\n' "$RULE_ORCHESTRATION" > "$rules_dir/orchestration.md"
	printf '%s\n' "$RULE_TRIPWIRE" > "$rules_dir/orchestration-tripwire.md"
	echo "installed: $rules_dir/orchestration.md"
	echo "installed: $rules_dir/orchestration-tripwire.md"
}

install_project() {
	local dir="${1:-$PWD}"
	[ -d "$dir" ] || { echo "❌ no such directory: $dir" >&2; exit 1; }
	write_rules "$dir/.agents/rules"
	local agents_md="$dir/AGENTS.md"
	if [ ! -f "$agents_md" ]; then
		{ printf '# Agent instructions\n\n'; printf '%s\n' "$AGENTS_SECTION"; } > "$agents_md"
		echo "created:   $agents_md"
	elif grep -qF "$MARKER" "$agents_md"; then
		echo "skipped:   $agents_md (policy section already present)"
	else
		local backup
		backup="$agents_md.omg-orchestrator.bak.$(date +%Y%m%d%H%M%S)"
		cp "$agents_md" "$backup"
		echo "backup:    $backup"
		{ printf '\n'; printf '%s\n' "$AGENTS_SECTION"; } >> "$agents_md"
		echo "appended:  $agents_md"
	fi
}

install_user() {
	write_rules "$HOME/.gjc/agent/rules"
	cat <<'NOTE'
note: user-level rules provide the TTSR tripwire and rule://orchestration in
every project on this machine. The always-on prompt section still requires a
per-project AGENTS.md — run with --project inside each repo that needs it.
NOTE
}

case "${1:---project}" in
	--project) install_project "${2:-$PWD}" ;;
	--user) install_user ;;
	--print-agents-md) printf '%s\n' "$AGENTS_SECTION" ;;
	-h|--help) sed -n '2,18p' "$0" ;;
	*) echo "❌ unknown option: $1 (use --project [DIR] | --user | --print-agents-md)" >&2; exit 2 ;;
esac
