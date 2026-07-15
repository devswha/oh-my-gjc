#!/bin/sh
set -eu
umask 077

REPOSITORY_URL='https://github.com/Yeachan-Heo/gajae-code.git'
TAG='v0.11.0'
COMMIT='8132409c3f10754fea5f3b0108a7bee979c43652'

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_REPLACE_REF_BASE GIT_INDEX_FILE
unset GIT_NAMESPACE GIT_SHALLOW_FILE GIT_CONFIG GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS
unset GIT_PREFIX GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM
unset GIT_TEMPLATE_DIR
export GIT_NO_REPLACE_OBJECTS=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_NOSYSTEM=1

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [ "$(uname -s)" != 'Linux' ]; then
  fail 'The pinned SDK source helper currently supports Linux only.'
fi

DESTINATION=${OMG_GJC_SDK_SOURCE:-"${TMPDIR:-/tmp}/oh-my-gjc-upstream/gajae-code-v0.11.0"}
case "$DESTINATION" in
  /*) ;;
  *) DESTINATION=$(pwd)/$DESTINATION ;;
esac
PARENT=$(dirname "$DESTINATION")
LOCK="${DESTINATION}.lock"
TEMPORARY=''
LOCK_HELD=0
EMPTY_TEMPLATE=''

cleanup() {
  if [ -n "$TEMPORARY" ] && [ -d "$TEMPORARY" ]; then
    rm -rf -- "$TEMPORARY"
  fi
  if [ "$LOCK_HELD" -eq 1 ]; then
    if [ -n "$EMPTY_TEMPLATE" ]; then
      rmdir -- "$EMPTY_TEMPLATE" || true
    fi
    rmdir -- "$LOCK" || true
  fi
}
trap cleanup 0 1 2 15

mkdir -p -- "$PARENT"
if [ -L "$PARENT" ] || [ ! -d "$PARENT" ]; then
  fail 'SDK source parent must be a real directory.'
fi
parent_uid=$(stat -c '%u' -- "$PARENT")
parent_mode=$(stat -c '%a' -- "$PARENT")
if [ "$parent_uid" -ne "$(id -u)" ] || [ $((0$parent_mode & 077)) -ne 0 ]; then
  fail 'SDK source parent must be private and owned by the current user.'
fi

attempt=0
while ! mkdir -- "$LOCK" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    fail 'Timed out waiting for the SDK source publication lock.'
  fi
  sleep 1
done
LOCK_HELD=1
EMPTY_TEMPLATE="$LOCK/empty-template"
mkdir -- "$EMPTY_TEMPLATE"

index_flags_are_clean() {
  source_dir=$1
  git -C "$source_dir" ls-files -v |
    while IFS= read -r entry; do
      case "$entry" in
        [a-zS]\ *) exit 1 ;;
      esac
    done
}

verify_existing() {
  source_dir=$1
  if [ -L "$source_dir" ] || [ -L "$source_dir/.git" ] || [ ! -d "$source_dir/.git" ]; then
    fail 'Existing SDK source destination is not a standalone Git checkout.'
  fi
  expected_git_dir="$source_dir/.git"
  git_dir=$(git -C "$source_dir" rev-parse --path-format=absolute --git-dir)
  common_dir=$(git -C "$source_dir" rev-parse --path-format=absolute --git-common-dir)
  top_level=$(git -C "$source_dir" rev-parse --path-format=absolute --show-toplevel)
  if [ "$git_dir" != "$expected_git_dir" ] ||
    [ "$common_dir" != "$expected_git_dir" ] ||
    [ "$top_level" != "$source_dir" ]; then
    fail 'Existing SDK source destination redirects its Git metadata or worktree.'
  fi
  if [ -L "$git_dir/index" ] || [ ! -f "$git_dir/index" ]; then
    fail 'Existing SDK source destination must use its own regular Git index.'
  fi
  if [ -s "$common_dir/info/grafts" ] || [ -s "$common_dir/objects/info/alternates" ]; then
    fail 'Existing SDK source destination contains Git grafts or alternate object stores.'
  fi
  hooks_path=$(git -C "$source_dir" config --get core.hooksPath || true)
  fsmonitor=$(git -C "$source_dir" config --get core.fsmonitor || true)
  if [ -n "$hooks_path" ] || [ -n "$fsmonitor" ] || [ -L "$git_dir/hooks" ]; then
    fail 'Existing SDK source destination enables external Git hooks.'
  fi
  for hook in "$git_dir/hooks/"*; do
    [ -e "$hook" ] || continue
    case "$hook" in
      *.sample) continue ;;
    esac
    if [ -L "$hook" ] || [ -x "$hook" ]; then
      fail 'Existing SDK source destination contains an active Git hook.'
    fi
  done
  if git -C "$source_dir" symbolic-ref -q HEAD >/dev/null; then
    fail 'Existing SDK source destination must have detached HEAD.'
  fi
  if [ -n "$(git -C "$source_dir" for-each-ref --format='%(refname)' refs/replace/)" ]; then
    fail 'Existing SDK source destination contains Git replacement refs.'
  fi
  configured_worktree=$(git -C "$source_dir" config --get core.worktree || true)
  worktree_config=$(git -C "$source_dir" config --bool --get extensions.worktreeConfig || true)
  sparse_checkout=$(git -C "$source_dir" config --bool --get core.sparseCheckout || true)
  if [ -n "$configured_worktree" ] ||
    [ "$worktree_config" = 'true' ] ||
    [ -e "$git_dir/config.worktree" ] ||
    [ "$sparse_checkout" = 'true' ]; then
    fail 'Existing SDK source destination redirects or sparsifies its worktree.'
  fi
  if ! index_flags_are_clean "$source_dir"; then
    fail 'Existing SDK source destination hides tracked changes with index flags.'
  fi
  origin=$(git -C "$source_dir" remote get-url origin)
  if [ "$origin" != "$REPOSITORY_URL" ]; then
    fail 'Existing SDK source destination has the wrong origin.'
  fi
  checked_out=$(git -C "$source_dir" rev-parse --verify 'HEAD^{commit}')
  if [ "$checked_out" != "$COMMIT" ]; then
    fail 'Existing SDK source destination is not pinned to the expected commit.'
  fi
  expected_tree=$(git -C "$source_dir" rev-parse --verify "$COMMIT^{tree}")
  checked_out_tree=$(git -C "$source_dir" rev-parse --verify 'HEAD^{tree}')
  if [ "$checked_out_tree" != "$expected_tree" ]; then
    fail 'Existing SDK source destination does not expose the pinned commit tree.'
  fi
  if [ -n "$(git -C "$source_dir" status --porcelain=v1 --untracked-files=all --ignored=matching)" ]; then
    fail 'Existing SDK source destination contains local or ignored files; preserving it unchanged.'
  fi
}

if [ -L "$DESTINATION" ]; then
  fail 'Refusing symbolic-link SDK source destination.'
fi
if [ -e "$DESTINATION" ] && [ ! -d "$DESTINATION" ]; then
  fail 'SDK source destination must be a directory.'
fi

if [ -d "$DESTINATION" ]; then
  verify_existing "$DESTINATION"
else
  TEMPORARY=$(mktemp -d -- "$PARENT/.gajae-code-v0.11.0.XXXXXX")
  git init -q --template="$EMPTY_TEMPLATE" "$TEMPORARY"
  git -C "$TEMPORARY" remote add origin "$REPOSITORY_URL"
  git -C "$TEMPORARY" -c protocol.file.allow=never fetch --quiet --depth=1 --no-tags --no-recurse-submodules origin "refs/tags/$TAG"
  actual=$(git -C "$TEMPORARY" rev-parse --verify 'FETCH_HEAD^{commit}')
  if [ "$actual" != "$COMMIT" ]; then
    fail "SDK source tag $TAG does not resolve to the expected commit."
  fi
  git -C "$TEMPORARY" checkout --quiet --detach "$COMMIT"
  verify_existing "$TEMPORARY"
  mv -n -T -- "$TEMPORARY" "$DESTINATION"
  if [ -d "$TEMPORARY" ]; then
    if [ -L "$DESTINATION" ] || [ ! -d "$DESTINATION" ]; then
      fail 'SDK source destination changed during publication.'
    fi
    verify_existing "$DESTINATION"
  else
    TEMPORARY=''
  fi
  verify_existing "$DESTINATION"
fi

printf '%s\n' "$DESTINATION"