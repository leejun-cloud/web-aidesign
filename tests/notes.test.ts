import { describe, expect, it } from "vitest";
import { STAGE_LABELS, noteFromText, notesBlock, type Note } from "@/lib/design/notes";
import { buildGeneratePrompt } from "@/lib/design/generate";
import { buildSectionEditPrompt, SectionEditRequest } from "@/lib/design/sectionEdit";
import { buildEvaluationPrompt } from "@/lib/design/audit";
import { buildSiteAnalysisPrompt } from "@/lib/design/improve";
import { buildProductionPlanPrompt } from "@/lib/design/productionize";
import { LEVEL_PRESETS, PHOTO_PRESETS, type DesignBrief, type VisualDna } from "@/lib/types";
import type { SiteFacts } from "@/lib/design/capture";

const notes: Note[] = [
  { stage: "design", text: "파란색 계열은 피해주세요", at: "2026-08-24T00:00:00.000Z" },
  { stage: "content", text: "'최고' 같은 표현은 의료법상 못 씁니다", at: "2026-08-24T00:00:00.000Z" },
  { stage: "analysis", text: "게시판은 곧 없앨 예정입니다", at: "2026-08-24T00:00:00.000Z" },
  { stage: "evaluate", text: "주 방문자는 50대 이상입니다", at: "2026-08-24T00:00:00.000Z" },
  { stage: "production", text: "기존 코드베이스는 Tailwind v3 입니다", at: "2026-08-24T00:00:00.000Z" },
];

describe("자유 입력 블록", () => {
  it("해당 단계의 요청만 골라 싣는다", () => {
    const b = notesBlock(notes, ["design"]);
    expect(b).toContain("파란색 계열은 피해주세요");
    expect(b).not.toContain("Tailwind v3");
  });

  it("여러 단계를 함께 실을 수 있다", () => {
    const b = notesBlock(notes, ["design", "content"]);
    expect(b).toContain("파란색");
    expect(b).toContain("의료법");
  });

  it("요청이 다른 지시보다 우선한다고 명시한다", () => {
    expect(notesBlock(notes, ["design"])).toContain("우선한다");
  });

  it("저작권 경계와 사실 조작은 예외로 못박는다", () => {
    const b = notesBlock(notes, ["design"]);
    expect(b).toContain("저작권 경계");
    expect(b).toContain("사실 출처가 아니다");
  });

  it("요청이 없으면 빈 문자열 — 프롬프트에 빈 섹션을 만들지 않는다", () => {
    expect(notesBlock([], ["design"])).toBe("");
    expect(notesBlock(undefined, ["design"])).toBe("");
    expect(notesBlock([{ stage: "design", text: "   ", at: "x" }], ["design"])).toBe("");
  });

  it("5개 단계 모두 라벨과 예시 문구를 갖는다", () => {
    const stages = ["design", "content", "analysis", "evaluate", "production"] as const;
    for (const s of stages) {
      expect(STAGE_LABELS[s].label.length).toBeGreaterThan(1);
      expect(STAGE_LABELS[s].placeholder).toContain("예:");
    }
  });

  it("한 칸 입력을 Note 로 바꾼다", () => {
    expect(noteFromText("  ", "design", "t")).toEqual([]);
    expect(noteFromText("짧은 요청", "design", "t")[0].text).toBe("짧은 요청");
  });
});

const dna = {
  mood: ["minimal"],
  layout: { heroStructure: "a", grid: "b", containerWidth: "c", sectionOrder: ["header", "hero", "footer"], contentAlignment: "d", imagePlacement: "e", header: "f" },
  typography: { fontPersonality: "a", headingScale: "b", weight: "c", lineHeight: "d", letterSpacing: "e", hierarchy: "f" },
  color: { background: "#fff", surface: "#eee", primary: "#00f", secondary: "#333", accent: "#f00", text: "#111", saturation: "low", temperature: "cool" },
  photography: { composition: "a", lighting: "b", colorGrading: "c", cameraAngle: "d", depthOfField: "e", humanPose: "f", environment: "g", texture: "h", imageRatio: "i" },
  components: { buttons: "a", cards: "b", forms: "c", navigation: "d", border: "e", radius: "f", shadow: "g" },
  spacing: { sectionGap: "a", containerPadding: "b", cardPadding: "c", contentGap: "d", heroWhitespace: "e" },
  motion: { fade: "a", reveal: "b", scroll: "c", hover: "d", transition: "e" },
} satisfies VisualDna;

const brief: DesignBrief = {
  projectId: "p",
  mode: "create",
  references: [{ id: "A", kind: "url", value: "https://x.com" }],
  level: "similar",
  advanced: LEVEL_PRESETS.similar,
  photo: PHOTO_PRESETS.similar,
  notes,
};

const facts: SiteFacts = {
  url: "https://x.com", title: "T", navLinks: [{ text: "홈", href: "#" }],
  headings: [{ level: 1, text: "H" }], ctaTexts: ["가기"], imageCount: 1,
  oversizedImages: 0, missingAlt: 0, textSample: "본문", fonts: [], colors: [], loadMs: 100,
};

describe("각 단계 프롬프트에 실제로 실린다", () => {
  it("생성 — 디자인·문구 요청", () => {
    const p = buildGeneratePrompt({ brief, visualDna: dna });
    expect(p).toContain("파란색 계열은 피해주세요");
    expect(p).toContain("의료법");
    expect(p).not.toContain("Tailwind v3");
  });

  it("섹션 수정 — 디자인·문구 요청", () => {
    const p = buildSectionEditPrompt({
      req: SectionEditRequest.parse({ projectId: "p", sectionId: "hero", instruction: "고쳐줘" }),
      sectionHtml: "<section></section>",
      allSectionIds: ["hero"],
      notes,
    });
    expect(p).toContain("파란색 계열은 피해주세요");
  });

  it("기존 사이트 분석 — 분석 참고사항", () => {
    expect(buildSiteAnalysisPrompt(facts, notes)).toContain("게시판은 곧 없앨 예정");
  });

  it("평가 — 평가 기준 참고사항", () => {
    const p = buildEvaluationPrompt({ facts, measurements: [], shots: [], notes });
    expect(p).toContain("주 방문자는 50대 이상");
  });

  it("Production — 개발 참고사항만", () => {
    const p = buildProductionPlanPrompt({ html: "<html></html>", sectionIds: ["hero"], framework: "nextjs", notes });
    expect(p).toContain("Tailwind v3");
    expect(p).not.toContain("파란색 계열은 피해주세요");
  });
});
