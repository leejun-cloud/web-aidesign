import { describe, expect, it } from "vitest";
import {
  MenuProposal, MigrationMap, REWRITE_GUARDRAIL, REWRITE_INSTRUCTION,
  auditMigration, droppedMenus, topLevelCount,
} from "@/lib/design/migration";

// PRD §25 의 예시를 그대로 쓴다
const menu = MenuProposal.parse({
  before: ["홈", "기관소개", "사업소개", "해외사업", "국내사업", "게시판", "후원", "오시는 길"],
  after: [
    { label: "홈" },
    { label: "우리가 하는 일", children: [{ label: "해외사업" }, { label: "국내사업" }, { label: "기술지원" }] },
    { label: "우리 이야기", children: [{ label: "기관소개" }] },
    { label: "함께하기", children: [{ label: "오시는 길" }] },
    { label: "후원하기" },
    { label: "소식", children: [{ label: "게시판" }] },
  ],
  rationale: ["방문자 행동 기준으로 묶었다"],
});

describe("메뉴 재구성 (PRD §25, §66)", () => {
  it("최상위 메뉴 수를 센다", () => {
    expect(topLevelCount(menu)).toBe(6);
  });
  it("중첩 메뉴까지 훑어 사라진 항목만 골라낸다", () => {
    expect(droppedMenus(menu)).toEqual(["사업소개"]);
  });
  it("사라진 항목이 Migration Map 에 없으면 감사에 실패한다", () => {
    const map = MigrationMap.parse({
      rewriteLevel: "clarify",
      items: [{ from: "기관소개", to: "About Hero + Mission", action: "MOVE", reason: "상단 소개로 이동" }],
    });
    const a = auditMigration(menu, map);
    expect(a.ok).toBe(false);
    expect(a.unaccounted).toEqual(["사업소개"]);
  });
  it("MERGE 로 설명되면 통과한다", () => {
    const map = MigrationMap.parse({
      rewriteLevel: "clarify",
      items: [
        { from: "사업소개", to: "우리가 하는 일", action: "MERGE", reason: "하위 사업으로 통합" },
        { from: "중복 후원 설명", to: "후원하기", action: "MERGE", reason: "중복 제거" },
      ],
    });
    const a = auditMigration(menu, map);
    expect(a.ok).toBe(true);
    expect(a.counts.MERGE).toBe(2);
  });
  it("빈 after 는 스키마가 거부한다", () => {
    expect(MenuProposal.safeParse({ before: ["홈"], after: [], rationale: ["x"] }).success).toBe(false);
  });
  it("허용되지 않은 action 은 거부한다", () => {
    expect(MigrationMap.safeParse({
      rewriteLevel: "keep",
      items: [{ from: "a", to: "b", action: "DELETE", reason: "x" }],
    }).success).toBe(false);
  });
});

describe("Rewrite 가드레일 (PRD §27)", () => {
  it("세 단계 지시문이 모두 있고 서로 다르다", () => {
    const v = Object.values(REWRITE_INSTRUCTION);
    expect(v).toHaveLength(3);
    expect(new Set(v).size).toBe(3);
  });
  it("성과 조작 금지를 명시한다", () => {
    expect(REWRITE_GUARDRAIL).toContain("만들어내지 않는다");
    expect(REWRITE_GUARDRAIL).toContain("성과");
  });
});
