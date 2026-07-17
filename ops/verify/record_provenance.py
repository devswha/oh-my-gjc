#!/usr/bin/env python3
"""Fail-closed provenance gate for an installed ``oh-my-gjc`` cache payload.

The marketplace reference is recorded only as operator context. It is not an
independently verifiable binding, so Gate 2 and Gate 3 remain separate release
gates.

Threat model: the caller must retain exclusive control of the candidate and
cache paths for this bounded gate. Descriptor-walked full plugin-tree
inventory and repeated identity/content checks detect persistent mutation, but
cannot cryptographically lock paths against a malicious same-UID process that
deliberately swaps and restores state between syscalls.

Usage:
  record_provenance.py --candidate <repo> --cache <cache-root> --commit <sha> \
                       --marketplace-ref <path-or-ref> --out <provenance.json>
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import shutil
import sys


PLUGIN_NAME = "oh-my-gjc"
PLUGIN_SOURCE = "./plugins/oh-my-gjc"
CACHE_PREFIX = "oh-my-gjc___oh-my-gjc___"
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
NORMALIZABLE_COMMIT_RE = re.compile(r"[0-9A-Fa-f]{40}")
SEMVER_RE = re.compile(
    r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)

# Candidate stores the plugin below plugins/oh-my-gjc; cache root IS plugin root.
# MARKERS remain independently reported critical surfaces; the full inventory is the payload proof.
MARKERS = [
    "bin/install-skill.sh",
    ".claude-plugin/plugin.json",
    "templates/omg.md",
    "templates/setup.md",
    "templates/gate.md",
    "templates/gate-always.md",
    "templates/no-english.md",
    "templates/time-left.md",
    "templates/fable.md",
    "templates/insane-review.md",
    "templates/lazycodex-gjc.md",
    "templates/deep-onboarding.md",
    "templates/session-observer.md",
    "bin/lazycodex-gjc.mjs",
    "bin/session-observer.ts",
    "skills/insane-review/SKILL.md",
    "skills/adaptive-response/SKILL.md",
    "skills/no-english/SKILL.md",
    "skills/time-left/SKILL.md",
    "skills/extragoal/SKILL.md",
    "skills/lazycodex-gjc/SKILL.md",
    "skills/deep-onboarding/SKILL.md",
    "skills/session-observer/SKILL.md",
    "tools/sdk-lab/package.json",
    "tools/sdk-lab/bun.lock",
    "tools/sdk-lab/src/inspect.ts",
    "tools/sdk-lab/src/eta.ts",
]
MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json"
PLUGIN_MANIFEST = "plugins/{}/.claude-plugin/plugin.json".format(PLUGIN_NAME)
PLUGIN_TREE = "plugins/{}".format(PLUGIN_NAME)
ROOT_INSTALLER = "install.sh"


class GateError(Exception):
    """A validation failure that must not create or overwrite an attestation."""


class DuplicateJsonKey(ValueError):
    """Raised by the JSON object hook when a manifest repeats a key."""


def fail(message):
    raise GateError(message)


def sha256_bytes(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def require_open_flags():
    required = ("O_DIRECTORY", "O_NOFOLLOW", "O_NONBLOCK")
    missing = [name for name in required if not hasattr(os, name)]
    if missing:
        fail("platform lacks required no-follow filesystem support: {}".format(", ".join(missing)))


def canonical_directory(raw_path, label):
    """Return an absolute directory path with no symlinked path component."""
    path = os.path.abspath(raw_path)
    try:
        mode = os.lstat(path).st_mode
    except OSError as exc:
        fail("{} does not exist or cannot be inspected: {} ({})".format(label, path, exc))
    if stat.S_ISLNK(mode):
        fail("{} must not be a symlink: {}".format(label, path))
    if not stat.S_ISDIR(mode):
        fail("{} must be an existing directory: {}".format(label, path))
    if os.path.realpath(path) != path:
        fail("{} contains symlinked components: {}".format(label, path))
    return path

def descriptor_identity(descriptor):
    """Return the stable device/inode identity of an already-open directory."""
    information = os.fstat(descriptor)
    if not stat.S_ISDIR(information.st_mode):
        fail("opened descriptor must refer to a directory")
    return information.st_dev, information.st_ino


def assert_path_matches_descriptor(path, descriptor, label):
    """Reject replacement, rename, or symlink diversion of a trusted directory path."""
    expected_device, expected_inode = descriptor_identity(descriptor)
    try:
        information = os.stat(path, follow_symlinks=False)
        lexical_information = os.lstat(path)
        resolved_path = os.path.realpath(path)
    except OSError as exc:
        fail("{} pathname no longer exists: {}".format(label, exc))
    if not stat.S_ISDIR(information.st_mode):
        fail("{} pathname is no longer a directory".format(label))
    if stat.S_ISLNK(lexical_information.st_mode) or resolved_path != path:
        fail("{} pathname became symlinked".format(label))
    if (information.st_dev, information.st_ino) != (expected_device, expected_inode):
        fail("{} pathname no longer identifies the opened descriptor".format(label))
    return expected_device, expected_inode


def is_within(root, path):
    try:
        return os.path.commonpath((root, path)) == root
    except ValueError:
        return False
def reject_output_inside_input_roots(output_path, candidate, cache):
    """Keep the attestation path disjoint from every candidate/cache input byte."""
    lexical_output_path = os.path.normpath(os.path.abspath(output_path))
    for label, root in (("candidate root", candidate), ("authoritative cache root", cache)):
        if is_within(root, lexical_output_path):
            fail("--out must not be inside or equal to the {}".format(label))
    return lexical_output_path


def contained_path(root, path, label, required_kind):
    """Statically reject a symlink or escape before descriptor-relative access."""
    path = os.path.abspath(path)
    if not is_within(root, path):
        fail("{} escapes its required root: {}".format(label, path))
    try:
        mode = os.lstat(path).st_mode
    except OSError as exc:
        fail("{} is missing or cannot be inspected: {} ({})".format(label, path, exc))
    if stat.S_ISLNK(mode):
        fail("{} must not be a symlink: {}".format(label, path))
    if required_kind == "directory" and not stat.S_ISDIR(mode):
        fail("{} must be a directory: {}".format(label, path))
    if required_kind == "file" and not stat.S_ISREG(mode):
        fail("{} must be a regular file: {}".format(label, path))
    if os.path.realpath(path) != path or not is_within(root, os.path.realpath(path)):
        fail("{} contains symlinked components or escapes its required root: {}".format(label, path))
    return path


def split_relative_path(relative_path, label):
    parts = relative_path.split("/")
    if not relative_path or any(part in ("", ".", "..") for part in parts):
        fail("{} has an unsafe relative path: {!r}".format(label, relative_path))
    return parts


def open_directory_chain(path, label):
    """Open an absolute directory one no-follow component at a time."""
    require_open_flags()
    path = os.path.abspath(path)
    if not os.path.isabs(path):
        fail("{} must be an absolute directory path".format(label))
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        descriptor = os.open(os.path.sep, flags)
    except OSError as exc:
        fail("cannot safely open filesystem root for {}: {}".format(label, exc))
    try:
        for component in [part for part in path.split(os.path.sep) if part]:
            try:
                child = os.open(component, flags, dir_fd=descriptor)
            except OSError as exc:
                fail("{} has a missing, non-directory, or symlinked component {!r}: {}".format(
                    label, component, exc))
            os.close(descriptor)
            descriptor = child
        if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
            fail("{} must be a directory".format(label))
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def open_relative_directory(parent_descriptor, relative_path, label):
    """Open a descendant directory from an already trusted parent descriptor."""
    require_open_flags()
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.dup(parent_descriptor)
    try:
        for component in split_relative_path(relative_path, label):
            try:
                child = os.open(component, flags, dir_fd=descriptor)
            except OSError as exc:
                fail("{} has a missing, non-directory, or symlinked component {!r}: {}".format(
                    label, component, exc))
            os.close(descriptor)
            descriptor = child
        if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
            fail("{} must be a directory".format(label))
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def read_regular_file_at(root_descriptor, relative_path, label):
    """Read a regular file below root with no-follow traversal for every component."""
    require_open_flags()
    parts = split_relative_path(relative_path, label)
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    file_flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        directory_flags |= os.O_CLOEXEC
        file_flags |= os.O_CLOEXEC
    directory_descriptor = os.dup(root_descriptor)
    file_descriptor = None
    try:
        for component in parts[:-1]:
            try:
                child = os.open(component, directory_flags, dir_fd=directory_descriptor)
            except OSError as exc:
                fail("{} has a missing, non-directory, or symlinked component {!r}: {}".format(
                    label, component, exc))
            os.close(directory_descriptor)
            directory_descriptor = child
        try:
            file_descriptor = os.open(parts[-1], file_flags, dir_fd=directory_descriptor)
        except OSError as exc:
            fail("{} is missing, a symlink, or cannot be safely opened: {}".format(label, exc))
        if not stat.S_ISREG(os.fstat(file_descriptor).st_mode):
            fail("{} must be a regular file".format(label))
        chunks = []
        while True:
            chunk = os.read(file_descriptor, 65536)
            if not chunk:
                break
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        if file_descriptor is not None:
            os.close(file_descriptor)
        os.close(directory_descriptor)
def validate_payload_entry_name(name, label):
    if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\x00" in name:
        fail("{} has an unsafe directory entry name {!r}".format(label, name))
    try:
        name.encode("utf-8")
    except UnicodeEncodeError:
        fail("{} has a non-UTF-8 directory entry name {!r}".format(label, name))


def walk_payload_tree(root_descriptor, label):
    """Descriptor-walk a payload tree without following symlinks or opening special files."""
    require_open_flags()
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        directory_flags |= os.O_CLOEXEC
    files = []
    directories = []

    def walk(directory_descriptor, prefix):
        try:
            names = os.listdir(directory_descriptor)
        except OSError as exc:
            fail("{} cannot be listed safely: {}".format(label, exc))
        for name in sorted(names):
            validate_payload_entry_name(name, label)
            relative_path = "{}/{}".format(prefix, name) if prefix else name
            split_relative_path(relative_path, "{} payload path".format(label))
            try:
                information = os.stat(name, dir_fd=directory_descriptor, follow_symlinks=False)
            except OSError as exc:
                fail("{} payload entry {!r} cannot be inspected safely: {}".format(
                    label, relative_path, exc
                ))
            mode = information.st_mode
            if stat.S_ISLNK(mode):
                fail("{} payload contains symlink {!r}".format(label, relative_path))
            if stat.S_ISREG(mode):
                files.append(relative_path)
                continue
            if not stat.S_ISDIR(mode):
                fail("{} payload entry {!r} must be a regular file or directory".format(
                    label, relative_path
                ))
            try:
                child_descriptor = os.open(name, directory_flags, dir_fd=directory_descriptor)
            except OSError as exc:
                fail("{} payload directory {!r} cannot be opened without following symlinks: {}".format(
                    label, relative_path, exc
                ))
            try:
                if not stat.S_ISDIR(os.fstat(child_descriptor).st_mode):
                    fail("{} payload directory {!r} changed while being opened".format(
                        label, relative_path
                    ))
                directories.append(relative_path)
                walk(child_descriptor, relative_path)
            finally:
                os.close(child_descriptor)

    root = os.dup(root_descriptor)
    try:
        if not stat.S_ISDIR(os.fstat(root).st_mode):
            fail("{} must be a directory".format(label))
        walk(root, "")
    finally:
        os.close(root)
    return {
        "files": tuple(sorted(files)),
        "directories": tuple(sorted(directories)),
    }


def expected_payload_directories(relative_paths):
    directories = set()
    for relative_path in relative_paths:
        parts = split_relative_path(relative_path, "tracked plugin inventory")
        for index in range(1, len(parts)):
            directories.add("/".join(parts[:index]))
    return tuple(sorted(directories))


def require_payload_tree_matches_inventory(tree, expected_files, label):
    actual_files = tree["files"]
    expected_files = tuple(sorted(expected_files))
    if actual_files != expected_files:
        missing = sorted(set(expected_files) - set(actual_files))
        extra = sorted(set(actual_files) - set(expected_files))
        fail("{} payload file inventory differs from candidate HEAD: missing {}; extra {}".format(
            label, missing, extra
        ))
    expected_directories = expected_payload_directories(expected_files)
    actual_directories = tree["directories"]
    if actual_directories != expected_directories:
        missing = sorted(set(expected_directories) - set(actual_directories))
        extra = sorted(set(actual_directories) - set(expected_directories))
        fail("{} payload directory shape differs from candidate HEAD: missing {}; extra {}".format(
            label, missing, extra
        ))


def payload_aggregate_digest(payloads):
    """Hash sorted UTF-8 relative paths and raw bytes with unambiguous lengths."""
    digest = hashlib.sha256()
    digest.update(b"oh-my-gjc plugin payload v1\x00")
    for relative_path in sorted(payloads):
        path_bytes = relative_path.encode("utf-8")
        payload = payloads[relative_path]
        digest.update(len(path_bytes).to_bytes(8, "big"))
        digest.update(path_bytes)
        digest.update(len(payload).to_bytes(8, "big"))
        digest.update(payload)
    return "sha256:" + digest.hexdigest()


def reject_duplicate_keys(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise DuplicateJsonKey(key)
        value[key] = item
    return value


def load_json_bytes(data, label):
    try:
        value = json.loads(
            data.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)),
        )
    except UnicodeDecodeError as exc:
        fail("{} is not valid UTF-8 JSON: {}".format(label, exc))
    except DuplicateJsonKey as exc:
        fail("{} contains duplicate JSON key {!r}".format(label, exc.args[0]))
    except (ValueError, json.JSONDecodeError) as exc:
        fail("{} is not valid UTF-8 JSON: {}".format(label, exc))
    if not isinstance(value, dict):
        fail("{} must contain a JSON object".format(label))
    return value


def required_string(mapping, key, label):
    value = mapping.get(key)
    if not isinstance(value, str):
        fail("{} must be a string".format(label))
    return value


def validated_version(value, label):
    if not isinstance(value, str) or not SEMVER_RE.fullmatch(value):
        fail("{} must be a valid SemVer string safe for the cache name".format(label))
    return value


def validate_marketplace(marketplace, plugin_manifest):
    if required_string(marketplace, "name", "marketplace top-level name") != PLUGIN_NAME:
        fail("marketplace top-level name must be {!r}".format(PLUGIN_NAME))
    entries = marketplace.get("plugins")
    if not isinstance(entries, list) or len(entries) != 1:
        fail("marketplace must expose exactly one plugin entry")
    entry = entries[0]
    if not isinstance(entry, dict):
        fail("marketplace plugin entry must be an object")
    if required_string(entry, "name", "marketplace entry name") != PLUGIN_NAME:
        fail("marketplace entry name must be {!r}".format(PLUGIN_NAME))
    if required_string(entry, "source", "marketplace entry source") != PLUGIN_SOURCE:
        fail("marketplace entry source must be {!r}".format(PLUGIN_SOURCE))
    metadata = marketplace.get("metadata")
    if not isinstance(metadata, dict):
        fail("marketplace metadata must be an object")
    if required_string(plugin_manifest, "name", "candidate plugin manifest name") != PLUGIN_NAME:
        fail("candidate plugin manifest name must be {!r}".format(PLUGIN_NAME))

    plugin_version = validated_version(
        plugin_manifest.get("version"), "candidate plugin manifest version"
    )
    metadata_version = validated_version(
        metadata.get("version"), "marketplace metadata.version"
    )
    entry_version = validated_version(entry.get("version"), "marketplace entry version")
    if plugin_version != metadata_version or plugin_version != entry_version:
        fail("plugin manifest version, marketplace metadata.version, and entry.version must match exactly")
    return plugin_version, {
        "plugin_manifest": plugin_version,
        "marketplace_metadata": metadata_version,
        "marketplace_entry": entry_version,
        "all_equal": True,
    }


def trusted_git_binary():
    """Resolve Git from fixed system locations and reject writable executable chains."""
    search_directories = ["/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin"]
    candidate = shutil.which("git", path=os.pathsep.join(search_directories))
    if not candidate:
        fail("trusted git executable was not found in fixed system locations")
    resolved = os.path.realpath(candidate)
    try:
        information = os.stat(resolved, follow_symlinks=False)
    except OSError as exc:
        fail("trusted git executable cannot be inspected: {}".format(exc))
    if not stat.S_ISREG(information.st_mode) or not os.access(resolved, os.X_OK):
        fail("trusted git executable must be an executable regular file")
    allowed_owners = {0}
    if hasattr(os, "getuid"):
        allowed_owners.add(os.getuid())
    current = resolved
    while True:
        component = os.stat(current, follow_symlinks=False)
        if component.st_uid not in allowed_owners or component.st_mode & 0o022:
            fail("trusted git path has unsafe ownership or permissions: {}".format(current))
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return resolved


GIT_BINARY = trusted_git_binary()


def git_environment():
    """Do not let caller-selected Git repository/worktree state redirect commands."""
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


def run_git(candidate, candidate_descriptor, arguments, purpose, text=True):
    """Run Git by path; Git exposes no portable directory-descriptor interface.

    Every invocation is bracketed by pathname-to-descriptor identity checks.
    """
    assert_path_matches_descriptor(candidate, candidate_descriptor, "candidate root")
    options = {
        "check": False,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "env": git_environment(),
    }
    if text:
        options.update({"text": True, "encoding": "utf-8", "errors": "replace"})
    try:
        result = subprocess.run([GIT_BINARY, "-C", candidate] + arguments, **options)
    except OSError as exc:
        fail("cannot run git to {}: {}".format(purpose, exc))
    assert_path_matches_descriptor(candidate, candidate_descriptor, "candidate root")
    return result


def git_head_blob(candidate, candidate_descriptor, head, relative_path, label):
    """Return a blob's immutable bytes, rejecting absent paths and non-blobs."""
    spec = "{}:{}".format(head, relative_path)
    exists = run_git(
        candidate,
        candidate_descriptor,
        ["cat-file", "-e", spec],
        "verify {} at HEAD".format(label),
    )
    if exists.returncode != 0:
        fail("{} is not a tracked blob at candidate HEAD".format(label))
    object_type = run_git(
        candidate,
        candidate_descriptor,
        ["cat-file", "-t", spec],
        "inspect {} at HEAD".format(label),
    )
    if object_type.returncode != 0 or object_type.stdout.strip() != "blob":
        fail("{} is not a tracked blob at candidate HEAD".format(label))
    result = run_git(
        candidate,
        candidate_descriptor,
        ["show", spec],
        "read {} at HEAD".format(label),
        text=False,
    )
    if result.returncode != 0:
        fail("could not read {} from candidate HEAD".format(label))
    return result.stdout
