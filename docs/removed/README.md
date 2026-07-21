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

## Entries

### `preset-pack` — removed in v0.29.0 (commit `b533a5d`)
Curated model-preset merger (`daily`/`agent`) into user `models.yml`.
| archived file | original path |
|---|---|
| `preset-pack/SKILL.md` | `plugins/oh-my-gajae-code/skills/preset-pack/SKILL.md` |
| `preset-pack/command-preset-pack.md` | `plugins/oh-my-gajae-code/templates/preset-pack.md` |
| `preset-pack/preset-pack.yml` | `plugins/oh-my-gajae-code/references/preset-pack.yml` |

Removal rationale and boundary: see the `preset-pack` tombstone in `AGENTS.md`
and `docs/verification/omg-release-v0.29.0-2026-07-21.md`.
