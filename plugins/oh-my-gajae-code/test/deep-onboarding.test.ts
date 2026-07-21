import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = join(import.meta.dir, "..");
const skillPath = join(pluginRoot, "skills/deep-onboarding/SKILL.md");
const commandPath = join(pluginRoot, "templates/deep-onboarding.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("deep-onboarding surface contract", () => {
  test("declares the Korean-first skill and explicit command", () => {
    const skill = read(skillPath);
    const command = read(commandPath);

    expect(skill).toMatch(/^---\nname: deep-onboarding\ndescription: .*문서화가 부족/m);
    expect(skill).toContain("기본 응답과 산출물은 한국어로 쓰되");
    expect(command).toMatch(/^---\ndescription: .*문서가 부족한 저장소/m);
    expect(command).toContain('argument-hint: "[output-path]"');
    expect(command).toContain("# /omg:deep-onboarding");
  });

  test("keeps the three phases evidence-labeled and read-only before confirmation", () => {
    const skill = read(skillPath);
    const phaseOne = skill.slice(skill.indexOf("## Phase 1"), skill.indexOf("## Phase 2"));
    const previewAt = skill.indexOf("세 파일의 미리보기");
    const confirmationAt = skill.indexOf("그 경로에 세 파일을 작성하는 것을 명시적으로 확인");

    for (const phase of ["## Phase 1", "## Phase 2", "## Phase 3"]) expect(skill).toContain(phase);
    for (const label of ["관찰 사실 (Observed)", "사용자 진술 (User statement)", "추론 (Inference)"]) {
      expect(skill).toContain(label);
    }
    expect(phaseOne).toContain("`read`, `search`, `find`만");
    expect(phaseOne).not.toMatch(/`(?:write|edit|bash)`/);
    expect(skill).toContain("핵심 불확실성 하나만 한 번에");
    expect(skill).toContain("이 토폴로지와 미확인 항목이 맞나요?");
    expect(previewAt).toBeGreaterThan(-1);
    expect(confirmationAt).toBeGreaterThan(previewAt);
    expect(skill.slice(previewAt, confirmationAt)).toContain("파일을 작성하지 않는다");
  });

  test("previews only the three agreed Markdown contracts", () => {
    const skill = read(skillPath);

    for (const file of ["`project-map.md`", "`adr-proposals.md`", "`handoff.md`"]) {
      expect(skill).toContain(file);
    }
    expect(skill).toContain("증거 표기가 있는 잠정 프로젝트 맵");
    expect(skill).toContain("대안, 트레이드오프, 근거, 미해결 질문");
    expect(skill).toContain("다음 담당자가 시작할 위치");
    expect(skill).toContain("세 Markdown 파일만 작성한다");
    expect(skill).toContain("`git commit`, stage, push, tag, release를 하지 않는다");
  });

  test("requires an explicit safe output path and per-file overwrite approval", () => {
    const skill = read(skillPath);

    expect(skill).toContain("정확히 하나의 출력 디렉터리");
    expect(skill).toContain("정확한 절대·정규 경로");
    expect(skill).toContain("그 경로에 세 파일을 작성하는 것을 명시적으로 확인");
    for (const boundary of ["상대 경로·`~`", "루트 디렉터리 `/`", "홈 디렉터리 `$HOME`", "`.git`, `.gjc`", "새 디렉터리 생성을 요구하는 경로", "파일별 명시 승인"]) {
      expect(skill).toContain(boundary);
    }
    expect(skill).toContain("분석 대상 저장소 내부 경로는 기본값으로 선택하거나 자동 제안하지 않는다");
  });

  test("treats the command argument as a proposal, never implicit approval", () => {
    const command = read(commandPath);

    expect(command).toContain("명시적으로 호출됐을 때만");
    expect(command).toContain("출력 경로 제안");
    expect(command).toContain("확인된 디렉터리, 쓰기 승인, 덮어쓰기 승인이 아니며");
    expect(command).toContain("사용자가 확인하기 전에는");
    expect(command).toContain("자연어 요청이나 단순 경로 언급으로 이 명령의 동작을 대신 시작하지 않는다");
    expect(command).toContain("선택 인자는 확인이 아니라 제안이다");
  });

  test("records demand provenance without upstream activity instructions", () => {
    const skill = read(skillPath);

    expect(skill).toContain("upstream #158 + Discord");
    expect(skill).toContain("외부 활동을 지시하거나 수행하지 않는다");
  });
});
