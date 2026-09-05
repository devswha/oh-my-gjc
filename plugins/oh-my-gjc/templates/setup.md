---
description: oh-my-gjc 읽기 전용 정적 진단 — user·project 설치 파일·binding·은퇴 마커를 한 번에 보고한다. 설치·로그인·provider/runtime 실행은 하지 않는다.
argument-hint: "(인자 없음)"
---

# /omg:setup

입력 인자: `$ARGUMENTS`

인자가 있으면 `/omg:setup` 사용법만 보여준다. 인자가 없으면 아래 정적 검사만 실행하고
**모든 결과를 모아** 보고한다. 설치·업그레이드·복구·로그인·마이그레이션·연구는 하지 않는다.
provider CLI, 엔진 runtime, `--check-env`, `--inspect-session`, 의존성 import/설치,
브라우저·CDP·네트워크 접근은 금지한다. 아래 Python 표준 라이브러리 파일 검사만 허용한다.

## Step 0 — 설치 표면 전체 진단

이 코드는 네이티브 명령 안에 포함되어 binding이 손상되어도 진단 가능하다. 파일을 생성하거나
수정하지 않는다. user와 현재 project의 5개 skill·5개 command를 각각 확인하고, 처음 실패해도
나머지를 검사한다. 설치가 전혀 없는 project는 `not_installed`이며 오류가 아니다.
어느 scope에도 설치가 없으면 user 설치 누락으로 보고한다. 파일 구조·정본과의 바이트 비교는
정적 증거이며 GJC의 실제 YAML 해석, discovery 설정, 자연어 활성화를 증명하지 않는다.

