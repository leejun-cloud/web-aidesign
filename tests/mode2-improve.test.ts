import { describe, expect, it } from "vitest";
import { MenuProposal, MigrationMap, REWRITE_GUARDRAIL } from "@/lib/design/migration";
import { SiteAnalysis } from "@/lib/design/improve";
import { menuTreeText, menuWarning } from "@/app/improve/menu";
import {
  buildRedesignPrompt,
  structureBlock,
  validateApproval,
  withApprovedStructure,
  type ImproveState,
} from "@/app/improve/logic";
import { presetFor } from "@/lib/design/brief";
import type { DesignBrief, RewriteLevel, VisualDna } from "@/lib/types";

const menu = MenuProposal.parse({
  before: ["홈", "기관소개", "사업소개", "해외사업", "국내사업", "게시판", "후원", "오시는 길"],
  after: [
    { label: "우리 활동", children: [{ label: "해외사업" }, { label: "국내사업" }] },
    { label: "기관소개", children: [{ label: "오시는 길" }] },
    { label: "후원" },
    { label: "소식", children: [{ label: "게시판" }] },
  ],
  rationale: ["방문자 행동 기준으로 사업을 하나로 묶었다"],
});

const migration = MigrationMap.parse({
  items: [
    { from: "홈", to: "메인", action: "KEEP", reason: "그대로 유지" },
    { from: "해외사업", to: "우리 활동 > 해외사업", action: "MOVE", reason: "활동 아래로 이동" },
    { from: "국내사업", to: "우리 활동 > 국내사업", action: "MOVE", reason: "활동 아래로 이동" },
    { from: "사업소개", to: "우리 활동", action: "MERGE", reason: "해외/국내 사업과 중복" },
    { from: "게시판", to: "소식 > 게시판", action: "REWRITE", reason: "제목을 구체적으로 다시 씀" },
  ],
  rewriteLevel: "clarify",
});

const analysis = SiteAnalysis.parse({
  structure: { navigation: "상단 8개", menuHierarchy: ["홈"], footer: "주소만", cta: "분산" },
  content: { duplicates: [], tooLong: [], weakHeadings: [], missing: [], misplaced: [] },
  design: { typography: "a", spacing: "b", color: "c", components: "d", imagery: "e", mobile: "f" },
  ux: { primaryActions: ["후원"], conversionPath: "홈→후원", navigationClarity: "낮음", ctaClarity: "낮음" },
});

const state = (patch: Partial<ImproveState> = {}): ImproveState => ({
  url: "https://oursite.org",
  rewriteLevel: "clarify",
  analysis,
  menu,
  migration,
  menuApproved: true,
  migrationApproved: true,
  ...patch,
});

const brief: DesignBrief = {
  projectId: "p1",
  mode: "improve",
  references: [{ id: "A", kind: "url", value: "https://ref.com" }],
  level: "similar",
  advanced: presetFor("similar").advanced,
  photo: presetFor("similar").photo,
  existingUrl: "https://oursite.org",
  rewriteLevel: "clarify",
};

const visualDna = {
  mood: ["차분한"],
  layout: {
    heroStructure: "좌우 분할", grid: "12", containerWidth: "1200px",
    sectionOrder: ["header", "hero", "services", "cta", "footer"],
    contentAlignment: "왼쪽", imagePlacement: "우측", header: "고정",
  },
  typography: { fontPersonality: "a", headingScale: "b", weight: "c", lineHeight: "d", letterSpacing: "e", hierarchy: "f" },
  color: {
    background: "#ffffff", surface: "#f5f5f5", primary: "#123456", secondary: "#654321",
    accent: "#ff0000", text: "#111111", saturation: "낮음", temperature: "중립",
  },
  photography: {
    composition: "a", lighting: "b", colorGrading: "c", cameraAngle: "d", depthOfField: "e",
    humanPose: "f", environment: "g", texture: "h", imageRatio: "16:9",
  },
  components: { buttons: "a", cards: "b", forms: "c", navigation: "d", border: "e", radius: "f", shadow: "g" },
  spacing: { sectionGap: "a", containerPadding: "b", cardPadding: "c", contentGap: "d", heroWhitespace: "e" },
  motion: { fade: "a", reveal: "b", scroll: "c", hover: "d", transition: "e" },
} satisfies VisualDna;