def git_head_plugin_inventory(candidate, candidate_descriptor, head):
    """Resolve every tracked plugin blob from trusted Git's NUL-delimited tree."""
    result = run_git(
        candidate,
        candidate_descriptor,
        ["ls-tree", "-r", "-z", "--full-tree", head, "--", PLUGIN_TREE],
        "list tracked plugin payload at HEAD",
        text=False,
    )
    if result.returncode != 0:
        fail("could not list tracked plugin payload at candidate HEAD")
    prefix = (PLUGIN_TREE + "/").encode("utf-8")
    inventory = {}
    entries = result.stdout.split(b"\x00")
    if entries[-1]:
        fail("trusted Git returned a malformed NUL-delimited plugin inventory")
    for entry in entries[:-1]:
        try:
            metadata, repository_path_bytes = entry.split(b"\t", 1)
            mode, object_type, _object_id = metadata.split(b" ", 2)
        except ValueError:
            fail("trusted Git returned a malformed plugin inventory entry")
        if object_type != b"blob":
            fail("tracked plugin inventory entry must be a blob")
        if not mode:
            fail("trusted Git returned a malformed plugin inventory mode")
        if not repository_path_bytes.startswith(prefix):
            fail("tracked plugin inventory path escapes the plugin tree")
        try:
            repository_path = repository_path_bytes.decode("utf-8")
        except UnicodeDecodeError:
            fail("tracked plugin inventory path is not valid UTF-8")
        relative_path = repository_path[len(PLUGIN_TREE) + 1:]
        parts = split_relative_path(relative_path, "tracked plugin inventory path")
        normalized_path = "/".join(parts)
        if relative_path != normalized_path:
            fail("tracked plugin inventory path is not normalized: {!r}".format(relative_path))
        if relative_path in inventory:
            fail("tracked plugin inventory contains duplicate path {!r}".format(relative_path))
        inventory[relative_path] = git_head_blob(
            candidate,
            candidate_descriptor,
            head,
            repository_path,
            "tracked plugin payload {!r}".format(relative_path),
        )
    if not inventory:
        fail("candidate HEAD tracked plugin inventory is empty")
    return {relative_path: inventory[relative_path] for relative_path in sorted(inventory)}


