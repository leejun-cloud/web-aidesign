import { describe, expect, it } from "vitest";
import {
  MEASURE_TO_METRIC,
  buildComparisonPrompt,
  buildEvaluationPrompt,
  contradictions,
} from "@/lib/design/audit";
import { Evaluation, ScoreBreakdown, type EvaluationReport } from "@/lib/design/evaluate";
import { measureSite } from "@/lib/design/measure";
import type { SiteFacts } from "@/lib/design/capture";
import { AXES } from "@/lib/types";

const facts = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  url: "https://ours.example",
  title: "Ours",
  navLinks: Array.from({ length: 9 }, (_, i) => ({ text: `메뉴${i}`, href: `/m${i}` })),
  headings: [
    { level: 1, text: "메인 헤드라인" },
    { level: 1, text: "두 번째 h1" },
    { level: 4, text: "레벨 점프" },
  ],
  ctaTexts: ["문의하기", "지금 시작", "더 보기"],
  imageCount: 10,
  oversizedImages: 3,
  textSample: "우리 회사는 무엇을 합니다.",
  fonts: ["Inter"],
  colors: ["#111111", "#ffffff"],
  missingAlt: 7,
  loadMs: 6200,
  ...over,
});

const refFacts = facts({ url: "https://ref.example", title: "Reference", missingAlt: 0, loadMs: 900 });

const breakdown = ScoreBreakdown.parse({
  visualDesign: 80, visualHierarchy: 95, typography: 80, brandConsistency: 80,
  navigation: 55, contentClarity: 70, conversion: 70, mobileUx: 70,
  accessibility: 92, performance: 40, motionQuality: 60, trust: 70,
});

describe("buildEvaluationPrompt — 출처 분리 (PRD §31)", () => {
  const { measurements } = measureSite(facts());
  const prompt = buildEvaluationPrompt({
    facts: facts(),
    measurements,
    shots: ["/tmp/desktop.png", "/tmp/mobile.png"],
  });

  it("실측치를 숫자와 관측 문구까지 그대로 싣는다", () => {
    for (const m of measurements) {
      expect(prompt).toContain(`${m.key}`);
      expect(prompt).toContain(`${m.score}/100`);
      expect(prompt).toContain(m.observed);
    }
  });

  it("실측을 뒤집지 말라는 제약을 명시한다", () => {
    expect(prompt).toContain("뒤집지 마라");
    expect(prompt).toContain("실측");
    expect(prompt).toMatch(/60 미만/);
  });

  it("실측 60 미만 항목과 대응 세부 점수 키를 연결해 경고한다", () => {
    const low = measurements.filter((m) => m.score < 60);
    expect(low.length).toBeGreaterThan(0);
    for (const m of low) {
      for (const metric of MEASURE_TO_METRIC[m.key] ?? []) {
        expect(prompt).toContain(metric);
      }
    }
  });

  it("12개 세부 점수 키를 모두 요구한다", () => {
    for (const key of Object.keys(ScoreBreakdown.shape)) expect(prompt).toContain(key);
  });

  it("AI 가 평가할 영역과 실측 영역을 갈라 적는다", () => {
    const measuredIdx = prompt.indexOf("측정 가능 항목");
    const visualIdx = prompt.indexOf("AI Visual Evaluation");
    const uxIdx = prompt.indexOf("UX Heuristic");
    expect(measuredIdx).toBeGreaterThan(-1);
    expect(measuredIdx).toBeLessThan(visualIdx);
    expect(visualIdx).toBeLessThan(uxIdx);
    for (const t of ["brand consistency", "photography", "design cohesion", "cognitive load", "information density"]) {
      expect(prompt).toContain(t);
    }
  });

  it("UX Auditor 역할과 콘텐츠 구조 평가를 요구한다 (PRD §62, §67)", () => {
    expect(prompt).toContain("UX Auditor");
    expect(prompt).toContain("contentScore");
    expect(prompt).toContain("contentIssues");
  });

  it("개선안에 impact/metric/sectionId/problem/fix 와 섹션 후보를 요구한다 (PRD §32, §68)", () => {
    for (const k of ["impact", "metric", "sectionId", "problem", "fix"]) expect(prompt).toContain(k);
    for (const s of ["header", "hero", "trust", "services", "story", "features", "testimonials", "cta", "footer"]) {
      expect(prompt).toContain(s);
    }
  });

  it("근거 없는 칭찬과 추측을 금지한다", () => {
    expect(prompt).toContain("근거 없는 칭찬 금지");
    expect(prompt).toContain("추측 금지");
  });

  it("스크린샷 경로를 프롬프트에 싣는다", () => {
    expect(prompt).toContain("desktop.png");
    expect(prompt).toContain("mobile.png");
  });
});