describe("리디자인 프롬프트 (PRD §26, §28)", () => {
  const prompt = buildRedesignPrompt({ brief, visualDna, state: state() });

  it("승인된 새 메뉴 트리를 싣는다", () => {
    expect(prompt).toContain("## 확정된 정보 구조");
    expect(prompt).toContain("- 우리 활동");
    expect(prompt).toContain("  - 해외사업");
    expect(prompt).toContain("  - 오시는 길");
  });

  it("Migration Map 을 항목별로 싣는다", () => {
    for (const item of migration.items) {
      expect(prompt).toContain(item.from);
      expect(prompt).toContain(item.to);
    }
    expect(prompt).toContain("| MERGE |");
    expect(prompt).toContain("| REWRITE |");
  });

  it("발명 금지 제약과 재작성 가드레일을 싣는다", () => {
    expect(prompt).toContain("새 메뉴나 없는 사업을 발명하지 마라");
    expect(prompt).toContain(REWRITE_GUARDRAIL);
  });

  it("기존 브랜드 브리프를 지우지 않는다", () => {
    const merged = withApprovedStructure({ ...brief, brandBrief: "우리는 비영리 기관이다" }, state());
    expect(merged.brandBrief).toContain("우리는 비영리 기관이다");
    expect(merged.brandBrief).toContain("## 확정된 정보 구조");
  });
});

describe("Rewrite 강도 3단계 (PRD §27)", () => {
  it("각각 다른 지시문을 만든다", () => {
    const levels: RewriteLevel[] = ["keep", "clarify", "rewrite"];
    const blocks = levels.map((rewriteLevel) => structureBlock({ menu, migration, rewriteLevel }));
    expect(new Set(blocks).size).toBe(3);
    expect(blocks[0]).toContain("최대한 그대로 유지");
    expect(blocks[1]).toContain("짧고 읽기 쉽게");
    expect(blocks[2]).toContain("적극적으로 재작성");
    for (const b of blocks) expect(b).toContain(REWRITE_GUARDRAIL);
  });
});

describe("승인 게이트 (PRD §25)", () => {
  it("저장된 분석 결과가 없으면 400", () => {
    const r = validateApproval(undefined);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("메뉴 승인 전에는 400", () => {
    const r = validateApproval(state({ menuApproved: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("메뉴 개선안");
  });

  it("Migration Map 승인 전에는 400", () => {
    const r = validateApproval(state({ migrationApproved: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Migration Map");
  });

  it("둘 다 승인되면 통과한다", () => {
    const r = validateApproval(state());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.menu.after.length).toBe(4);
  });
});

describe("UI 경고 계산 (PRD §25)", () => {
  it("새 구조에 남은 메뉴는 사라진 것으로 보지 않는다", () => {
    const w = menuWarning(menu);
    expect(w.topLevel).toBe(4);
    expect(w.tooManyTopLevel).toBe(false);
    expect(w.dropped).not.toContain("해외사업");
  });

  it("조용히 버려진 메뉴를 경고한다", () => {
    const dropped = MenuProposal.parse({
      before: ["홈", "후원", "채용"],
      after: [{ label: "홈" }, { label: "후원" }],
      rationale: ["채용을 뺐다"],
    });
    const w = menuWarning(dropped);
    expect(w.warn).toBe(true);
    expect(w.dropped).toEqual(["채용"]);
  });

  it("최상위가 7개를 넘으면 경고한다", () => {
    const wide = MenuProposal.parse({
      before: ["a"],
      after: "abcdefgh".split("").map((label) => ({ label })),
      rationale: ["묶지 않았다"],
    });
    expect(menuWarning(wide).tooManyTopLevel).toBe(true);
  });

  it("메뉴 트리를 2단 들여쓰기로 직렬화한다", () => {
    expect(menuTreeText(menu.after)).toBe(
      ["- 우리 활동", "  - 해외사업", "  - 국내사업", "- 기관소개", "  - 오시는 길", "- 후원", "- 소식", "  - 게시판"].join("\n"),
    );
  });
});
