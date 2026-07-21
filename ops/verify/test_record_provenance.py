#!/usr/bin/env python3
"""Disposable stdlib tests for the provenance identity hard gate.

Run manually with:
  python3 -m unittest ops.verify.test_record_provenance
"""
import errno
import hashlib
import importlib.util
from unittest import mock
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("record_provenance.py")
MODULE_SPEC = importlib.util.spec_from_file_location("record_provenance_under_test", SCRIPT)
PROVENANCE = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(PROVENANCE)
PLUGIN_NAME = "oh-my-gajae-code"
PLUGIN_SOURCE = "./plugins/{}".format(PLUGIN_NAME)
CACHE_PREFIX = "{}___{}___".format(PLUGIN_NAME, PLUGIN_NAME)
# Historical v0.27 identity; retained only for explicit rejection coverage.
OLD_PLUGIN_NAME = "oh-my-gjc"
OLD_PLUGIN_SOURCE = "./plugins/{}".format(OLD_PLUGIN_NAME)
OLD_CACHE_PREFIX = "{}___{}___".format(OLD_PLUGIN_NAME, OLD_PLUGIN_NAME)
VERSION = "1.2.3"
MARKERS = [
    "bin/install-skill.sh",
    ".claude-plugin/plugin.json",
    "templates/omg.md",
    "templates/setup.md",
    "templates/gate.md",
    "templates/gate-always.md",
    "templates/no-english.md",
    "templates/insane-review.md",
    "templates/deep-onboarding.md",
    "templates/multi-harness.md",
    "bin/multi-harness-research.mjs",
    "skills/insane-review/SKILL.md",
    "skills/adaptive-response/SKILL.md",
    "skills/no-english/SKILL.md",
    "skills/extragoal/SKILL.md",
    "skills/deep-onboarding/SKILL.md",
    "skills/multi-harness-research/SKILL.md",
]
NON_MARKER_PAYLOADS = [
    "bin/pack_and_ask.py",
    "bin/collect.ts",
    "templates/non-marker-template.md",
    "skills/non-marker-skill/SKILL.md",
    "references/non-marker-reference.md",
]
TRACKED_PLUGIN_FILES = frozenset(MARKERS + NON_MARKER_PAYLOADS)


class RecordProvenanceTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.home = self.root / "home"
        self.candidate = self.root / "candidate"
        self.cache_parent = self.home / ".gjc" / "plugins" / "cache" / "plugins"
        self.cache = self.cache_parent / (CACHE_PREFIX + VERSION)
        self._create_matching_fixture(self.candidate, self.cache)
        self._git("init", "-q")
        self._git("config", "user.email", "provenance@example.test")
        self._git("config", "user.name", "Provenance Test")
        self._git("add", "-A")
        self._git("commit", "-qm", "fixture")
        self.head = self._git("rev-parse", "HEAD").stdout.strip()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _git(self, *arguments):
        return subprocess.run(
            ["git", "-C", str(self.candidate), *arguments],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def _candidate_marker(self, relative_path):
        return self.candidate / "plugins" / PLUGIN_NAME / relative_path

    def _cache_marker(self, cache, relative_path):
        return cache / relative_path

    def _marketplace_document(self):
        return {
            "name": PLUGIN_NAME,
            "metadata": {"version": VERSION},
            "plugins": [
                {
                    "name": PLUGIN_NAME,
                    "source": PLUGIN_SOURCE,
                    "version": VERSION,
                }
            ],
        }

    def _plugin_document(self):
        return {"name": PLUGIN_NAME, "version": VERSION}

    def _write_json(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def _create_matching_fixture(self, candidate, cache):
        marketplace_path = candidate / ".claude-plugin" / "marketplace.json"
        candidate_manifest = candidate / "plugins" / PLUGIN_NAME / ".claude-plugin" / "plugin.json"
        self._write_json(marketplace_path, self._marketplace_document())
        self._write_json(candidate_manifest, self._plugin_document())
        (candidate / "install.sh").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        for relative_path in MARKERS + NON_MARKER_PAYLOADS:
            candidate_path = candidate / "plugins" / PLUGIN_NAME / relative_path
            cache_path = cache / relative_path
            candidate_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            if relative_path == ".claude-plugin/plugin.json":
                payload = candidate_manifest.read_bytes()
            else:
                payload = ("fixture payload: " + relative_path + "\n").encode("utf-8")
            candidate_path.write_bytes(payload)
            cache_path.write_bytes(payload)

    def _commit_candidate_changes(self):
        self._git("add", "-A")
        self._git("commit", "-qm", "fixture update")
        self.head = self._git("rev-parse", "HEAD").stdout.strip()

    def _invoke(self, *, candidate=None, cache=None, commit=None, output=None, environment=None):
        candidate = self.candidate if candidate is None else Path(candidate)
        cache = self.cache if cache is None else Path(cache)
        commit = self.head if commit is None else commit
        output = self.root / "provenance.json" if output is None else Path(output)
        execution_environment = os.environ.copy()
        execution_environment["HOME"] = str(self.home)
        if environment:
            execution_environment.update(environment)
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--candidate",
                str(candidate),
                "--cache",
                str(cache),
                "--commit",
                commit,
                "--marketplace-ref",
                "local-candidate-ref",
                "--out",
                str(output),
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=execution_environment,
        )
    def _direct_arguments(self, output):
        return [
            "--candidate",
            str(self.candidate),
            "--cache",
            str(self.cache),
            "--commit",
            self.head,
            "--marketplace-ref",
            "local-candidate-ref",
            "--out",
            str(output),
        ]

    def _assert_failure_untouched(self, expected_message, **invoke_arguments):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        result = self._invoke(output=output, **invoke_arguments)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PROVENANCE FAIL:", result.stderr)
        self.assertIn(expected_message, result.stderr)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")
        return result

    def _restore_marketplace(self):
        self._write_json(
            self.candidate / ".claude-plugin" / "marketplace.json",
            self._marketplace_document(),
        )
        self._commit_candidate_changes()

    def _replace_cache_with_candidate_plugin(self):
        shutil.rmtree(self.cache)
        shutil.copytree(self.candidate / "plugins" / PLUGIN_NAME, self.cache)

    def test_success_writes_atomic_restrictive_attestation_with_head_evidence(self):
        output = self.root / "attestations" / "provenance.json"
        output.parent.mkdir()
        output.write_text("old record\n", encoding="utf-8")
        os.chmod(output, 0o644)

        result = self._invoke(output=output)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        record = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(record["candidate_repo"], str(self.candidate))
        self.assertEqual(record["candidate_commit"], self.head)
        self.assertEqual(record["supplied_commit"], self.head)
        self.assertTrue(record["commit_matches_head"])
        self.assertIsInstance(record["candidate_identity"]["device"], int)
        self.assertIsInstance(record["candidate_identity"]["inode"], int)
        self.assertTrue(record["candidate_identity"]["pathname_matches_descriptor"])
        self.assertIsInstance(record["candidate_identity"]["plugin_device"], int)
        self.assertIsInstance(record["candidate_identity"]["plugin_inode"], int)
        self.assertTrue(record["candidate_identity"]["plugin_pathname_matches_descriptor"])
        self.assertEqual(record["version_parity"]["plugin_manifest"], VERSION)
        self.assertEqual(PROVENANCE.PLUGIN_NAME, PLUGIN_NAME)
        self.assertEqual(PROVENANCE.PLUGIN_SOURCE, PLUGIN_SOURCE)
        self.assertEqual(PROVENANCE.CACHE_PREFIX, CACHE_PREFIX)
        self.assertTrue(record["version_parity"]["all_equal"])
        self.assertEqual(record["cache_identity"]["root"], str(self.cache))
        self.assertEqual(record["cache_identity"]["parent"], str(self.cache_parent))
        self.assertEqual(record["cache_identity"]["expected_basename"], self.cache.name)
        self.assertTrue(record["cache_identity"]["direct_child_of_authoritative_plugins_cache"])
        self.assertIsInstance(record["cache_identity"]["device"], int)
        self.assertIsInstance(record["cache_identity"]["inode"], int)
        self.assertTrue(record["cache_identity"]["pathname_matches_descriptor"])
        self.assertTrue(record["manifest_identity"]["marketplace_matches_head"])
        self.assertTrue(record["manifest_identity"]["plugin_candidate_matches_head"])
        self.assertTrue(record["manifest_identity"]["plugin_cache_matches_head"])
        self.assertEqual(set(record["content_markers"]), set(MARKERS))
        for evidence in record["content_markers"].values():
            self.assertTrue(evidence["match"])
            self.assertTrue(evidence["head_matches_candidate"])
            self.assertTrue(evidence["head_matches_installed"])
            self.assertEqual(evidence["candidate_head"], evidence["candidate"])
            self.assertEqual(evidence["candidate"], evidence["installed"])
            self.assertRegex(evidence["candidate"], r"^sha256:[0-9a-f]{64}$")
        expected_payloads = {
            relative_path: self._candidate_marker(relative_path).read_bytes()
            for relative_path in TRACKED_PLUGIN_FILES
        }
        expected_aggregate_digest = PROVENANCE.payload_aggregate_digest(expected_payloads)
        payload_identity = record["plugin_payload_identity"]
        self.assertEqual(
            payload_identity["tracked_inventory"]["file_count"], len(TRACKED_PLUGIN_FILES)
        )
        self.assertEqual(
            payload_identity["tracked_inventory"]["aggregate_digest"], expected_aggregate_digest
        )
        self.assertEqual(
            payload_identity["candidate"]["aggregate_digest"], expected_aggregate_digest
        )
        self.assertEqual(
            payload_identity["installed_cache"]["aggregate_digest"], expected_aggregate_digest
        )
        self.assertEqual(
            payload_identity["candidate"]["file_count"], len(TRACKED_PLUGIN_FILES)
        )
        self.assertEqual(
            payload_identity["installed_cache"]["file_count"], len(TRACKED_PLUGIN_FILES)
        )
        self.assertTrue(payload_identity["candidate_file_set_matches_tracked_head"])
        self.assertTrue(payload_identity["installed_file_set_matches_tracked_head"])
        self.assertTrue(payload_identity["candidate_bytes_match_tracked_head"])
        self.assertTrue(payload_identity["installed_bytes_match_tracked_head"])
        self.assertTrue(record["local_vs_installed_payload_match"])
        bootstrap = record["bootstrap_evidence"]
        self.assertEqual(bootstrap["path"], "install.sh")
        self.assertEqual(
            bootstrap["head"], PROVENANCE.sha256_bytes((self.candidate / "install.sh").read_bytes())
        )
        self.assertEqual(bootstrap["head"], bootstrap["candidate"])
        self.assertTrue(bootstrap["candidate_matches_head"])
        self.assertNotIn("installed", bootstrap)
        self.assertIn("not a member of the installed plugin-cache", bootstrap["scope"])
        self.assertIn("informational only", record["marketplace_ref_status"])
        self.assertIn("review and publication remain separate", record["marketplace_ref_status"])
        self.assertIn("exclusive control", record["threat_model"])
        self.assertIn("same-UID actor", record["threat_model"])
        self.assertTrue(record["final_revalidation"]["head_matches_first_pass"])
        self.assertTrue(record["final_revalidation"]["clean_status_rechecked"])
        self.assertTrue(record["final_revalidation"]["payload_digest_snapshot_matches_first_pass"])
        self.assertTrue(record["final_revalidation"]["root_descriptor_identities_rechecked"])
        self.assertTrue(record["final_revalidation"]["both_snapshots_match_resolved_head"])
        self.assertTrue(record["final_revalidation"]["marketplace_manifest_rechecked"])
        self.assertTrue(record["final_revalidation"]["plugin_subtree_identity_rechecked"])
        self.assertTrue(record["final_revalidation"]["full_plugin_tree_file_set_rechecked"])
        self.assertTrue(record["final_revalidation"]["full_plugin_tree_directory_shape_rechecked"])
        self.assertTrue(record["final_revalidation"]["full_plugin_tree_bytes_rechecked"])
        self.assertTrue(record["final_revalidation"]["bootstrap_install_sh_rechecked"])
        self.assertTrue(record["final_revalidation"]["pre_replace_full_revalidation"])
        self.assertIn("os.replace is the publication boundary", record["output_durability"])
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertEqual(json.loads(result.stdout), record)
        self.assertIn("complete plugin-tree payload bytes match", result.stderr)

    def test_payload_aggregate_digest_uses_v2_domain_separator(self):
        payloads = {"fixture.txt": b"fixture payload\n"}
        expected = hashlib.sha256()
        expected.update(b"oh-my-gajae-code plugin payload v2\x00")
        for relative_path in sorted(payloads):
            path_bytes = relative_path.encode("utf-8")
            payload = payloads[relative_path]
            expected.update(len(path_bytes).to_bytes(8, "big"))
            expected.update(path_bytes)
            expected.update(len(payload).to_bytes(8, "big"))
            expected.update(payload)

        self.assertEqual(
            PROVENANCE.payload_aggregate_digest(payloads),
            "sha256:" + expected.hexdigest(),
        )

    def test_uppercase_full_commit_is_normalized(self):
        result = self._invoke(commit=self.head.upper())

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["supplied_commit"], self.head)
        self.assertEqual(record["candidate_commit"], self.head)

    def test_false_malformed_or_abbreviated_commit_leaves_existing_output_untouched(self):
        cases = (
            ("0" * 40, "does not match independently resolved"),
            (self.head[:12], "--commit must be exactly 40 hexadecimal"),
            ("not-a-commit", "--commit must be exactly 40 hexadecimal"),
            ("A" * 39, "--commit must be exactly 40 hexadecimal"),
        )
        for commit, expected_message in cases:
            with self.subTest(commit=commit):
                self._assert_failure_untouched(expected_message, commit=commit)

    def test_non_git_and_nested_candidate_are_rejected(self):
        non_git_candidate = self.root / "not-a-worktree"
        self._create_matching_fixture(non_git_candidate, self.cache)
        self._assert_failure_untouched("candidate is not a Git worktree", candidate=non_git_candidate)

        self._assert_failure_untouched(
            "candidate must be the Git worktree top-level",
            candidate=self.candidate / "plugins",
        )

    def test_inherited_git_directory_and_worktree_overrides_are_ignored(self):
        result = self._invoke(
            environment={
                "GIT_DIR": str(self.root / "attacker-git-dir"),
                "GIT_WORK_TREE": str(self.root / "attacker-worktree"),
                "GIT_INDEX_FILE": str(self.root / "attacker-index"),
            }
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_inherited_path_cannot_select_a_fake_git(self):
        fake_bin = self.root / "fake-bin"
        fake_bin.mkdir()
        canary = self.root / "fake-git-used"
        fake_git = fake_bin / "git"
        fake_git.write_text(
            "#!/bin/sh\nprintf used > \"$FAKE_GIT_CANARY\"\nexit 0\n",
            encoding="utf-8",
        )
        fake_git.chmod(0o755)
        result = self._invoke(
            environment={
                "PATH": "{}{}{}".format(fake_bin, os.pathsep, os.environ.get("PATH", "")),
                "FAKE_GIT_CANARY": str(canary),
            }
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(canary.exists())
    def test_candidate_root_replacement_between_git_checks_leaves_output_untouched(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_assert = PROVENANCE.assert_path_matches_descriptor
        candidate_checks = 0

        def replace_after_candidate_check(path, descriptor, label):
            nonlocal candidate_checks
            result = original_assert(path, descriptor, label)
            if label == "candidate root":
                candidate_checks += 1
                if candidate_checks == 2:
                    moved_candidate = self.root / "candidate-opened-descriptor"
                    os.rename(self.candidate, moved_candidate)
                    shutil.copytree(moved_candidate, self.candidate)
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "assert_path_matches_descriptor",
                side_effect=replace_after_candidate_check,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)

        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

    def test_cache_root_replacement_between_reads_leaves_output_untouched(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_assert = PROVENANCE.assert_path_matches_descriptor
        cache_checks = 0

        def replace_after_cache_check(path, descriptor, label):
            nonlocal cache_checks
            result = original_assert(path, descriptor, label)
            if label == "cache root":
                cache_checks += 1
                if cache_checks == 1:
                    moved_cache = self.root / "cache-opened-descriptor"
                    os.rename(self.cache, moved_cache)
                    shutil.copytree(moved_cache, self.cache)
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "assert_path_matches_descriptor",
                side_effect=replace_after_cache_check,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)

        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")
    def test_candidate_plugin_subtree_replacement_leaves_output_untouched(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_assert = PROVENANCE.assert_path_matches_descriptor
        plugin_checks = 0
        plugin_path = self.candidate / "plugins" / PLUGIN_NAME

        def replace_after_plugin_check(path, descriptor, label):
            nonlocal plugin_checks
            result = original_assert(path, descriptor, label)
            if label == "candidate plugin root":
                plugin_checks += 1
                if plugin_checks == 1:
                    moved_plugin = self.root / "opened-plugin-subtree"
                    os.rename(plugin_path, moved_plugin)
                    shutil.copytree(moved_plugin, plugin_path)
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "assert_path_matches_descriptor",
                side_effect=replace_after_plugin_check,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)

        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")
    def test_final_revalidation_rejects_head_or_clean_status_drift_before_output(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0

        def advance_head_after_first_snapshot(*arguments):
            nonlocal snapshot_calls
            result = original_snapshot(*arguments)
            snapshot_calls += 1
            if snapshot_calls == 1:
                self._git("commit", "--allow-empty", "-qm", "head drift")
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=advance_head_after_first_snapshot,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

        self.temporary_directory.cleanup()
        self.setUp()
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0

        def dirty_after_first_snapshot(*arguments):
            nonlocal snapshot_calls
            result = original_snapshot(*arguments)
            snapshot_calls += 1
            if snapshot_calls == 1:
                (self.candidate / "final-pass-untracked.txt").write_text(
                    "dirty after initial snapshot\n", encoding="utf-8"
                )
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=dirty_after_first_snapshot,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

    def test_final_revalidation_rejects_candidate_or_cache_marker_drift_before_output(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0
        candidate_marker = self._candidate_marker("templates/omg.md")

        def mutate_candidate_after_first_snapshot(*arguments):
            nonlocal snapshot_calls
            result = original_snapshot(*arguments)
            snapshot_calls += 1
            if snapshot_calls == 1:
                self._git(
                    "update-index",
                    "--skip-worktree",
                    str(candidate_marker.relative_to(self.candidate)),
                )
                candidate_marker.write_text(
                    "candidate marker changed after initial snapshot\n", encoding="utf-8"
                )
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=mutate_candidate_after_first_snapshot,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

        self.temporary_directory.cleanup()
        self.setUp()
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0
        cache_marker = self._cache_marker(self.cache, "templates/omg.md")

        def mutate_cache_after_first_snapshot(*arguments):
            nonlocal snapshot_calls
            result = original_snapshot(*arguments)
            snapshot_calls += 1
            if snapshot_calls == 1:
                cache_marker.write_text(
                    "cache marker changed after initial snapshot\n", encoding="utf-8"
                )
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=mutate_cache_after_first_snapshot,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")
    def test_final_revalidation_rejects_plugin_inventory_drift_before_output(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0

        def add_cache_file_after_first_snapshot(*arguments):
            nonlocal snapshot_calls
            result = original_snapshot(*arguments)
            snapshot_calls += 1
            if snapshot_calls == 1:
                (self.cache / "inventory-drift.txt").write_text(
                    "extra after baseline\n", encoding="utf-8"
                )
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=add_cache_file_after_first_snapshot,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

    def test_parent_fsync_failure_reports_post_publication_durability_state(self):
        output = self.root / "provenance.json"
        output.write_text("old record\n", encoding="utf-8")
        record = {"published": True}
        with mock.patch.object(
            PROVENANCE.os,
            "fsync",
            side_effect=(None, OSError(errno.EIO, "injected parent fsync failure")),
        ):
            with self.assertRaisesRegex(
                PROVENANCE.GateError,
                "attestation was published but parent directory fsync failed",
            ):
                PROVENANCE.atomic_write_json(output, record, ())

        self.assertEqual(json.loads(output.read_text(encoding="utf-8")), record)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
    def test_head_grounded_baseline_rejects_drift_after_marker_comparison(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0
        cache_marker = self._cache_marker(self.cache, "templates/omg.md")

        def mutate_cache_before_baseline(*arguments):
            nonlocal snapshot_calls
            snapshot_calls += 1
            if snapshot_calls == 1:
                cache_marker.write_text(
                    "cache marker changed before baseline snapshot\n", encoding="utf-8"
                )
            return original_snapshot(*arguments)

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=mutate_cache_before_baseline,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

        self.temporary_directory.cleanup()
        self.setUp()
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        original_snapshot = PROVENANCE.payload_digest_snapshot
        snapshot_calls = 0
        candidate_marker = self._candidate_marker("templates/omg.md")

        def mutate_candidate_before_baseline(*arguments):
            nonlocal snapshot_calls
            snapshot_calls += 1
            if snapshot_calls == 1:
                self._git(
                    "update-index",
                    "--skip-worktree",
                    str(candidate_marker.relative_to(self.candidate)),
                )
                candidate_marker.write_text(
                    "candidate marker changed before baseline snapshot\n", encoding="utf-8"
                )
            return original_snapshot(*arguments)

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE,
                "payload_digest_snapshot",
                side_effect=mutate_candidate_before_baseline,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")
    def test_pre_replace_revalidation_rejects_marker_drift_after_outer_revalidation(self):
        output = self.root / "provenance.json"
        output.write_text("previous attestation must survive\n", encoding="utf-8")
        cache_marker = self._cache_marker(self.cache, "templates/omg.md")
        original_fsync = PROVENANCE.os.fsync
        fsync_calls = 0

        def mutate_after_temporary_fsync(descriptor):
            nonlocal fsync_calls
            result = original_fsync(descriptor)
            fsync_calls += 1
            if fsync_calls == 1:
                cache_marker.write_text(
                    "cache marker changed after temporary fsync\n", encoding="utf-8"
                )
            return result

        with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
            with mock.patch.object(
                PROVENANCE.os,
                "fsync",
                side_effect=mutate_after_temporary_fsync,
            ):
                self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)

        self.assertEqual(output.read_text(encoding="utf-8"), "previous attestation must survive\n")

    def test_dirty_tracked_and_untracked_candidate_leave_existing_output_untouched(self):
        self._candidate_marker("templates/omg.md").write_text("tracked modification\n", encoding="utf-8")
        self._assert_failure_untouched("candidate Git worktree is dirty")

        self.temporary_directory.cleanup()
        self.setUp()
        (self.candidate / "untracked.txt").write_text("untracked\n", encoding="utf-8")
        self._assert_failure_untouched("candidate Git worktree is dirty")

    def test_ignored_marker_not_tracked_at_head_is_rejected(self):
        marker = "plugins/{}/templates/omg.md".format(PLUGIN_NAME)
        self._git("rm", "--cached", marker)
        with (self.candidate / ".gitignore").open("a", encoding="utf-8") as ignored:
            ignored.write(marker + "\n")
        self._commit_candidate_changes()

        self._assert_failure_untouched("candidate marker 'templates/omg.md' is not a tracked blob at candidate HEAD")

    def test_skip_worktree_marker_substitution_is_rejected_against_head(self):
        marker = self._candidate_marker("templates/omg.md")
        self._git("update-index", "--skip-worktree", str(marker.relative_to(self.candidate)))
        marker.write_text("substituted despite clean status\n", encoding="utf-8")

        self._assert_failure_untouched("candidate marker 'templates/omg.md' bytes differ from the tracked candidate HEAD blob")
    def test_skip_worktree_bootstrap_installer_substitution_is_rejected_against_head(self):
        installer = self.candidate / "install.sh"
        self._git(
            "update-index", "--skip-worktree", str(installer.relative_to(self.candidate))
        )
        installer.write_text("#!/bin/sh\nexit 99\n", encoding="utf-8")

        self._assert_failure_untouched(
            "candidate bootstrap install.sh bytes differ from the tracked candidate HEAD blob"
        )

    def test_marketplace_requires_exactly_one_entry(self):
        marketplace_path = self.candidate / ".claude-plugin" / "marketplace.json"
        for entries in ([], [self._marketplace_document()["plugins"][0]] * 2):
            with self.subTest(entries=len(entries)):
                document = self._marketplace_document()
                document["plugins"] = entries
                self._write_json(marketplace_path, document)
                self._commit_candidate_changes()
                self._assert_failure_untouched("exactly one plugin entry")
                self._restore_marketplace()

    def test_marketplace_name_source_and_version_drift_leave_existing_output_untouched(self):
        marketplace_path = self.candidate / ".claude-plugin" / "marketplace.json"
        mutations = (
            ("top-level name", lambda value: value.__setitem__("name", "wrong-marketplace"), "top-level name"),
            ("entry name", lambda value: value["plugins"][0].__setitem__("name", "wrong-entry"), "entry name"),
            ("entry source", lambda value: value["plugins"][0].__setitem__("source", "./plugins/wrong"), "entry source"),
            ("entry version", lambda value: value["plugins"][0].__setitem__("version", "9.9.9"), "must match exactly"),
            ("metadata version", lambda value: value["metadata"].__setitem__("version", "9.9.9"), "must match exactly"),
        )
        for name, mutate, expected_message in mutations:
            with self.subTest(name=name):
                document = self._marketplace_document()
                mutate(document)
                self._write_json(marketplace_path, document)
                self._commit_candidate_changes()
                self._assert_failure_untouched(expected_message)
                self._restore_marketplace()

    def test_old_identity_marketplace_manifest_and_source_are_rejected(self):
        marketplace_path = self.candidate / ".claude-plugin" / "marketplace.json"
        mutations = (
            ("top-level name", lambda value: value.__setitem__("name", OLD_PLUGIN_NAME), "top-level name"),
            ("entry name", lambda value: value["plugins"][0].__setitem__("name", OLD_PLUGIN_NAME), "entry name"),
            ("entry source", lambda value: value["plugins"][0].__setitem__("source", OLD_PLUGIN_SOURCE), "entry source"),
        )
        for name, mutate, expected_message in mutations:
            with self.subTest(name=name):
                document = self._marketplace_document()
                mutate(document)
                self._write_json(marketplace_path, document)
                self._commit_candidate_changes()
                self._assert_failure_untouched(expected_message)
                self._restore_marketplace()

        manifest_path = self._candidate_marker(".claude-plugin/plugin.json")
        self._write_json(manifest_path, {"name": OLD_PLUGIN_NAME, "version": VERSION})
        self._commit_candidate_changes()
        self._assert_failure_untouched("candidate plugin manifest name")

    def test_plugin_manifest_version_drift_and_invalid_semver_are_rejected(self):
        manifest_path = self._candidate_marker(".claude-plugin/plugin.json")
        self._write_json(manifest_path, {"name": PLUGIN_NAME, "version": "9.9.9"})
        self._commit_candidate_changes()
        self._assert_failure_untouched("must match exactly")

        self._write_json(manifest_path, {"name": PLUGIN_NAME, "version": "1.2"})
        self._commit_candidate_changes()
        self._assert_failure_untouched("candidate plugin manifest version must be a valid SemVer string")

    def test_malformed_and_duplicate_json_are_rejected_for_head_and_cache_manifests(self):
        marketplace_path = self.candidate / ".claude-plugin" / "marketplace.json"
        marketplace_path.write_text("{ not JSON\n", encoding="utf-8")
        self._commit_candidate_changes()
        self._assert_failure_untouched("candidate HEAD marketplace manifest is not valid UTF-8 JSON")

        self._write_json(marketplace_path, self._marketplace_document())
        self._commit_candidate_changes()
        marketplace_path.write_text(
            '{"name":"oh-my-gajae-code","name":"wrong","metadata":{"version":"1.2.3"},"plugins":[]}\n',
            encoding="utf-8",
        )
        self._commit_candidate_changes()
        self._assert_failure_untouched("candidate HEAD marketplace manifest contains duplicate JSON key 'name'")

        self._write_json(marketplace_path, self._marketplace_document())
        self._commit_candidate_changes()
        self._candidate_marker(".claude-plugin/plugin.json").write_text(
            '{"name":"oh-my-gajae-code","name":"wrong","version":"1.2.3"}\n',
            encoding="utf-8",
        )
        self._commit_candidate_changes()
        self._assert_failure_untouched("candidate HEAD plugin manifest contains duplicate JSON key 'name'")

        self.temporary_directory.cleanup()
        self.setUp()
        self._cache_marker(self.cache, ".claude-plugin/plugin.json").write_text(
            '{"name":"oh-my-gajae-code","name":"wrong","version":"1.2.3"}\n',
            encoding="utf-8",
        )
        self._assert_failure_untouched("cache plugin manifest contains duplicate JSON key 'name'")

    def test_candidate_and_cache_roots_must_be_non_symlink_directories(self):
        candidate_link = self.root / "candidate-link"
        os.symlink(self.candidate, candidate_link)
        self._assert_failure_untouched("candidate root must not be a symlink", candidate=candidate_link)

        candidate_file = self.root / "candidate-file"
        candidate_file.write_text("not a directory\n", encoding="utf-8")
        self._assert_failure_untouched("candidate root must be an existing directory", candidate=candidate_file)

        cache_link = self.root / "cache-link"
        os.symlink(self.cache, cache_link)
        self._assert_failure_untouched("cache root must not be a symlink", cache=cache_link)

        cache_file = self.root / "cache-file"
        cache_file.write_text("not a directory\n", encoding="utf-8")
        self._assert_failure_untouched("cache root must be an existing directory", cache=cache_file)

    def test_cache_identity_rejects_old_identity_and_requires_authoritative_home_parent_and_exact_basename(self):
        wrong_basename = self.cache_parent / "wrong-cache-name"
        wrong_version = self.cache_parent / (CACHE_PREFIX + "9.9.9")
        old_identity_cache = self.cache_parent / (OLD_CACHE_PREFIX + VERSION)
        sibling = self.root / "sibling" / self.cache.name
        fake_parent = self.root / "fake" / "plugins"
        fake_cache = fake_parent / self.cache.name
        shutil.copytree(self.cache, wrong_basename)
        shutil.copytree(self.cache, wrong_version)
        shutil.copytree(self.cache, old_identity_cache)
        shutil.copytree(self.cache, sibling)
        shutil.copytree(self.cache, fake_cache)

        cases = (
            (wrong_basename, "cache basename must be exactly"),
            (wrong_version, "cache basename must be exactly"),
            (old_identity_cache, "cache basename must be exactly"),
            (sibling, "cache parent must be exactly $HOME/.gjc/plugins/cache/plugins"),
            (fake_cache, "cache parent must be exactly $HOME/.gjc/plugins/cache/plugins"),
        )
        for cache, expected_message in cases:
            with self.subTest(cache=cache):
                self._assert_failure_untouched(expected_message, cache=cache)

    def test_cache_intermediate_symlink_and_fifo_marker_are_rejected_without_blocking(self):
        external_templates = self.root / "external-templates"
        shutil.copytree(self.cache / "templates", external_templates)
        shutil.rmtree(self.cache / "templates")
        os.symlink(external_templates, self.cache / "templates")
        self._assert_failure_untouched("cache marker 'templates/omg.md' has a missing, non-directory, or symlinked component 'templates'")

        self.temporary_directory.cleanup()
        self.setUp()
        fifo_marker = self._cache_marker(self.cache, "templates/omg.md")
        fifo_marker.unlink()
        os.mkfifo(fifo_marker)
        self._assert_failure_untouched("cache marker 'templates/omg.md' must be a regular file")

    def test_marker_missing_mismatch_or_symlink_leaves_existing_output_untouched(self):
        marker = "templates/omg.md"
        self._cache_marker(self.cache, marker).unlink()
        self._assert_failure_untouched("cache marker 'templates/omg.md' is missing")

        self._replace_cache_with_candidate_plugin()
        self._cache_marker(self.cache, marker).write_text("different bytes\n", encoding="utf-8")
        self._assert_failure_untouched("cache marker 'templates/omg.md' bytes differ from the tracked candidate HEAD blob")

        self._replace_cache_with_candidate_plugin()
        self._cache_marker(self.cache, marker).unlink()
        os.symlink(self._cache_marker(self.cache, "templates/setup.md"), self._cache_marker(self.cache, marker))
        self._assert_failure_untouched("cache marker 'templates/omg.md' is missing, a symlink, or cannot be safely opened")
    def test_multi_harness_critical_marker_fixture_matches_the_gate(self):
        self.assertEqual(PROVENANCE.MARKERS, MARKERS)

    def test_multi_harness_runner_missing_from_candidate_or_cache_is_rejected(self):
        runner = "bin/multi-harness-research.mjs"
        candidate_runner = self._candidate_marker(runner)
        self._git(
            "update-index",
            "--skip-worktree",
            str(candidate_runner.relative_to(self.candidate)),
        )
        candidate_runner.unlink()
        self._assert_failure_untouched(
            "candidate marker 'bin/multi-harness-research.mjs' is missing, a symlink, or cannot be safely opened"
        )

        self.temporary_directory.cleanup()
        self.setUp()
        self._cache_marker(self.cache, runner).unlink()
        self._assert_failure_untouched(
            "cache marker 'bin/multi-harness-research.mjs' is missing, a symlink, or cannot be safely opened"
        )

    def test_multi_harness_binding_schema_tampering_is_rejected_for_candidate_and_cache(self):
        binding_schema = "bin/install-skill.sh"
        candidate_schema = self._candidate_marker(binding_schema)
        self._git(
            "update-index",
            "--skip-worktree",
            str(candidate_schema.relative_to(self.candidate)),
        )
        candidate_schema.write_text("tampered binding schema\n", encoding="utf-8")
        self._assert_failure_untouched(
            "candidate marker 'bin/install-skill.sh' bytes differ from the tracked candidate HEAD blob"
        )

        self.temporary_directory.cleanup()
        self.setUp()
        self._cache_marker(self.cache, binding_schema).write_text(
            "tampered binding schema\n",
            encoding="utf-8",
        )
        self._assert_failure_untouched(
            "cache marker 'bin/install-skill.sh' bytes differ from the tracked candidate HEAD blob"
        )

    def test_final_revalidation_rejects_aggregate_drift_of_multi_harness_critical_markers(self):
        cases = (
            ("candidate runner", self._candidate_marker, "bin/multi-harness-research.mjs"),
            ("cache binding schema", lambda path: self._cache_marker(self.cache, path), "bin/install-skill.sh"),
        )
        for label, resolve_path, relative_path in cases:
            with self.subTest(label=label):
                output = self.root / "provenance.json"
                output.write_text("previous attestation must survive\n", encoding="utf-8")
                original_snapshot = PROVENANCE.payload_digest_snapshot
                snapshot_calls = 0

                def mutate_after_first_snapshot(*arguments):
                    nonlocal snapshot_calls
                    result = original_snapshot(*arguments)
                    snapshot_calls += 1
                    if snapshot_calls == 1:
                        target = resolve_path(relative_path)
                        if label == "candidate runner":
                            self._git(
                                "update-index",
                                "--skip-worktree",
                                str(target.relative_to(self.candidate)),
                            )
                        target.write_text("post-baseline critical marker drift\n", encoding="utf-8")
                    return result

                with mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False):
                    with mock.patch.object(
                        PROVENANCE,
                        "payload_digest_snapshot",
                        side_effect=mutate_after_first_snapshot,
                    ):
                        self.assertEqual(PROVENANCE.main(self._direct_arguments(output)), 1)
                self.assertEqual(
                    output.read_text(encoding="utf-8"),
                    "previous attestation must survive\n",
                )

                self.temporary_directory.cleanup()
                self.setUp()
    def test_unlisted_extra_cache_payload_file_leaves_existing_output_untouched(self):
        (self.cache / "unlisted-extra.txt").write_text("unexpected\n", encoding="utf-8")

        self._assert_failure_untouched(
            "cache plugin payload file inventory differs from candidate HEAD"
        )
        self.temporary_directory.cleanup()
        self.setUp()
        (self.cache / "unexpected-empty-directory").mkdir()
        self._assert_failure_untouched(
            "cache plugin payload directory shape differs from candidate HEAD"
        )

    def test_candidate_and_cache_extra_or_missing_payload_files_are_rejected(self):
        ignored_extra = self._candidate_marker("candidate-extra.txt")
        (self.candidate / ".gitignore").write_text(
            "plugins/{}/candidate-extra.txt\n".format(PLUGIN_NAME), encoding="utf-8"
        )
        self._commit_candidate_changes()
        ignored_extra.write_text("unexpected\n", encoding="utf-8")
        self._assert_failure_untouched(
            "candidate plugin payload file inventory differs from candidate HEAD"
        )

        self.temporary_directory.cleanup()
        self.setUp()
        missing_candidate = self._candidate_marker("bin/collect.ts")
        self._git(
            "update-index",
            "--skip-worktree",
            str(missing_candidate.relative_to(self.candidate)),
        )
        missing_candidate.unlink()
        self._assert_failure_untouched(
            "candidate plugin payload file inventory differs from candidate HEAD"
        )

        self.temporary_directory.cleanup()
        self.setUp()
        self._cache_marker(self.cache, "references/non-marker-reference.md").unlink()
        self._assert_failure_untouched(
            "cache plugin payload file inventory differs from candidate HEAD"
        )

    def test_non_marker_payload_bytes_are_compared_to_head(self):
        for relative_path in NON_MARKER_PAYLOADS:
            with self.subTest(relative_path=relative_path):
                self._replace_cache_with_candidate_plugin()
                self._cache_marker(self.cache, relative_path).write_text(
                    "non-marker cache substitution\n", encoding="utf-8"
                )
                self._assert_failure_untouched(
                    "cache plugin payload file {!r} bytes differ from the tracked candidate HEAD blob".format(
                        relative_path
                    )
                )

    def test_nested_payload_symlink_and_special_file_are_rejected_without_blocking(self):
        symlink = self._cache_marker(
            self.cache, "skills/non-marker-skill/unexpected-link"
        )
        os.symlink(self.root / "outside", symlink)
        self._assert_failure_untouched(
            "cache plugin payload contains symlink 'skills/non-marker-skill/unexpected-link'"
        )

        self.temporary_directory.cleanup()
        self.setUp()
        special_directory = self._cache_marker(self.cache, "references/nested")
        special_directory.mkdir()
        special_file = special_directory / "payload.fifo"
        os.mkfifo(special_file)
        self._assert_failure_untouched(
            "cache plugin payload entry 'references/nested/payload.fifo' must be a regular file or directory"
        )
    def test_output_is_rejected_inside_candidate_or_cache_without_mutating_inputs(self):
        aliases = (
            (
                self._candidate_marker("templates/omg.md"),
                "candidate root",
            ),
            (
                self.candidate / ".claude-plugin" / "marketplace.json",
                "candidate root",
            ),
            (
                self._cache_marker(self.cache, "templates/omg.md"),
                "authoritative cache root",
            ),
            (
                self._cache_marker(self.cache, ".claude-plugin/plugin.json"),
                "authoritative cache root",
            ),
        )
        for output, expected_root in aliases:
            with self.subTest(output=output):
                before = output.read_bytes()
                result = self._invoke(output=output)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(
                    "--out must not be inside or equal to the " + expected_root,
                    result.stderr,
                )
                self.assertEqual(output.read_bytes(), before)

        for output, expected_root in (
            (self.candidate / "attestation.json", "candidate root"),
            (
                self.candidate / "plugins" / ".." / "attestation-lexical.json",
                "candidate root",
            ),
            (self.cache / "attestation.json", "authoritative cache root"),
            (self.candidate, "candidate root"),
            (self.cache, "authoritative cache root"),
        ):
            with self.subTest(output=output):
                self.assertFalse(
                    output.exists()
                    and output.name in ("attestation.json", "attestation-lexical.json"),
                    "new output fixture must not pre-exist",
                )
                result = self._invoke(output=output)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(
                    "--out must not be inside or equal to the " + expected_root,
                    result.stderr,
                )
                if output not in (self.candidate, self.cache):
                    self.assertFalse(output.exists())

    def test_output_parent_or_leaf_symlink_is_rejected_without_touching_existing_output(self):
        physical_parent = self.root / "physical-output"
        physical_parent.mkdir()
        existing = physical_parent / "provenance.json"
        existing.write_text("do not replace\n", encoding="utf-8")
        symlink_parent = self.root / "symlink-output"
        os.symlink(physical_parent, symlink_parent)
        result = self._invoke(output=symlink_parent / "provenance.json")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "attestation output parent has a missing, non-directory, or symlinked component 'symlink-output'",
            result.stderr,
        )
        self.assertEqual(existing.read_text(encoding="utf-8"), "do not replace\n")

        output_parent = self.root / "safe-output"
        output_parent.mkdir()
        output_target = output_parent / "target.json"
        output_target.write_text("target survives\n", encoding="utf-8")
        output_link = output_parent / "provenance.json"
        os.symlink(output_target, output_link)
        result = self._invoke(output=output_link)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("attestation output path must not be a symlink", result.stderr)
        self.assertEqual(output_target.read_text(encoding="utf-8"), "target survives\n")
        output_directory = output_parent / "directory-output"
        output_directory.mkdir()
        result = self._invoke(output=output_directory)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("existing attestation output must be a regular file", result.stderr)
        self.assertTrue(output_directory.is_dir())

        output_parent_file = self.root / "output-parent-file"
        output_parent_file.write_text("not a directory\n", encoding="utf-8")
        result = self._invoke(output=output_parent_file / "provenance.json")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "attestation output parent has a missing, non-directory, or symlinked component 'output-parent-file'",
            result.stderr,
        )
        self.assertEqual(output_parent_file.read_text(encoding="utf-8"), "not a directory\n")


if __name__ == "__main__":
    unittest.main()
