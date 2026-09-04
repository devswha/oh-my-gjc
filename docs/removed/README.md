# Removed code archive

This directory preserves the source of capabilities removed from the suite, so
the exact removed code stays reviewable without digging through git history.

**Policy (2026-07-21, user directive):** from this point on, when code or a
capability is removed, archive its removed source under `docs/removed/<name>/`
in the same change that deletes it. Git history is not a substitute — the
archive is the browsable record.

## Convention

- One directory per removed capability: `docs/removed/<name>/`.
- Keep the original files under recognizable names (a `commands/*.md` body may be
  renamed `command-<name>.md` to avoid confusion with a live command).
- Record, per entry: original repo path(s), the removal commit, and the release
  version that dropped it.
- This archive is documentation only. It is never installed, executed, resolved
  by the suite-root binding, or referenced by `install.sh` / `install-skill.sh`.
- Tombstone prose (rationale/boundary history) that outgrew `AGENTS.md` lives in
  `tombstones.md` (moved there verbatim on 2026-09-01); `AGENTS.md` keeps a
  one-line table row per removed capability.

## Entries

### `AGENTS.md` tombstone prose — moved 2026-09-01

`AGENTS.md` per-capability `(REMOVED …)` sections were compressed into a table;
the verbatim originals live in `tombstones.md`.


### `ouroboros` — removed in v0.33.0 (commit `4dc72c8`)
| archived file | original path |
|---|---|
| `ouroboros/SKILL.md` | `plugins/oh-my-gajae-code/skills/ouroboros/SKILL.md` |
| `ouroboros/command-ouroboros-setup.md` | `plugins/oh-my-gajae-code/templates/ouroboros-setup.md` |
| `ouroboros/ouroboros.test.ts` | `plugins/oh-my-gajae-code/test/ouroboros.test.ts` |

### `adaptive-response` — removed in v0.32.0 (commit `c798ba9`)
| archived file | original path |
|---|---|
| `adaptive-response/SKILL.md` | `plugins/oh-my-gajae-code/skills/adaptive-response/SKILL.md` |
| `adaptive-response/command-gate.md` | `plugins/oh-my-gajae-code/templates/gate.md` |
| `adaptive-response/command-gate-always.md` | `plugins/oh-my-gajae-code/templates/gate-always.md` |
| `adaptive-response/adaptive-response.test.ts` | `plugins/oh-my-gajae-code/test/adaptive-response.test.ts` |

### `deep-onboarding` — removed in v0.32.0 (commit `c798ba9`)
| archived file | original path |
|---|---|
| `deep-onboarding/SKILL.md` | `plugins/oh-my-gajae-code/skills/deep-onboarding/SKILL.md` |
| `deep-onboarding/command-deep-onboarding.md` | `plugins/oh-my-gajae-code/templates/deep-onboarding.md` |
| `deep-onboarding/deep-onboarding.test.ts` | `plugins/oh-my-gajae-code/test/deep-onboarding.test.ts` |

### `multi-harness-research` — removed in v0.32.0 (commit `c798ba9`)
| archived file | original path |
|---|---|
| `multi-harness-research/SKILL.md` | `plugins/oh-my-gajae-code/skills/multi-harness-research/SKILL.md` |
| `multi-harness-research/command-multi-harness.md` | `plugins/oh-my-gajae-code/templates/multi-harness.md` |
| `multi-harness-research/multi-harness-research.mjs` | `plugins/oh-my-gajae-code/bin/multi-harness-research.mjs` |
| `multi-harness-research/multi-harness-research.test.ts` | `plugins/oh-my-gajae-code/test/multi-harness-research.test.ts` |
| `multi-harness-research/multi-harness-research-surface.test.ts` | `plugins/oh-my-gajae-code/test/multi-harness-research-surface.test.ts` |
| `multi-harness-research/install-skill-pre-removal.sh` | `plugins/oh-my-gajae-code/bin/install-skill.sh` (pre-removal snapshot containing the retired runtime integration) |

The multi-harness installer snapshot is archival only.

### `preset-pack` — removed in v0.29.0 (commit `b533a5d`)
Curated model-preset merger (`daily`/`agent`) into user `models.yml`.
| archived file | original path |
|---|---|
| `preset-pack/SKILL.md` | `plugins/oh-my-gajae-code/skills/preset-pack/SKILL.md` |
| `preset-pack/command-preset-pack.md` | `plugins/oh-my-gajae-code/templates/preset-pack.md` |
| `preset-pack/preset-pack.yml` | `plugins/oh-my-gajae-code/references/preset-pack.yml` |

Removal rationale and boundary: see the `preset-pack` section in
`docs/removed/tombstones.md` and `docs/verification/omg-release-v0.29.0-2026-07-21.md`.

### Suite binding resolver snippets — replaced for v0.36.0

The capabilities remain active. These snippets were replaced to reject malformed
or symlinked higher-priority bindings rather than silently selecting another root.
Removal commit: `9a30dec` (v0.36.0 candidate); see `docs/verification/skills-audit-2026-09-04.md`.

| archived file | original path(s) |
|---|---|
| `suite-resolvers/insane-search-resolver.sh.txt` | `plugins/oh-my-gjc/skills/insane-search/SKILL.md` (resolver block) |
| `suite-resolvers/council-resolver.sh.txt` | `plugins/oh-my-gjc/references/council-setup.md` (resolver block) |
| `suite-resolvers/gpt-image-resolver.sh.txt` | `plugins/oh-my-gjc/skills/gpt-image/SKILL.md` (resolver block) |
| `suite-resolvers/insane-review-resolver.sh.txt` | `plugins/oh-my-gjc/skills/insane-review/SKILL.md`, `plugins/oh-my-gjc/templates/insane-review.md` (identical resolver blocks) |

Archive only; never install or execute these snippets.
