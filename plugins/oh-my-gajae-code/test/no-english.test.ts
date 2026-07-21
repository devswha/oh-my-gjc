import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = join(import.meta.dir, "..");
const skillPath = join(pluginRoot, "skills/no-english/SKILL.md");
const commandPath = join(pluginRoot, "templates/no-english.md");
const installerPath = join(pluginRoot, "bin/install-skill.sh");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("no-english skill contract", () => {
  test("activates only through the explicit session command", () => {
    const skill = read(skillPath);
    expect(skill).toMatch(/^---\nname: no-english\ndescription: .*영어 혼용.*영어 전문용어 남발/m);
    expect(skill).toContain("`/omg:no-english` 명령이 명시적으로 요청했을 때만");
    expect(skill).toContain("문장의 뼈대를 한국어로 유지");
    expect(skill).toContain("한국어(English)");
    expect(skill).toContain("사용자가 영어 답변이나 원문 용어 유지를 명시하면");
    expect(skill).toContain("다른 입력에서는 자동 활성화하지 않는다");
    const command = read(commandPath);
    expect(command).toContain("# /omg:no-english");
    expect(command).toContain("[on|off|status]");
    expect(command).toContain("새 세션에는 상태를 넘기지 않는다");
    expect(skill.split("---", 3)[1]).not.toContain("영어를 줄여줘");
    expect(skill.split("---", 3)[1]).not.toContain("한국어로 말해");
  });

  test("preserves executable and exact technical strings", () => {
    const skill = read(skillPath);
    for (const boundary of [
      "코드 식별자",
      "셸 명령",
      "파일·디렉터리 경로",
      "로그·오류 메시지",
      "스키마 필드",
      "정확한 일치를 요구하는 고유 라벨",
    ]) {
      expect(skill).toContain(boundary);
    }
    for (const canonical of [
      "`ultragoal`",
      "`ralplan`",
      "`deep-interview`",
      "`team`",
      "`adaptive-response`",
    ]) {
      expect(skill).toContain(canonical);
    }
    expect(skill).toContain("일반 문장 안에서도 번역하거나 한글로 음역하지 않는다");
    expect(skill).toContain("“울트라고울”, “울트라골”, “랄플랜”, “딥 인터뷰”처럼");
    expect(skill).toContain("코드나 명령 자체를 번역하지 않는다");
    for (const exact of [
      "`gjc state ralplan read --json`",
      "`src/api/client.ts`",
      "`workflow.gates.list`",
      "WebSocket API",
      "`pending-approval`",
      "`gate_id`",
      "`Error: SDK connection is not available`",
      "“source of truth”",
      "테스트 12/12 통과",
      "실제 배포는",
      "검증하지 않았습니다",
      "**지금 배포하면 안 됩니다.**",
    ]) {
      expect(skill).toContain(exact);
    }
    expect(skill).toContain("필요한 근거·수치·파일 위치를 생략하지 않는다");
  });

  test("documents contextual translation rather than an English ban", () => {
    const skill = read(skillPath);
    expect(skill).toContain("영어를 기계적으로 없애는 번역기가 아니라");
    expect(skill).toContain("`Quadrant`가 정확한 열 이름이나 enum 값이라면");
    expect(skill).toContain("사분면 판정 기준을 무엇으로 고정할까요?");
    expect(skill).toContain("`adaptive-response`는 설명의 깊이와 형식을 정하고");
  });

  test("is part of the exact native skill manifest", () => {
    const installer = read(installerPath);
    expect(installer).toContain(
      "EXPECTED_SKILLS=(adaptive-response no-english extragoal insane-review deep-onboarding multi-harness-research)",
    );
    expect(installer).toContain("REMOVED_SKILLS=(gate-briefing korean-first workflow-eta ");
  });
});