```bash
python3 - <<'PY_SETUP'
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

skills = ('no-english', 'extragoal', 'insane-review', 'insane-search', 'gpt-image')
commands = ('omg', 'setup', 'no-english', 'insane-review', 'gpt-image')
home, cwd = Path.home().absolute(), Path.cwd()
scopes = {'user': home / '.gjc/agent', 'project': cwd / '.gjc'}
rows = []
if not all(hasattr(os, key) for key in ('O_NOFOLLOW', 'O_NONBLOCK', 'getuid')):
    print(json.dumps(dict(static_ok=False, error_count=1, checks=[], writes=0,
                          live_readiness='unverified', error='POSIX static inspection unavailable')))
    sys.exit(1)


def add(scope, path, status, detail):
    rows.append(dict(scope=scope, path=str(path), status=status, detail=detail))


def safe_info(path):
    for component in reversed((path, *path.parents)):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise ValueError('symlinked path; not followed')
    return info


def read_file(path, limit=1048576, private=False):
    info = safe_info(path)
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('not a regular file')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        current = os.fstat(stream.fileno())
        if (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError('file changed during inspection')
        if private and (stat.S_IMODE(current.st_mode) != 0o600
                        or current.st_uid != os.getuid()):
            raise ValueError('binding must be owned and mode 0600')
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError('file exceeds diagnostic limit')
    return data


def present(path):
    try:
        safe_info(path)
        return True
    except FileNotFoundError:
        return False
    except (OSError, ValueError):
        return True  # invalid paths still need a diagnostic, never a fallback


def surfaces(root):
    return [(root / 'skills' / s / 'SKILL.md', 'skills/' + s + '/SKILL.md', s)
            for s in skills] + [
        (root / 'commands' / ('omg.md' if c == 'omg' else 'omg:' + c + '.md'),
         'templates/' + c + '.md', None) for c in commands]


def binding(scope, path, required):
    if not present(path):
        add(scope, path, 'missing' if required else 'not_installed', 'suite root binding absent')
        return None
    try:
        raw = read_file(path, 4096, private=True).decode('utf-8')
        if (not raw.endswith('\n') or raw.count('\n') != 1
                or any(ord(c) < 32 or ord(c) == 127 for c in raw[:-1])):
            raise ValueError('expected one absolute canonical path plus newline')
        root = Path(raw[:-1])
        if not root.is_absolute() or str(root) != raw[:-1]:
            raise ValueError('non-canonical suite root')
        if not stat.S_ISDIR(safe_info(root).st_mode) or str(root.resolve()) != str(root):
            raise ValueError('suite root is not a canonical directory')
        add(scope, path, 'ok', 'owned private canonical binding')
        return root
    except (OSError, ValueError, UnicodeError):
        add(scope, path, 'invalid', 'binding unreadable/unsafe/malformed; value not printed')
        return None


active = {scope: any(present(p) for p, _, _ in surfaces(root)) or
          any(present(root / 'runtimes' / identity / 'root')
              for identity in ('oh-my-gjc', 'oh-my-gajae-code'))
          for scope, root in scopes.items()}
if not any(active.values()):
    active['user'] = True

for scope, native in scopes.items():
    bound = binding(scope, native / 'runtimes/oh-my-gjc/root', active[scope])
    legacy = native / 'runtimes/oh-my-gajae-code/root'
    if present(legacy):
        add(scope, legacy, 'warning', 'preserved compatibility fallback; never rewritten or cleaned')
        binding(scope, legacy, False)  # report damage too; do not select it as canonical
    for path, relative, name in surfaces(native):
        if not present(path):
            add(scope, path, 'missing' if active[scope] else 'not_installed', 'native file absent')
            continue
        try:
            data = read_file(path)
            text = data.decode('utf-8')
            fm = re.match(r'\A---\n(.*?)\n---(?:\n|$)', text, re.S)
            if not fm or not re.search(r'^description: .+', fm[1], re.M):
                raise ValueError('missing frontmatter/description')
            if name and not re.search(r'^name: ' + re.escape(name) + r'$', fm[1], re.M):
                raise ValueError('skill name mismatch')
            add(scope, path, 'ok', 'regular file with expected frontmatter fields')
            if bound:
                try:
                    source = read_file(bound / relative)
                    if data != source:
                        add(scope, path, 'warning', 'differs from bound source; customized or stale; preserve')
                except (OSError, ValueError):
                    add(scope, bound / relative, 'invalid', 'bound source missing or unsafe')
        except (OSError, ValueError, UnicodeError):
            add(scope, path, 'invalid', 'native file unreadable/unsafe or invalid frontmatter fields')
    if bound:
        for relative in ('bin/install-skill.sh', 'bin/pack_and_ask.py', 'bin/gpt_image_web.py',
                         'bin/cdp_lock.py', 'bin/insane_search.py', 'bin/setup_insane_search.py'):
            try:
                data = read_file(bound / relative)
                add(scope, bound / relative, 'ok', 'static asset sha256:' + hashlib.sha256(data).hexdigest())
            except (OSError, ValueError):
                add(scope, bound / relative, 'invalid', 'bound asset missing or unsafe')

for project, relative, _ in surfaces(scopes['project']):
    if present(project):
        add('project', project, 'warning', 'project surface may shadow user scope; GJC trust/discovery unverified')
if present(scopes['project'] / 'runtimes/oh-my-gjc/root'):
    add('project', scopes['project'] / 'runtimes/oh-my-gjc/root', 'warning',
        'project binding takes precedence, including invalid binding; no silent fallback')

marker_re = re.compile(r'^<!-- (BEGIN|END) ((?:oh-my-gjc|my-workflows):(?:easy-always|gate-always|branchflow)) -->$')
marker_files = [scopes['user'] / n for n in ('SYSTEM.md', 'AGENTS.md')] + [
    scopes['project'] / n for n in ('SYSTEM.md', 'AGENTS.md')] + [cwd / 'AGENTS.md']
for path in marker_files:
    if not present(path):
        continue
    try:
        text = read_file(path).decode('utf-8')
        stack, found, malformed = [], False, False
        for line in text.splitlines():
            match = marker_re.fullmatch(line)
            if not match:
                if re.match(r'^\s*<!--\s*(?:BEGIN|END)\b.*(?:oh-my-gjc|my-workflows):(?:easy-always|gate-always|branchflow)', line):
                    found = malformed = True
                continue
            found = True
            action, label = match.groups()
            if action == 'BEGIN':
                if stack:
                    malformed = True
                stack.append(label)
            elif not stack or stack.pop() != label:
                malformed = True
        if found:
            add('markers', path, 'invalid' if malformed or stack else 'warning',
                'malformed retired marker; preserve all bytes' if malformed or stack else
                'retired marker present; separate installer repair only, preserve during diagnosis')
        else:
            add('markers', path, 'ok', 'no retired marker detected')
    except (OSError, ValueError, UnicodeError):
        add('markers', path, 'invalid', 'marker file unreadable/unsafe; contents not printed')

profile = Path(os.environ.get('INSANE_REVIEW_PROFILE', str(home / '.insane-review/browser-profile'))).expanduser().absolute()
try:
    info = safe_info(profile)
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.getuid():
        raise ValueError('unsafe profile directory')
    add('browser', profile, 'ok', 'owned private directory exists; contents never read')
except (OSError, ValueError):
    add('browser', profile, 'unverified', 'dedicated profile absent or unsafe; not created')
add('browser', profile, 'unverified', 'CDP binding, login, subscription, model, effort, image UI readiness not checked')
add('dependencies', '', 'unverified', 'provider credentials and runtime dependencies not executed or inspected')
add('discovery', '', 'unverified', 'ancestor/custom skill roots and trust settings: separate user-run GJC discovery')
errors = sum(r['status'] in ('missing', 'invalid') for r in rows)
print(json.dumps(dict(static_ok=errors == 0, error_count=errors, checks=rows,
                     live_readiness='unverified', writes=0), ensure_ascii=False, indent=2))
sys.exit(1 if errors else 0)
PY_SETUP
```

