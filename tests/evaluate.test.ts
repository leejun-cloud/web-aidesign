import { describe, expect, it } from "vitest";
import { Evaluation, ScoreBreakdown, gapAnalysis, prioritize, scoreTrend, type Improvement } from "@/lib/design/evaluate";

const breakdown = ScoreBreakdown.parse({
  visualDesign: 88, visualHierarchy: 76, typography: 81, brandConsistency: 91,
  navigation: 68, contentClarity: 72, conversion: 75, mobileUx: 84,
  accessibility: 67, performance: 89, motionQuality: 70, trust: 78,
});

const imps: Improvement[] = [
  { title: "본문 Contrast 개선", impact: "MEDIUM", metric: "accessibility", problem: "대비 부족", fix: "본문 색을 어둡게" },
  { title: "Navigation 단순화", impact: "HIGH", metric: "navigation", sectionId: "header", problem: "메뉴 과다", fix: "5개로 묶기" },
  { title: "Hero CTA 명확화", impact: "HIGH", metric: "conversion", sectionId: "hero", problem: "CTA 분산", fix: "하나만 남기기" },
  { title: "Mobile spacing 정리", impact: "MEDIUM", metric: "mobileUx", problem: "여백 불균일", fix: "간격 토큰 적용" },
];

describe("개선 우선순위 (PRD §32)", () => {
  it("HIGH 가 먼저, 동급이면 낮은 점수 항목이 먼저 온다", () => {
    expect(prioritize(imps, breakdown).map((i) => i.title)).toEqual([
      "Navigation 단순화", "Hero CTA 명확화", "본문 Contrast 개선", "Mobile spacing 정리",
    ]);
  });
  it("원본 배열을 변형하지 않는다", () => {
    const before = imps.map((i) => i.title);
    prioritize(imps, breakdown);
    expect(imps.map((i) => i.title)).toEqual(before);
  });
  it("개선안은 각각 문제와 해법을 반드시 가진다", () => {
    const bad = { ...imps[0], fix: "" };
    expect(Evaluation.safeParse({
      url: "https://x.com", total: 80, breakdown, visualNotes: ["a"], uxNotes: ["b"],
      contentScore: 71, contentIssues: [], improvements: [bad],
    }).success).toBe(false);
  });
  it("개선안이 하나도 없는 평가는 거부한다", () => {
    expect(Evaluation.safeParse({
      url: "https://x.com", total: 80, breakdown, visualNotes: ["a"], uxNotes: ["b"],
      contentScore: 71, contentIssues: [], improvements: [],
    }).success).toBe(false);
  });
});

describe("Gap 분석 (PRD §38)", () => {
  it("가장 뒤처진 축을 맨 앞에 놓는다", () => {
    const gaps = gapAnalysis(
      { layout: 76, typography: 68, photography: 59, motion: 42 },
      { layout: 94, typography: 90, photography: 95, motion: 82 },
    );
    expect(gaps[0]).toEqual({ axis: "motion", ours: 42, reference: 82, delta: -40 });
    expect(gaps.map((g) => g.axis)).toEqual(["motion", "photography", "typography", "layout"]);
    expect(gaps.map((g) => g.delta)).toEqual([-40, -36, -22, -18]);
  });
  it("한쪽에만 있는 축은 무시한다", () => {
    expect(gapAnalysis({ layout: 50, extra: 10 }, { layout: 60 }).map((g) => g.axis)).toEqual(["layout"]);
  });
});

describe("Score History (PRD §34)", () => {
  it("82 → 88 → 92 는 개선으로 본다", () => {
    const t = scoreTrend([
      { at: "1", total: 82, label: "초기" },
      { at: "2", total: 88, label: "1차" },
      { at: "3", total: 92, label: "2차" },
    ]);
    expect(t).toEqual({ improved: true, delta: 10 });
  });
  it("이력이 하나면 판단하지 않는다", () => {
    expect(scoreTrend([{ at: "1", total: 82, label: "초기" }]).improved).toBe(false);
  });
});
