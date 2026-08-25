import { describe, expect, it } from "vitest";
import type { SiteFacts } from "@/lib/design/capture";
import { MenuProposal } from "@/lib/design/migration";
import {
  SiteAnalysis, buildMenuProposalPrompt, buildMigrationPrompt, buildSiteAnalysisPrompt,
} from "@/lib/design/improve";

const facts: SiteFacts = {
  url: "https://oursite.org",
  title: "우리기관",
  navLinks: ["홈", "기관소개", "사업소개", "해외사업", "국내사업", "게시판", "후원", "오시는 길"]
    .map((text) => ({ text, href: "#" })),
  headings: [{ level: 1, text: "우리기관입니다" }, { level: 2, text: "사업소개" }],
  ctaTexts: ["후원하기", "자세히 보기", "문의하기"],
  imageCount: 12,
  oversizedImages: 3,
  missingAlt: 7,
  textSample: "본문 발췌 내용. 저희는 여러 나라에서 활동합니다.",
  fonts: ["Noto Sans KR"],
  colors: ["#111"],
  loadMs: 3200,
};

const analysis = SiteAnalysis.parse({
  structure: { navigation: "상단 8개 메뉴", menuHierarchy: ["홈", "기관소개"], footer: "주소만", cta: "후원하기 분산" },
  content: { duplicates: ["후원 설명 중복"], tooLong: ["사업소개 문단"], weakHeadings: ["사업소개"], missing: ["연차보고"], misplaced: ["오시는 길이 상단"] },
  design: { typography: "본문 작음", spacing: "섹션 간격 불균일", color: "저채도", components: "버튼 두 종류", imagery: "저해상도", mobile: "가로 스크롤" },
  ux: { primaryActions: ["후원하기", "사업 알아보기"], conversionPath: "홈→후원", navigationClarity: "낮음", ctaClarity: "낮음" },
});

describe("기존 사이트 분석 프롬프트 (PRD §24)", () => {
  it("실측 자료를 근거로 싣고 사실 조작을 금지한다", () => {
    const p = buildSiteAnalysisPrompt(facts);
    expect(p).toContain("Content Architect");
    expect(p).toContain("기관소개");
    expect(p).toContain("alt 누락 7개");
    expect(p).toContain("3200ms");
    expect(p).toContain("만들어내지 마라");
  });
  it("네 갈래 분석 축을 모두 요구한다", () => {
    const p = buildSiteAnalysisPrompt(facts);
    for (const axis of ["구조", "콘텐츠", "디자인", "UX"]) expect(p).toContain(axis);
  });
  it("관찰되지 않은 것은 빼라고 지시한다", () => {
    expect(buildSiteAnalysisPrompt(facts)).toContain("확인할 수 없는 것은");
  });
});

describe("메뉴 재구성 프롬프트 (PRD §25, §66)", () => {
  it("기존 메뉴 전체를 before 로 싣는다", () => {
    const p = buildMenuProposalPrompt({ facts, analysis });
    for (const m of ["홈", "기관소개", "사업소개", "해외사업", "국내사업", "게시판", "후원", "오시는 길"]) {
      expect(p).toContain(m);
    }
  });
  it("최상위 5~6개 목표와 항목 유실 금지를 명시한다", () => {
    const p = buildMenuProposalPrompt({ facts, analysis });
    expect(p).toContain("5~6개");
    expect(p).toContain("조용히 버리지 마라");
    expect(p).toContain("발명하지 마라");
  });
  it("분석에서 도출된 주요 행동을 근거로 넘긴다", () => {
    expect(buildMenuProposalPrompt({ facts, analysis })).toContain("후원하기, 사업 알아보기");
  });
});

const menu = MenuProposal.parse({
  before: ["홈", "기관소개", "사업소개", "게시판"],
  after: [
    { label: "홈" },
    { label: "우리가 하는 일", children: [{ label: "해외사업" }] },
    { label: "소식", children: [{ label: "게시판" }] },
  ],
  rationale: ["행동 기준으로 묶음"],
});

describe("Migration Map 프롬프트 (PRD §26, §27)", () => {
  it("새 구조 트리를 들여쓰기로 펼쳐 넘긴다", () => {
    const p = buildMigrationPrompt({ facts, menu, rewriteLevel: "clarify" });
    expect(p).toContain("- 우리가 하는 일");
    expect(p).toContain("  - 해외사업");
  });
  it("5개 action 과 유실 항목 필수 등장을 명시한다", () => {
    const p = buildMigrationPrompt({ facts, menu, rewriteLevel: "clarify" });
    expect(p).toContain("KEEP / MOVE / MERGE / REWRITE / REMOVE");
    expect(p).toContain("설명 없이 사라지면 실패");
  });
  it("rewriteLevel 별로 지시문이 달라진다", () => {
    const keep = buildMigrationPrompt({ facts, menu, rewriteLevel: "keep" });
    const rewrite = buildMigrationPrompt({ facts, menu, rewriteLevel: "rewrite" });
    expect(keep).toContain("최대한 그대로 유지");
    expect(rewrite).toContain("적극적으로 재작성");
    expect(keep).not.toBe(rewrite);
  });
  it("어떤 강도에서도 성과 조작 금지 가드레일이 붙는다", () => {
    for (const level of ["keep", "clarify", "rewrite"] as const) {
      expect(buildMigrationPrompt({ facts, menu, rewriteLevel: level })).toContain("성과를 만들어내지 않는다");
    }
  });
});
