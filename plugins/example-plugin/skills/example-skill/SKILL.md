---
name: example-skill
description: Template skill shipped by the example-plugin oh-my-gajae-code plugin. Use when you want a worked reference for how an oh-my-gajae-code plugin packages a skill. Replace this body with your own workflow before publishing.
---

# Example Skill

This is a template skill. It exists to show the on-disk shape of a skill that
ships inside an oh-my-gajae-code plugin. Delete it (or rewrite it) before publishing a
real plugin.

## What a real skill should contain

- A precise `description` in the frontmatter above — the model uses it to decide
  when to activate the skill, so describe the *trigger conditions*, not just the
  topic.
- Concrete, ordered instructions the agent should follow when the skill is active.
- Explicit boundaries: what the skill must NOT do.

## Structure recap

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json          # plugin manifest
├── commands/                # slash commands → /<plugin-name>:<file>
│   └── changelog.md
└── skills/                  # skills, one directory per skill
    └── example-skill/
        └── SKILL.md         # this file
```

When this plugin is installed, this skill becomes available to the gjc agent and
the `/example-plugin:changelog` slash command appears in the command palette.
