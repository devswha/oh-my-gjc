---
description: Explicitly generate one PNG through the logged-in ChatGPT Images web subscription.
argument-hint: "<image prompt>"
---

# /omg:gpt-image

This command is explicit-only. `$ARGUMENTS` must be nonempty; ask for an image prompt otherwise. Load `gpt-image` skill instructions and preserve its external ChatGPT privacy boundary. Never use generic chat's plus-menu and never run this alongside `/omg:insane-review` or other CDP automation.

Resolve `bin/gpt_image_web.py` by running the exact `GI=...` resolver in `skills/gpt-image/SKILL.md`: prefer project/user `oh-my-gjc` root bindings, then the exact checkout fallback. Reject malformed, permissive, or symlinked bindings; never use an old-identity binding, Claude variable, or cache path.

Require the exact nonempty prompt and run the read-only check first; never install dependencies, launch a browser, or automate login:
```bash
python3 "$GI" --check-env
```
On success, run:
```bash
python3 "$GI" --output-dir .gpt-image -- "$ARGUMENTS"
```

Return the emitted PNG and adjacent provenance JSON paths. The engine saves only the original obtained through ChatGPT Images fullscreen **Save**, not a screenshot, thumbnail, direct asset URL, API, or backend fallback.