def verify_git_identity(candidate, candidate_descriptor, supplied_commit, expected_head=None):
    worktree = run_git(
        candidate,
        candidate_descriptor,
        ["rev-parse", "--is-inside-work-tree"],
        "inspect candidate",
    )
    if worktree.returncode != 0 or worktree.stdout.strip() != "true":
        fail("candidate is not a Git worktree: {}".format(candidate))

    top_level = run_git(
        candidate,
        candidate_descriptor,
        ["rev-parse", "--show-toplevel"],
        "resolve candidate worktree root",
    )
    if top_level.returncode != 0 or not top_level.stdout.strip():
        fail("candidate Git worktree root could not be resolved")
    top_level_path = canonical_directory(top_level.stdout.strip(), "candidate Git worktree root")
    if top_level_path != candidate:
        fail("candidate must be the Git worktree top-level; nested candidates are rejected")

    superproject = run_git(
        candidate,
        candidate_descriptor,
        ["rev-parse", "--show-superproject-working-tree"],
        "inspect candidate submodule state",
    )
    if superproject.returncode != 0:
        fail("could not inspect whether candidate is a submodule")
    if superproject.stdout.strip():
        fail("candidate is a Git submodule; submodule candidates are ambiguous and rejected")

    head_result = run_git(
        candidate,
        candidate_descriptor,
        ["rev-parse", "HEAD"],
        "resolve candidate HEAD",
    )
    head = head_result.stdout.strip()
    if head_result.returncode != 0 or not COMMIT_RE.fullmatch(head):
        fail("candidate Git HEAD could not be resolved as a lowercase 40-hex commit")
    if expected_head is not None and head != expected_head:
        fail("candidate Git HEAD changed during provenance validation")
    if not NORMALIZABLE_COMMIT_RE.fullmatch(supplied_commit):
        fail("--commit must be exactly 40 hexadecimal characters; abbreviated or malformed commits are rejected")
    normalized_commit = supplied_commit.lower()
    if normalized_commit != head:
        fail("--commit does not match independently resolved candidate Git HEAD")

    status = run_git(
        candidate,
        candidate_descriptor,
        ["status", "--porcelain", "--untracked-files=all"],
        "inspect candidate cleanliness",
    )
    if status.returncode != 0:
        fail("could not inspect candidate Git status")
    if status.stdout:
        fail("candidate Git worktree is dirty; tracked and untracked non-ignored files must be clean")
    return head, normalized_commit