`rc=1`도 전체 JSON 결과를 읽고 누락·손상 목록을 빠짐없이 보고한다. Python 3 또는
`O_NOFOLLOW`/`O_NONBLOCK`가 없는 환경에서는 정적 검사 불가로 보고하고 멈춘다.
기존 identity binding·XDG 연구 데이터·credentials·`models.yml`·사용자 파일을 고치거나 지우지 않는다.
현재 디렉터리 밖 ancestor/custom scope는 이 검사 범위에 포함되지 않는다.

## Step 1 — 첫 사용 안내와 추가 진단

- 설치가 불완전하면 `→ hardened installer를 사용자가 별도 셸에서 실행해야 함`으로 보고한다.
- 정적 검사 성공은 로그인/모델/실행 준비 완료가 아니다. 브라우저 프로필 존재도 로그인 증거가 아니다.
- GJC 실제 skill discovery·scope 우선순위·오류는 사용자가 별도 터미널에서
  `gjc skills discover --json` 또는 `gjc skills discover --source project --json`으로 확인할 수 있다.
  **setup 안에서는 실행하지 않는다.** GJC v0.15.6 (`7d23ed3d9e8cb6e5062ba2840462d59fe18eb784`)의
  [skills 진단 문서](https://github.com/Yeachan-Heo/gajae-code/blob/v0.15.6/docs/skills.md#diagnostics)와
  `packages/coding-agent/src/cli/skills-cli.ts`에서 확인한 기존 기능이며, 지원 여부는 설치 버전에 따른다.
- `/omg`로 호출 예시를 본다. 간단한 첫 확인은 `/omg:no-english status`다.
  `/omg:insane-review`와 `/omg:gpt-image <prompt>`는 명시 호출 후 각자의 전제조건을 검증한다.
  `extragoal`은 커밋된 피처 브랜치가 필요한 수정·머지 포함 전체 게이트이며 setup 대용이 아니다.

## Step 2 — 출력 형식

`✓ 정적 확인됨` / `– 누락·손상` / `! scope 충돌·보존 마커` / `? 실행 준비 미검증`으로
경로와 근거를 간결하게 정리한다. 누락 목록은 생략하지 않는다. 수정이나 외부 실행을 이어서 하지 않는다.
