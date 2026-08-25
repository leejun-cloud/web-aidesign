import { describe, expect, it } from "vitest";
import { REFERENCE_TEMPLATE_GUARDRAIL, TEMPLATE_FILES, auditTemplateFiles } from "@/lib/design/template";
import {
  FIDELITY_TARGET, PRODUCTION_DIRECTIVE, ProductionPlan,
  auditPlanCoverage, shouldAutoCorrect,
} from "@/lib/design/production";

describe("Template 자산 (PRD §41, §43)", () => {
  it("PRD §41 의 8개 파일을 요구한다", () => {
    expect(TEMPLATE_FILES).toHaveLength(8);
    expect(auditTemplateFiles([...TEMPLATE_FILES]).ok).toBe(true);
  });
  it("빠진 파일을 알려준다", () => {
    const a = auditTemplateFiles(["preview.html", "DESIGN.md"]);
    expect(a.ok).toBe(false);
    expect(a.missing).toContain("photo-dna.json");
  });
  it("경로가 섞여 들어와도 파일명으로 판단한다", () => {
    expect(auditTemplateFiles(TEMPLATE_FILES.map((f) => `/tmp/t/${f}`)).ok).toBe(true);
  });
  it("외부 사이트 복제 금지를 명시한다", () => {
    expect(REFERENCE_TEMPLATE_GUARDRAIL).toContain("복제하지 않는다");
    expect(REFERENCE_TEMPLATE_GUARDRAIL).toContain("새로 생성한 디자인");
  });
});

describe("Production 전환 (PRD §54, §58)", () => {
  it("재디자인 금지와 자료 우선순위를 못박는다", () => {
    expect(PRODUCTION_DIRECTIVE).toContain("다시 디자인하지 마라");
    expect(PRODUCTION_DIRECTIVE).toContain("approved-preview.html");
    expect(PRODUCTION_DIRECTIVE).toContain("design-tokens.css");
  });

  const plan = ProductionPlan.parse({
    framework: "nextjs",
    components: [
      { file: "Header.tsx", sectionId: "header", props: [], notes: "" },
      { file: "Hero.tsx", sectionId: "hero", props: ["headline"], notes: "" },
      { file: "Footer.tsx", sectionId: "footer", props: [], notes: "" },
    ],
    tokenStrategy: "design-tokens.css 를 globals.css 에 그대로 import",
    responsiveStrategy: "승인 HTML 의 브레이크포인트 유지",
  });

  it("모든 섹션이 컴포넌트로 매핑되면 통과한다", () => {
    expect(auditPlanCoverage(plan, ["header", "hero", "footer"]).ok).toBe(true);
  });
  it("매핑 누락 섹션을 잡아낸다", () => {
    expect(auditPlanCoverage(plan, ["header", "hero", "cta", "footer"]).missing).toEqual(["cta"]);
  });
  it("승인본에 없는 섹션을 만들어낸 계획을 잡아낸다", () => {
    expect(auditPlanCoverage(plan, ["header", "hero"]).orphan).toEqual(["footer"]);
  });
  it("Fidelity 90 미만이면 최대 2회까지 자동 수정한다", () => {
    expect(shouldAutoCorrect(84, 0)).toBe(true);
    expect(shouldAutoCorrect(84, 1)).toBe(true);
    expect(shouldAutoCorrect(84, 2)).toBe(false);
    expect(shouldAutoCorrect(FIDELITY_TARGET, 0)).toBe(false);
  });
});