def expected_cache_parent():
    home = os.environ.get("HOME")
    if not home or not os.path.isabs(home):
        fail("HOME must be an absolute path to validate the installed cache location")
    return canonical_directory(
        os.path.join(os.path.abspath(home), ".gjc", "plugins", "cache", "plugins"),
        "authoritative $HOME/.gjc/plugins/cache/plugins directory",
    )


def validate_cache(cache, version):
    cache_parent = os.path.dirname(cache)
    expected_parent = expected_cache_parent()
    if cache_parent != expected_parent:
        fail("cache parent must be exactly $HOME/.gjc/plugins/cache/plugins")
    expected_basename = CACHE_PREFIX + version
    if os.path.basename(cache) != expected_basename:
        fail("cache basename must be exactly {!r}".format(expected_basename))
    return expected_parent, expected_basename


def compare_bytes(expected, actual, label):
    if actual != expected:
        fail("{} bytes differ from the tracked candidate HEAD blob".format(label))


def compare_markers(
    candidate_plugin_fd,
    cache_fd,
    head_blobs,
    assert_candidate_identity,
    assert_candidate_plugin_identity,
    assert_cache_identity,
):
    markers = {}
    for relative_path in MARKERS:
        head_blob = head_blobs["plugins/{}/{}".format(PLUGIN_NAME, relative_path)]
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        candidate_blob = read_regular_file_at(
            candidate_plugin_fd, relative_path, "candidate marker {!r}".format(relative_path)
        )
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        assert_cache_identity()
        cache_blob = read_regular_file_at(
            cache_fd, relative_path, "cache marker {!r}".format(relative_path)
        )
        assert_cache_identity()
        compare_bytes(head_blob, candidate_blob, "candidate marker {!r}".format(relative_path))
        compare_bytes(head_blob, cache_blob, "cache marker {!r}".format(relative_path))
        head_hash = sha256_bytes(head_blob)
        candidate_hash = sha256_bytes(candidate_blob)
        installed_hash = sha256_bytes(cache_blob)
        markers[relative_path] = {
            "candidate_head": head_hash,
            "candidate": candidate_hash,
            "installed": installed_hash,
            "head_matches_candidate": True,
            "head_matches_installed": True,
            "match": True,
        }
    return markers
