import { z } from "zod";

/** PRD §53~§55 — 승인 HTML 을 다시 디자인하지 말고 Component 구조로 변환한다 */
export const Framework = z.enum(["nextjs", "react", "html", "vue", "nuxt", "astro"]);
export type Framework = z.infer<typeof Framework>;

export const ComponentPlan = z.object({
  /** 예: Hero.tsx */
  file: z.string().min(3),
  /** 대응하는 승인 HTML 의 data-vdna-id */
  sectionId: z.string().min(1),
  props: z.array(z.string()),
  notes: z.string(),
});
export type ComponentPlan = z.infer<typeof ComponentPlan>;

export const ProductionPlan = z.object({
  framework: Framework,
  components: z.array(ComponentPlan).min(1),
  tokenStrategy: z.string().min(4),
  responsiveStrategy: z.string().min(4),
});
export type ProductionPlan = z.infer<typeof ProductionPlan>;

/** 승인 HTML 의 모든 섹션이 컴포넌트로 매핑됐는지 확인한다 */
export function auditPlanCoverage(plan: ProductionPlan, sectionIds: string[]) {
  const mapped = new Set(plan.components.map((c) => c.sectionId));
  const missing = sectionIds.filter((id) => !mapped.has(id));
  const orphan = [...mapped].filter((id) => !sectionIds.includes(id));
  return { ok: missing.length === 0 && orphan.length === 0, missing, orphan };
}

/** Coding Agent 에게 넘기는 가장 중요한 지침 (PRD §54) */
export const PRODUCTION_DIRECTIVE = `## Production 전환 원칙 (가장 중요)
승인된 HTML 을 **참고하여 다시 디자인하지 마라.** 실제 Component 구조로 **변환**하라.

- 입력 자료의 우선순위: approved-preview.html > approved-desktop.png > approved-mobile.png > design-tokens.css > DESIGN.md
- DESIGN.md 만 보고 새로 디자인하는 것은 금지다. 수치는 승인 HTML 과 토큰에서 가져온다.
- 색상·간격·타이포는 design-tokens.css 를 그대로 가져와 CSS 변수로 유지한다. 값을 재해석하지 않는다.
- 승인 HTML 의 각 \`data-vdna-id\` 섹션이 정확히 하나의 컴포넌트가 된다. 섹션을 합치거나 쪼개지 않는다.
- 마크업 구조, 클래스 의미, 요소 순서, 반응형 분기점을 보존한다.
- "개선"하지 마라. 시각적 결과가 승인본과 픽셀 수준에서 일치하는 것이 목표다.
- 전환 후 Production 스크린샷과 승인 스크린샷을 비교해 Fidelity 를 확인한다.`;

/** PRD §57 — Drift 항목별 점수 */
export const FidelityBreakdown = z.object({
  layout: z.number().int().min(0).max(100),
  typography: z.number().int().min(0).max(100),
  spacing: z.number().int().min(0).max(100),
  images: z.number().int().min(0).max(100),
  components: z.number().int().min(0).max(100),
  color: z.number().int().min(0).max(100),
});
export type FidelityBreakdown = z.infer<typeof FidelityBreakdown>;

/** PRD §58 — Fidelity 가 낮으면 자동 수정 루프를 한 번 더 돈다 */
export const FIDELITY_TARGET = 90;
export const shouldAutoCorrect = (fidelity: number, attempt: number, maxAttempts = 2) =>
  fidelity < FIDELITY_TARGET && attempt < maxAttempts;
