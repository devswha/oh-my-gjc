---
description: 오케스트레이터 모드(임계값 기반 위임 정책)를 이번 세션에 적용하거나 프로젝트·사용자 범위에 영속 설치한다.
argument-hint: "[on|install [dir]|user|status]"
---

# /omg:orchestrator

입력 인자: `$ARGUMENTS`

- 인자가 비어 있거나 `on`이면 설치된 `orchestrator` 스킬을 불러와 **이번 세션에만** 정책을
  적용하고 `오케스트레이터 모드: 켜짐 (세션 한정)`이라고 답한다. 파일을 쓰지 않는다.
- `install [dir]`이면 스위트 루트 바인딩을 해석한 뒤 설치 스크립트를 실행한다
  (dir 생략 시 현재 프로젝트):
  1. `<cwd>/.gjc/runtimes/oh-my-gjc/root`, 없으면 `~/.gjc/agent/runtimes/oh-my-gjc/root`를
     읽어 단일 절대 경로인지 확인한다. 둘 다 없으면 저장소 checkout의
     `plugins/oh-my-gjc/`를 대체 경로로 쓴다. 바인딩이 손상됐으면 실행하지 않고 하드닝된
     루트 `install.sh` 재실행을 안내한다.
  2. `bash "<suite-root>/bin/install-orchestrator.sh" --project [dir]`를 실행하고 출력
     (installed/created/appended/skipped 및 백업 경로)을 그대로 보고한다.
- `user`이면 같은 방식으로 `--user`를 실행한다. 이는 `~/.gjc/agent/rules/`에 TTSR
  트립와이어와 `rule://orchestration`만 전역 설치하며, 상시 정책 텍스트는 저장소별
  `install`이 여전히 필요함을 함께 안내한다.
- `status`이면 읽기 전용으로 보고한다: 현재 프로젝트 `AGENTS.md`의
  `## Orchestration policy` 마커 유무, `.agents/rules/orchestration.md`·
  `orchestration-tripwire.md` 유무, `~/.gjc/agent/rules/`의 동명 규칙 유무.
- 그 외 인자는 실행하지 않고 `/omg:orchestrator [on|install [dir]|user|status]` 사용법을
  보여준다.

일반 대화의 '위임해줘', '토큰 아껴줘' 같은 표현만으로 이 스킬을 활성화하지 않는다.
`on`은 새 세션에 상태를 넘기지 않는다. 설치 서브커맨드는 대상 `AGENTS.md`를 백업 후
마커 기반으로만 append하고 기존 내용을 수정하지 않으며, `models.yml`·모델 설정·자격증명은
건드리지 않는다.
