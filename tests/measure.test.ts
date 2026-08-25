import { describe, expect, it } from "vitest";
import type { SiteFacts } from "@/lib/design/capture";
import { ctaFocus, headingStructure, imageAccessibility, measureSite, navSimplicity } from "@/lib/design/measure";

const base: SiteFacts = {
  url: "https://example.com",
  title: "Example",
  navLinks: [{ text: "About", href: "#" }, { text: "Programs", href: "#" }],
  headings: [{ level: 1, text: "H1" }, { level: 2, text: "H2" }],
  ctaTexts: ["후원하기", "더 알아보기"],
  imageCount: 4,
  oversizedImages: 0,
  missingAlt: 0,
  textSample: "",
  fonts: [],
  colors: [],
  loadMs: 1200,
};

describe("측정 가능 항목", () => {
  it("건강한 사이트는 높은 점수를 받는다", () => {
    const { score } = measureSite(base);
    expect(score).toBeGreaterThanOrEqual(95);
  });
  it("h1 이 3개면 감점한다", () => {
    const facts = { ...base, headings: [1, 1, 1].map((level) => ({ level, text: "x" })) };
    expect(headingStructure(facts).score).toBeLessThan(headingStructure(base).score);
    expect(headingStructure(facts).note).toContain("3개");
  });
  it("h1 이 없어도 감점한다", () => {
    expect(headingStructure({ ...base, headings: [{ level: 2, text: "x" }] }).score).toBeLessThan(100);
  });
  it("메뉴 12개는 감점하고 정리를 권한다", () => {
    const facts = { ...base, navLinks: Array.from({ length: 12 }, (_, i) => ({ text: `M${i}`, href: "#" })) };
    const m = navSimplicity(facts);
    expect(m.score).toBeLessThan(70);
    expect(m.note).toContain("메뉴가 많다");
  });
  it("CTA 문구가 20종으로 분산되면 감점한다", () => {
    const facts = { ...base, ctaTexts: Array.from({ length: 20 }, (_, i) => `행동 ${i}`) };
    expect(ctaFocus(facts).score).toBeLessThan(50);
  });
  it("같은 CTA 문구 반복은 분산으로 보지 않는다", () => {
    const facts = { ...base, ctaTexts: Array.from({ length: 20 }, () => "후원하기") };
    expect(ctaFocus(facts).score).toBe(100);
  });
  it("alt 누락 비율을 그대로 반영한다", () => {
    expect(imageAccessibility({ ...base, imageCount: 4, missingAlt: 2 }).score).toBe(50);
  });
  it("점수는 항상 0~100 안에 있다", () => {
    const worst: SiteFacts = {
      ...base, navLinks: Array.from({ length: 60 }, (_, i) => ({ text: `M${i}`, href: "#" })),
      headings: [], ctaTexts: Array.from({ length: 60 }, (_, i) => `c${i}`),
      imageCount: 50, missingAlt: 50, oversizedImages: 50, loadMs: 30000,
    };
    for (const m of measureSite(worst).measurements) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });
});