describe("buildComparisonPrompt (PRD §36, §37)", () => {
  const prompt = buildComparisonPrompt({
    ours: facts(),
    reference: refFacts,
    ourShots: ["/tmp/ours-desktop.png"],
    refShots: ["/tmp/ref-desktop.png"],
  });

  it("양쪽 facts 를 모두 싣는다", () => {
    expect(prompt).toContain("https://ours.example");
    expect(prompt).toContain("https://ref.example");
    expect(prompt).toContain("Reference");
    expect(prompt).toContain("6200ms");
    expect(prompt).toContain("900ms");
  });

  it("7축 유사도를 요구한다", () => {
    for (const axis of AXES) expect(prompt).toContain(axis);
    expect(prompt).toContain("overall");
    expect(prompt).toContain("7축");
  });

  it("양쪽 스크린샷을 구분해 싣는다", () => {
    expect(prompt).toContain("ours-desktop.png");
    expect(prompt).toContain("ref-desktop.png");
  });
});

describe("Evaluation 스키마 경계", () => {
  const base = {
    url: "https://x.com", total: 80, breakdown,
    visualNotes: ["a"], uxNotes: ["b"], contentScore: 70, contentIssues: [],
    improvements: [{ title: "네비 정리", impact: "HIGH", metric: "navigation", problem: "메뉴 과다", fix: "5개로 묶기" }],
  };

  it("visualNotes 가 비면 거부한다", () => {
    expect(Evaluation.safeParse({ ...base, visualNotes: [] }).success).toBe(false);
  });
  it("uxNotes 가 비면 거부한다", () => {
    expect(Evaluation.safeParse({ ...base, uxNotes: [] }).success).toBe(false);
  });
  it("improvements 키 자체가 없는 응답을 거부한다", () => {
    const { improvements: _drop, ...noImps } = base;
    expect(Evaluation.safeParse(noImps).success).toBe(false);
  });
  it("점수 범위를 넘거나 소수면 거부한다", () => {
    expect(Evaluation.safeParse({ ...base, total: 120 }).success).toBe(false);
    expect(Evaluation.safeParse({ ...base, contentScore: 70.5 }).success).toBe(false);
  });
  it("impact 가 임의 문자열이면 거부한다", () => {
    expect(
      Evaluation.safeParse({ ...base, improvements: [{ ...base.improvements[0], impact: "URGENT" }] }).success,
    ).toBe(false);
  });
  it("정상 응답은 통과한다", () => {
    expect(Evaluation.safeParse(base).success).toBe(true);
  });
});

describe("실측 대비 모순 검사", () => {
  const report: EvaluationReport = {
    ...Evaluation.parse({
      url: facts().url, total: 70, breakdown,
      visualNotes: ["a"], uxNotes: ["b"], contentScore: 70, contentIssues: [],
      improvements: [{ title: "alt 채우기", impact: "HIGH", metric: "accessibility", problem: "alt 누락", fix: "alt 추가" }],
    }),
    measurements: measureSite(facts()).measurements,
    measuredScore: measureSite(facts()).score,
    measuredAt: new Date().toISOString(),
  };

  it("실측 60 미만인데 90 이상을 준 항목을 모순으로 센다", () => {
    const bad = contradictions(report);
    expect(bad.map((b) => b.metric)).toContain("accessibility");
  });

  it("실측이 낮지 않은 항목은 모순으로 세지 않는다", () => {
    const good = contradictions({ ...report, measurements: measureSite(facts({ missingAlt: 0 })).measurements });
    expect(good.some((b) => b.metric === "accessibility")).toBe(false);
  });
});