def payload_digest_snapshot(
    candidate_fd,
    candidate_plugin_fd,
    cache_fd,
    head_plugin_blobs,
    marketplace_head,
    bootstrap_head,
    assert_candidate_identity,
    assert_candidate_plugin_identity,
    assert_cache_identity,
):
    """Require complete plugin-tree bytes and shape to equal HEAD without following links."""
    expected_files = tuple(sorted(head_plugin_blobs))

    def snapshot_candidate_payload():
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        tree = walk_payload_tree(candidate_plugin_fd, "candidate plugin")
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        require_payload_tree_matches_inventory(tree, expected_files, "candidate plugin")
        payloads = {}
        for relative_path in expected_files:
            assert_candidate_identity()
            assert_candidate_plugin_identity()
            payload = read_regular_file_at(
                candidate_plugin_fd,
                relative_path,
                "candidate plugin payload file {!r}".format(relative_path),
            )
            assert_candidate_identity()
            assert_candidate_plugin_identity()
            compare_bytes(head_plugin_blobs[relative_path], payload, "candidate plugin payload file {!r}".format(
                relative_path
            ))
            payloads[relative_path] = payload
        return {
            "files": tree["files"],
            "directories": tree["directories"],
            "file_count": len(payloads),
            "aggregate_digest": payload_aggregate_digest(payloads),
        }

    def snapshot_cache_payload():
        assert_cache_identity()
        tree = walk_payload_tree(cache_fd, "cache plugin")
        assert_cache_identity()
        require_payload_tree_matches_inventory(tree, expected_files, "cache plugin")
        payloads = {}
        for relative_path in expected_files:
            assert_cache_identity()
            payload = read_regular_file_at(
                cache_fd,
                relative_path,
                "cache plugin payload file {!r}".format(relative_path),
            )
            assert_cache_identity()
            compare_bytes(head_plugin_blobs[relative_path], payload, "cache plugin payload file {!r}".format(
                relative_path
            ))
            payloads[relative_path] = payload
        return {
            "files": tree["files"],
            "directories": tree["directories"],
            "file_count": len(payloads),
            "aggregate_digest": payload_aggregate_digest(payloads),
        }

    assert_candidate_identity()
    marketplace_candidate = read_regular_file_at(
        candidate_fd, MARKETPLACE_MANIFEST, "candidate snapshot marketplace manifest"
    )
    assert_candidate_identity()
    compare_bytes(
        marketplace_head, marketplace_candidate, "candidate snapshot marketplace manifest"
    )
    candidate_payload = snapshot_candidate_payload()
    cache_payload = snapshot_cache_payload()
    assert_candidate_identity()
    bootstrap_candidate = read_regular_file_at(
        candidate_fd, ROOT_INSTALLER, "candidate bootstrap install.sh"
    )
    assert_candidate_identity()
    compare_bytes(bootstrap_head, bootstrap_candidate, "candidate bootstrap install.sh")
    return {
        "candidate": candidate_payload,
        "cache": cache_payload,
        "candidate_marketplace_manifest": sha256_bytes(marketplace_candidate),
        "candidate_bootstrap_install_sh": sha256_bytes(bootstrap_candidate),
    }


