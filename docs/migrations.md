# 마이그레이션 및 제거 이력

삭제된 소스와 원래 경로는 [보관 목록](./removed/README.md)에서 확인합니다. 보관 자료는 문서용이며 설치·실행·해결 대상이 아닙니다.

## v0.28.0 식별자 전환

`oh-my-gjc`가 공식 저장소, 마켓플레이스·플러그인 식별자, 소스 경로, 로컬 체크아웃 이름입니다. 공식 설치 프로그램 URL은 다음과 같습니다.

```text
https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh
```

이전 `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/...` raw URL은 리디렉션되지 않습니다. 이전 GitHub 저장소 페이지와 Git remote는 리디렉션되지만, 현재 안내와 로컬 체크아웃에는 새 URL과 이름을 사용합니다.

새 설치는 `oh-my-gjc` runtime binding만 작성합니다. 이전 `oh-my-gajae-code` binding은 최소 30일 또는 두 릴리스 동안 읽기 전용 fallback으로 유지하며, 이 전환 과정에서 다시 쓰거나 정리하지 않습니다. 기존 XDG 조사 데이터, 자격 증명, `models.yml`, 안정적인 내부 `oh-my-gjc:gate-always` 마커도 보존합니다.

## v0.29.0: `preset-pack` 제거

커스텀 모델 프리셋 배포를 중단하고 GJC 내장 프리셋만 사용합니다. 업그레이드는 스위트 소유의 native `skills/preset-pack/`, `omg:preset-pack.md`, `references/preset-pack.yml`만 정리합니다. 사용자 `~/.gjc/agent/models.yml`과 과거 병합된 `daily`/`agent` 프로파일은 사용자 설정이므로 삭제하거나 수정하지 않습니다.

멈춘 세션은 GJC 내장 프리셋으로 복구합니다.

```sh
gjc -r <세션ID> --mpreset <내장 프리셋>
```

## v0.26.0: `fable` 제거

현재 Fable 감사와 Opus fallback 감사가 모두 보고서 없이 멈춰 제거했습니다. 네이티브 교차 세션 리뷰와 `insane-review`는 유지합니다. 업그레이드는 native `omg:fable.md`만 정리하며 `claude-fable-5` 모델 프리셋 참조는 관련이 없으므로 보존합니다.

## v0.25.0: `time-left`, `lazycodex-gjc`, `tools/sdk-lab` 제거

`time-left`와 함께 `tools/sdk-lab`을 제거했습니다. ETA가 사용할 수 있는 측정값을 제공하지 못했기 때문입니다. `lazycodex-gjc`는 사용할 수 있는 Codex 인증·토큰이 없었고, GJC 네이티브 워크플로와 multi-harness가 위임을 충당하므로 제거했습니다.

업그레이드는 스위트 소유 native skill, command, runtime, receipt만 제거합니다. 자격 증명, `~/.codex`, `models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 삭제하거나 수정하지 않습니다.

## v0.14.0: `gajae-app` 분리

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 스위트에서 분리됐습니다. native 업그레이드 정리는 `~/.gjc/agent/skills/gajae-app/`과 `~/.gjc/agent/commands/omg:gajae-app.md`만 대상으로 하며, claudecodeui 체크아웃, 빌드 산출물, 데이터, 사용자 서비스는 삭제하거나 수정하지 않습니다.

셀프호스트 앱의 설치와 업데이트는 [devswha/claudecodeui SELF-HOST](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따릅니다.
