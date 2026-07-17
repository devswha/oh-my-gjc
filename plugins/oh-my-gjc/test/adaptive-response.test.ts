import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const pluginRoot = resolve(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function ownedMarkerBody(content: string): string {
  const match = content.match(
    /^<!-- BEGIN oh-my-gjc:gate-always -->$(.*?)^<!-- END oh-my-gjc:gate-always -->$/ms,
  );
  if (!match) throw new Error("gate-always owned marker is missing or duplicated");
  return match[1];
}

describe("adaptive response contract", () => {
  test("builds a domain-specific ephemeral response persona", () => {
    const skill = read(join(pluginRoot, "skills/adaptive-response/SKILL.md"));

    for (const contract of [
      "현재 도메인 숙련도",
      "기술 깊이",
      "설명 밀도",
      "의사결정 역할",
      "언어·형식 선호",
      "위험 성향",
      "입문 / 실무 / 전문 / 미확인",
      "최신 명시 지시가 우선",
    ]) {
      expect(skill).toContain(contract);
    }
    expect(skill).toContain("한 도메인의 숙련도를 다른 도메인에 복사");
    expect(skill).toContain("단독으로 어떤 숙련도 단계도 판정하지");
    expect(skill).toContain("사용자 직접 진술이나 같은 현재 도메인의 다른 근거");
    expect(skill).toContain("정확성 > 개인화 > 쉬움");
  });

  test("activates only through explicit gate commands", () => {
    const skill = read(join(pluginRoot, "skills/adaptive-response/SKILL.md"));
    expect(skill).toContain("`/omg:gate` 또는 `/omg:gate-always`가 명시적으로 요청했을 때만");
    expect(skill).toContain("`/omg:gate on` 또는 활성 상태의 `/omg:gate-always on`");
    expect(skill).not.toContain("스킬이 자동 활성화되거나");
  });

  test("limits evidence across every activation surface", () => {
    const skill = read(join(pluginRoot, "skills/adaptive-response/SKILL.md"));
    const gate = read(join(pluginRoot, "templates/gate.md"));
    const always = read(join(pluginRoot, "templates/gate-always.md"));
    const marker = ownedMarkerBody(always);

    expect(skill).toContain("사용자가 페르소나 근거로 읽으라고 **명시한** 파일");
    expect(gate).toContain("사용자가 페르소나 근거로");
    expect(marker).toContain("사용자가 페르소나 근거로 읽으라고 명시한 파일");

    for (const content of [skill, gate, marker]) {
      expect(content).toMatch(/(?:단독으로|이것만으로) 어떤 숙련도 단계도 판정하지/);
      expect(content).toContain("사용자 직접 진술이나 같은 현재 도메인의 다른 근거");
      expect(content).toMatch(/저장된 세션 원문/);
      expect(content).toMatch(/홈·다른 저장소·브라우저/);
      expect(content).toContain("자격증명");
      expect(content).toMatch(/private memory/i);
      expect(content).toMatch(/민감/);
      expect(content).toMatch(/페르소나 데이터.*저장하지 않는다/s);
    }

    expect(marker).toContain("이 블록이나 별도 산출물에 추가·저장하지 않는다");
    expect(marker).toContain("정적 보정 절차만");
    expect(marker).not.toMatch(/사용자\s*(이름|나이|성별|국적)\s*:/);
  });

  test("keeps session and user-global scopes technically bounded", () => {
    const gate = read(join(pluginRoot, "templates/gate.md"));
    const always = read(join(pluginRoot, "templates/gate-always.md"));

    expect(gate).toContain("이번 세션의 **모든 GJC 스킬·일반 응답**");
    expect(gate).toContain("응답 보정 + 게이트 브리핑 모드: 켜짐");
    expect(always).toContain("프로젝트 `.gjc/SYSTEM.md`가 우선하지 않는 새 세션");
    expect(always).toContain("모든 GJC 스킬·일반 응답");
    expect(always.match(/^<!-- BEGIN oh-my-gjc:gate-always -->$/gm)).toHaveLength(1);
    expect(always.match(/^<!-- END oh-my-gjc:gate-always -->$/gm)).toHaveLength(1);
    expect(always).toContain("마커 밖의 다른 내용은 절대 건드리지 않는다");
    expect(always).toContain("백업은 기존 파일 바이트만 복제");
  });

  test("preserves every gate section and approval invariant", () => {
    const skill = read(join(pluginRoot, "skills/adaptive-response/SKILL.md"));
    const gate = read(join(pluginRoot, "templates/gate.md"));
    const marker = ownedMarkerBody(read(join(pluginRoot, "templates/gate-always.md")));

    for (const heading of [
      "### ① 수준 맞춤 번역",
      "### ② 승인의 경계",
      "### ③ 도메인-무지 체크리스트",
      "### ④ 판정",
    ]) {
      expect(skill).toContain(heading);
    }
    for (const section of ["수준 맞춤 번역", "승인의 경계", "도메인-무지 체크리스트", "판정"]) {
      expect(gate).toMatch(new RegExp(`[1-4]\\. (?:\\*\\*)?${section}`));
      expect(marker).toMatch(new RegExp(`[1-4]\\. (?:\\*\\*)?${section}`));
    }
    for (const content of [skill, gate, marker]) {
      expect(content).toContain("명시 없음");
      expect(content).toMatch(/승인\/반려 실행.*대행하지 않(?:는다|고)/s);
      expect(content).toMatch(/(?:보정|조정) 대상은|표현만 조정/);
      for (const invariant of ["정확성", "안전장치", "경고", "검증", "실환경", "승인 권한"]) {
        expect(content).toContain(invariant);
      }
      expect(content).toMatch(/전부 유지|절대 축소하지 않는다/);
    }
  });

  test("propagates calibration without hiding Fable findings", () => {
    const fable = read(join(pluginRoot, "templates/fable.md"));

    expect(fable).toContain("adaptive-response의 임시");
    expect(fable).toContain("입문에는 일상어 영향, 실무/전문에는 계약·경계조건·증거");
    expect(fable).toContain("간결한 완전한 목록으로 모두 제시");
    expect(fable).toContain("CRITICAL/HIGH, 안전 경계, 검증 실패");
    expect(fable).toContain("승인·수정 실행은 대행하지 않는다");
    expect(fable).not.toContain("사용자가 도메인을 모른다고 가정");
  });

  test("keeps the exact public surface at eight skills and eleven commands", () => {
    const skillRoot = join(pluginRoot, "skills");
    const skillNames = readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(skillRoot, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort();
    const commandNames = readdirSync(join(pluginRoot, "templates"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))
      .sort();

    expect(skillNames).toEqual(["adaptive-response", "deep-onboarding", "extragoal", "insane-review", "lazycodex-gjc", "no-english", "session-observer", "time-left"]);
    expect(commandNames).toEqual([
      "deep-onboarding",
      "fable",
      "gate",
      "gate-always",
      "insane-review",
      "lazycodex-gjc",
      "no-english",
      "omg",
      "session-observer",
      "setup",
      "time-left",
    ]);
  });
});