def final_revalidate(
    candidate,
    candidate_fd,
    candidate_plugin_fd,
    cache_fd,
    supplied_commit,
    first_head,
    head_plugin_blobs,
    marketplace_head,
    bootstrap_head,
    first_snapshot,
    assert_candidate_identity,
    assert_candidate_plugin_identity,
    assert_cache_identity,
):
    """Require HEAD, cleanliness, full plugin payload, and bootstrap evidence to persist."""
    assert_candidate_identity()
    assert_candidate_plugin_identity()
    assert_cache_identity()
    final_head, _ = verify_git_identity(
        candidate,
        candidate_fd,
        supplied_commit,
        expected_head=first_head,
    )
    if final_head != first_head:
        fail("candidate Git HEAD changed during provenance validation")
    final_snapshot = payload_digest_snapshot(
        candidate_fd,
        candidate_plugin_fd,
        cache_fd,
        head_plugin_blobs,
        marketplace_head,
        bootstrap_head,
        assert_candidate_identity,
        assert_candidate_plugin_identity,
        assert_cache_identity,
    )
    if final_snapshot != first_snapshot:
        fail("candidate or cache plugin payload bytes or inventory changed during provenance validation")
    assert_candidate_identity()
    assert_candidate_plugin_identity()
    assert_cache_identity()
    return final_snapshot


def existing_output_is_safe(parent_descriptor, output_name):
    try:
        mode = os.stat(output_name, dir_fd=parent_descriptor, follow_symlinks=False).st_mode
    except FileNotFoundError:
        return
    except OSError as exc:
        fail("cannot inspect existing attestation output safely: {}".format(exc))
    if stat.S_ISLNK(mode):
        fail("attestation output path must not be a symlink")
    if not stat.S_ISREG(mode):
        fail("existing attestation output must be a regular file")


def open_temporary_output(parent_descriptor, output_name):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    for _ in range(32):
        temporary_name = ".{}.{}.tmp".format(output_name, secrets.token_hex(16))
        try:
            descriptor = os.open(temporary_name, flags, 0o600, dir_fd=parent_descriptor)
        except FileExistsError:
            continue
        except OSError as exc:
            fail("could not create temporary attestation safely: {}".format(exc))
        return descriptor, temporary_name
    fail("could not allocate a unique temporary attestation name")


