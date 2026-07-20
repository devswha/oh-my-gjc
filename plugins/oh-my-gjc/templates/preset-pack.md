---
description: omg 최종 프리셋(daily/agent)을 사용자 models.yml에 명시적으로 병합·확인·제거한다. 백업 후 이름 단위 병합, 다른 프로파일 무수정.
argument-hint: "[install|status|remove]"
---

# /omg:preset-pack

입력 인자: `$ARGUMENTS`

설치된 `preset-pack` 스킬을 불러와 그 절차를 그대로 따른다.

- 인자가 비어 있거나 `install`이면: 스위트 루트 바인딩에서 `references/preset-pack.yml`
  정본을 찾아, **백업 후** `daily`/`agent`를 `~/.gjc/agent/models.yml`에 이름 단위로
  병합하고(폐지된 v1 `deep`/`sec`는 원본 일치분만 함께 정리), YAML 파스 + 프리셋별
  활성 스모크로 검증한 뒤 결과와 활성화 커맨드를 보고한다.
- `status`면: 두 프리셋의 존재·정본 대비 차이와 폐지분 잔존 여부만 보고한다(무수정).
- `remove`면: 사용자 확인 후 백업하고 해당 블록만 제거한다.
- 그 외 인자는 실행하지 않고 사용법을 보여준다.

이 명령이 명시적으로 호출된 경우에만 models.yml을 수정한다. 다른 프로파일과 최상위 키는
절대 건드리지 않고, 정본·바인딩이 없으면 병합 없이 설치 복구를 안내한다(fail-closed).
