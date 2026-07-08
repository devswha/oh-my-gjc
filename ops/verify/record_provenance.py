#!/usr/bin/env python3
"""A7 provenance hard gate — prove the installed cache payload IS the candidate.

Compares sha256 of canonical marker files between the local candidate checkout and the
installed plugin cache root. Writes provenance.json. Exits non-zero (fail-closed) unless
every marker matches, so a default/published payload can never masquerade as the candidate.

Usage:
  record_provenance.py --candidate <repo> --cache <cache-root> --commit <sha> \
                       --marketplace-ref <path-or-ref> --out <provenance.json>
"""
import argparse, hashlib, json, os, sys

# marker path (relative)  ->  (candidate location, cache location)
# candidate stores the plugin under plugins/oh-my-gjc/; cache root IS the plugin root.
MARKERS = [
    "bin/install-skill.sh",
    ".claude-plugin/plugin.json",
    "commands/omg.md",
    "commands/codex-ask.md",
    "commands/tower-setup.md",
]

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", required=True, help="local candidate repo root")
    ap.add_argument("--cache", required=True, help="installed cache root (…/oh-my-gjc___<entry>___<ver>)")
    ap.add_argument("--commit", required=True)
    ap.add_argument("--marketplace-ref", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    plugin_src = os.path.join(a.candidate, "plugins", "oh-my-gjc")
    cache = a.cache.rstrip("/")

    # plugin entry name + version from installed cache plugin.json
    with open(os.path.join(cache, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
        pj = json.load(f)
    # marketplace metadata version from candidate marketplace.json
    with open(os.path.join(a.candidate, ".claude-plugin", "marketplace.json"), encoding="utf-8") as f:
        mk = json.load(f)

    markers = {}
    all_match = True
    missing = []
    for rel in MARKERS:
        src = os.path.join(plugin_src, rel)
        dst = os.path.join(cache, rel)
        if not (os.path.isfile(src) and os.path.isfile(dst)):
            missing.append(rel); all_match = False; continue
        hs, hd = sha256(src), sha256(dst)
        markers[rel] = {"candidate": hs, "installed": hd, "match": hs == hd}
        if hs != hd:
            all_match = False

    prov = {
        "candidate_repo": os.path.abspath(a.candidate),
        "candidate_branch": os.environ.get("CANDIDATE_BRANCH", ""),
        "candidate_commit": a.commit,
        "marketplace_ref_used": a.marketplace_ref,
        "installed_cache_root": cache,
        "plugin_entry_name": pj.get("name"),
        "plugin_manifest_version": pj.get("version"),
        "marketplace_version": mk.get("metadata", {}).get("version"),
        "marketplace_plugins_count": len(mk.get("plugins", [])),
        "content_markers": markers,
        "missing_markers": missing,
        "local_vs_installed_marker_match": all_match,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(prov, f, ensure_ascii=False, indent=2)

    print(json.dumps(prov, ensure_ascii=False, indent=2))
    if not all_match:
        print("❌ PROVENANCE FAIL — installed cache payload does not match local candidate.", file=sys.stderr)
        sys.exit(1)
    if len(mk.get("plugins", [])) != 1:
        print("❌ PROVENANCE FAIL — marketplace exposes more than one plugin entry.", file=sys.stderr)
        sys.exit(1)
    print("✓ provenance OK — installed payload == candidate; single marketplace entry.", file=sys.stderr)

if __name__ == "__main__":
    main()