def atomic_write_json(
    output_path,
    record,
    identity_checks,
    pre_replace_final_revalidation=None,
):
    """Atomically publish after the optional full revalidation callback; os.replace is publication."""
    require_open_flags()
    output_path = os.path.abspath(output_path)
    output_parent = os.path.dirname(output_path)
    output_name = os.path.basename(output_path)
    if not output_name or output_name in (".", ".."):
        fail("attestation output path must name a file")

    parent_descriptor = open_directory_chain(output_parent, "attestation output parent")
    temporary_descriptor = None
    temporary_name = None
    try:
        assert_path_matches_descriptor(
            output_parent, parent_descriptor, "attestation output parent"
        )
        for assert_identity in identity_checks:
            assert_identity()
        existing_output_is_safe(parent_descriptor, output_name)
        temporary_descriptor, temporary_name = open_temporary_output(parent_descriptor, output_name)
        try:
            os.fchmod(temporary_descriptor, 0o600)
            data = (json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
            offset = 0
            while offset < len(data):
                written = os.write(temporary_descriptor, data[offset:])
                if written <= 0:
                    fail("could not write the temporary attestation completely")
                offset += written
            os.fsync(temporary_descriptor)
        finally:
            os.close(temporary_descriptor)
            temporary_descriptor = None
        assert_path_matches_descriptor(
            output_parent, parent_descriptor, "attestation output parent"
        )
        for assert_identity in identity_checks:
            assert_identity()
        if pre_replace_final_revalidation is not None:
            pre_replace_final_revalidation()
        os.replace(
            temporary_name,
            output_name,
            src_dir_fd=parent_descriptor,
            dst_dir_fd=parent_descriptor,
        )
        temporary_name = None
        try:
            os.fsync(parent_descriptor)
        except OSError as exc:
            fail(
                "attestation was published but parent directory fsync failed; "
                "durability is uncertain: {}".format(exc)
            )
    except OSError as exc:
        fail("could not atomically write attestation: {}".format(exc))
    finally:
        if temporary_descriptor is not None:
            os.close(temporary_descriptor)
        if temporary_name is not None:
            try:
                os.unlink(temporary_name, dir_fd=parent_descriptor)
            except OSError:
                pass
        os.close(parent_descriptor)


def build_attestation(arguments):
    require_open_flags()
    candidate = canonical_directory(arguments.candidate, "candidate root")
    candidate_fd = open_directory_chain(candidate, "candidate root")
    cache_parent_fd = None
    cache_fd = None
    candidate_plugin_fd = None
    try:
        candidate_device, candidate_inode = assert_path_matches_descriptor(
            candidate, candidate_fd, "candidate root"
        )
        resolved_head, normalized_commit = verify_git_identity(
            candidate, candidate_fd, arguments.commit
        )
        assert_path_matches_descriptor(candidate, candidate_fd, "candidate root")
        candidate_plugin_path = contained_path(
            candidate,
            os.path.join(candidate, "plugins", PLUGIN_NAME),
            "candidate plugin root",
            "directory",
        )
        candidate_plugin_fd = open_relative_directory(
            candidate_fd, "plugins/{}".format(PLUGIN_NAME), "candidate plugin root"
        )
        candidate_plugin_device, candidate_plugin_inode = assert_path_matches_descriptor(
            candidate_plugin_path, candidate_plugin_fd, "candidate plugin root"
        )
        assert_path_matches_descriptor(candidate, candidate_fd, "candidate root")

        def assert_candidate_identity():
            return assert_path_matches_descriptor(candidate, candidate_fd, "candidate root")

        def assert_candidate_plugin_identity():
            return assert_path_matches_descriptor(
                candidate_plugin_path, candidate_plugin_fd, "candidate plugin root"
            )

        head_blobs = {
            MARKETPLACE_MANIFEST: git_head_blob(
                candidate,
                candidate_fd,
                resolved_head,
                MARKETPLACE_MANIFEST,
                "candidate marketplace manifest",
            ),
            ROOT_INSTALLER: git_head_blob(
                candidate,
                candidate_fd,
                resolved_head,
                ROOT_INSTALLER,
                "candidate bootstrap install.sh",
            ),
        }
        head_plugin_blobs = git_head_plugin_inventory(
            candidate, candidate_fd, resolved_head
        )
        for relative_path, payload in head_plugin_blobs.items():
            head_blobs["{}/{}".format(PLUGIN_TREE, relative_path)] = payload
        for relative_path in MARKERS:
            if relative_path not in head_plugin_blobs:
                fail("candidate marker {!r} is not a tracked blob at candidate HEAD".format(
                    relative_path
                ))
        head_payload_digest = payload_aggregate_digest(head_plugin_blobs)
        marketplace_head = head_blobs[MARKETPLACE_MANIFEST]
        plugin_head = head_blobs[PLUGIN_MANIFEST]
        assert_candidate_identity()
        marketplace_live = read_regular_file_at(
            candidate_fd, MARKETPLACE_MANIFEST, "candidate marketplace manifest"
        )
        assert_candidate_identity()
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        plugin_live = read_regular_file_at(
            candidate_plugin_fd, ".claude-plugin/plugin.json", "candidate plugin manifest"
        )
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        compare_bytes(marketplace_head, marketplace_live, "candidate marketplace manifest")
        compare_bytes(plugin_head, plugin_live, "candidate plugin manifest")
        marketplace = load_json_bytes(marketplace_head, "candidate HEAD marketplace manifest")
        plugin_manifest = load_json_bytes(plugin_head, "candidate HEAD plugin manifest")
        version, version_parity = validate_marketplace(marketplace, plugin_manifest)

        cache = canonical_directory(arguments.cache, "cache root")
        cache_parent, expected_basename = validate_cache(cache, version)
        output_path = reject_output_inside_input_roots(arguments.out, candidate, cache)
        cache_parent_fd = open_directory_chain(cache_parent, "authoritative cache parent")
        assert_path_matches_descriptor(
            cache_parent, cache_parent_fd, "authoritative cache parent"
        )
        cache_fd = open_relative_directory(cache_parent_fd, expected_basename, "cache root")
        cache_device, cache_inode = assert_path_matches_descriptor(
            cache, cache_fd, "cache root"
        )

        def assert_cache_identity():
            return assert_path_matches_descriptor(cache, cache_fd, "cache root")

        assert_cache_identity()
        cache_manifest_bytes = read_regular_file_at(
            cache_fd, ".claude-plugin/plugin.json", "cache plugin manifest"
        )
        assert_cache_identity()
        cache_manifest = load_json_bytes(cache_manifest_bytes, "cache plugin manifest")
        if required_string(cache_manifest, "name", "cache plugin manifest name") != PLUGIN_NAME:
            fail("cache plugin manifest name must be {!r}".format(PLUGIN_NAME))
        if validated_version(cache_manifest.get("version"), "cache plugin manifest version") != version:
            fail("cache plugin manifest version must match the candidate version")
        compare_bytes(plugin_head, cache_manifest_bytes, "cache plugin manifest")
        markers = compare_markers(
            candidate_plugin_fd,
            cache_fd,
            head_blobs,
            assert_candidate_identity,
            assert_candidate_plugin_identity,
            assert_cache_identity,
        )
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        assert_cache_identity()
        first_snapshot = payload_digest_snapshot(
            candidate_fd,
            candidate_plugin_fd,
            cache_fd,
            head_plugin_blobs,
            head_blobs[MARKETPLACE_MANIFEST],
            head_blobs[ROOT_INSTALLER],
            assert_candidate_identity,
            assert_candidate_plugin_identity,
            assert_cache_identity,
        )

        record = {
            "candidate_repo": candidate,
            "candidate_commit": resolved_head,
            "supplied_commit": normalized_commit,
            "commit_matches_head": True,
            "candidate_identity": {
                "device": candidate_device,
                "inode": candidate_inode,
                "pathname_matches_descriptor": True,
                "plugin_device": candidate_plugin_device,
                "plugin_inode": candidate_plugin_inode,
                "plugin_pathname_matches_descriptor": True,
            },
            "threat_model": (
                "Caller retains exclusive control of candidate and cache for this bounded gate; "
                "persistent mutation is detected by repeated descriptor, Git, complete plugin-tree "
                "inventory, and byte checks. A malicious same-UID actor can still swap and restore "
                "state between syscalls; this gate provides no cryptographic path lock."
            ),
            "marketplace_ref_used": arguments.marketplace_ref,
            "marketplace_ref_status": (
                "informational only; no independently verifiable binding was supplied; "
                "Gate 2 and Gate 3 remain separate."
            ),
            "manifest_identity": {
                "marketplace_head": sha256_bytes(marketplace_head),
                "marketplace_candidate": sha256_bytes(marketplace_live),
                "marketplace_matches_head": True,
                "plugin_head": sha256_bytes(plugin_head),
                "plugin_candidate": sha256_bytes(plugin_live),
                "plugin_cache": sha256_bytes(cache_manifest_bytes),
                "plugin_candidate_matches_head": True,
                "plugin_cache_matches_head": True,
            },
            "bootstrap_evidence": {
                "path": ROOT_INSTALLER,
                "head": sha256_bytes(head_blobs[ROOT_INSTALLER]),
                "candidate": first_snapshot["candidate_bootstrap_install_sh"],
                "candidate_matches_head": True,
                "scope": (
                    "tracked candidate root installer only; install.sh is not a member of the "
                    "installed plugin-cache payload proof"
                ),
            },
            "version_parity": version_parity,
            "cache_identity": {
                "root": cache,
                "parent": cache_parent,
                "expected_basename": expected_basename,
                "basename_matches_version": True,
                "direct_child_of_authoritative_plugins_cache": True,
                "device": cache_device,
                "inode": cache_inode,
                "pathname_matches_descriptor": True,
            },
            "plugin_payload_identity": {
                "tracked_inventory": {
                    "ordering": "lexicographic safe relative paths",
                    "file_count": len(head_plugin_blobs),
                    "aggregate_digest": head_payload_digest,
                },
                "candidate": {
                    "file_count": first_snapshot["candidate"]["file_count"],
                    "aggregate_digest": first_snapshot["candidate"]["aggregate_digest"],
                },
                "installed_cache": {
                    "file_count": first_snapshot["cache"]["file_count"],
                    "aggregate_digest": first_snapshot["cache"]["aggregate_digest"],
                },
                "candidate_file_set_matches_tracked_head": True,
                "installed_file_set_matches_tracked_head": True,
                "candidate_directory_shape_matches_tracked_head": True,
                "installed_directory_shape_matches_tracked_head": True,
                "candidate_bytes_match_tracked_head": True,
                "installed_bytes_match_tracked_head": True,
            },
            "content_markers": markers,
            "missing_markers": [],
            "local_vs_installed_payload_match": True,
            "final_revalidation": {
                "head_matches_first_pass": True,
                "clean_status_rechecked": True,
                "payload_digest_snapshot_matches_first_pass": True,
                "root_descriptor_identities_rechecked": True,
                "both_snapshots_match_resolved_head": True,
                "marketplace_manifest_rechecked": True,
                "plugin_subtree_identity_rechecked": True,
                "full_plugin_tree_file_set_rechecked": True,
                "full_plugin_tree_directory_shape_rechecked": True,
                "full_plugin_tree_bytes_rechecked": True,
                "bootstrap_install_sh_rechecked": True,
                "pre_replace_full_revalidation": True,
            },
            "output_durability": (
                "os.replace is the publication boundary; successful completion also fsyncs the "
                "parent directory. A parent-fsync failure returns failure after publication, "
                "so the attestation may already exist with uncertain durability."
            ),
        }
        assert_candidate_identity()
        assert_candidate_plugin_identity()
        assert_cache_identity()
        final_revalidate(
            candidate,
            candidate_fd,
            candidate_plugin_fd,
            cache_fd,
            arguments.commit,
            resolved_head,
            head_plugin_blobs,
            head_blobs[MARKETPLACE_MANIFEST],
            head_blobs[ROOT_INSTALLER],
            first_snapshot,
            assert_candidate_identity,
            assert_candidate_plugin_identity,
            assert_cache_identity,
        )
        def pre_replace_final_revalidation():
            return final_revalidate(
                candidate,
                candidate_fd,
                candidate_plugin_fd,
                cache_fd,
                arguments.commit,
                resolved_head,
                head_plugin_blobs,
                head_blobs[MARKETPLACE_MANIFEST],
                head_blobs[ROOT_INSTALLER],
                first_snapshot,
                assert_candidate_identity,
                assert_candidate_plugin_identity,
                assert_cache_identity,
            )

        atomic_write_json(
            output_path,
            record,
            (
                assert_candidate_identity,
                assert_candidate_plugin_identity,
                assert_cache_identity,
            ),
            pre_replace_final_revalidation,
        )
        return record
    finally:
        if cache_fd is not None:
            os.close(cache_fd)
        if cache_parent_fd is not None:
            os.close(cache_parent_fd)
        if candidate_plugin_fd is not None:
            os.close(candidate_plugin_fd)
        os.close(candidate_fd)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True, help="local candidate Git worktree root")
    parser.add_argument("--cache", required=True, help="installed cache plugin root")
    parser.add_argument("--commit", required=True, help="candidate Git HEAD (full 40-hex SHA)")
    parser.add_argument(
        "--marketplace-ref",
        required=True,
        help="informational marketplace reference; not independently bound by this gate",
    )
    parser.add_argument("--out", required=True, help="attestation JSON path")
    arguments = parser.parse_args(argv)

    try:
        record = build_attestation(arguments)
    except GateError as exc:
        print("PROVENANCE FAIL: {}".format(exc), file=sys.stderr)
        return 1

    print(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True))
    print("provenance OK: candidate HEAD, cache identity, and complete plugin-tree payload bytes match", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
