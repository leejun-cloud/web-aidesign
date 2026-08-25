import { z } from "zod";

/** Motion Library (PRD §45~§49) — 사용자는 애니메이션 코드를 직접 쓰지 않는다 */
export const MotionSpeed = z.enum(["slow", "normal", "fast"]);
export const MotionIntensity = z.enum(["subtle", "medium", "strong"]);
export type MotionSpeed = z.infer<typeof MotionSpeed>;
export type MotionIntensity = z.infer<typeof MotionIntensity>;

export const MotionSettings = z.object({
  templateId: z.string(),
  speed: MotionSpeed.default("normal"),
  intensity: MotionIntensity.default("medium"),
});
export type MotionSettings = z.infer<typeof MotionSettings>;

export interface MotionTemplate {
  id: string;
  no: string;
  name: string;
  description: string;
  /** 이 모션이 자연스러운 섹션 */
  suits: string[];
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
  { id: "fade-up", no: "01", name: "Fade Up", description: "아래에서 부드럽게 올라오며 나타난다", suits: ["hero", "services", "features", "story", "cta"] },
  { id: "soft-reveal", no: "02", name: "Soft Reveal", description: "마스크가 걷히듯 서서히 드러난다", suits: ["hero", "story", "features"] },
  { id: "text-stagger", no: "03", name: "Text Stagger", description: "제목이 단어/줄 단위로 순차 등장한다", suits: ["hero", "cta", "story"] },
  { id: "image-reveal", no: "04", name: "Image Reveal", description: "이미지가 클립 마스크로 열리며 살짝 확대된다", suits: ["hero", "story", "features"] },
  { id: "hero-parallax", no: "05", name: "Hero Parallax", description: "스크롤에 따라 배경과 전경이 다른 속도로 움직인다", suits: ["hero"] },
  { id: "sticky-story", no: "06", name: "Sticky Story", description: "이미지가 고정된 채 텍스트가 이어 흐른다", suits: ["story", "features"] },
  { id: "horizontal-showcase", no: "07", name: "Horizontal Showcase", description: "가로로 스크롤되는 쇼케이스", suits: ["services", "features", "testimonials"] },
  { id: "card-hover", no: "08", name: "Card Hover", description: "카드가 살짝 떠오르며 그림자가 깊어진다", suits: ["services", "features", "testimonials"] },
  { id: "magnetic-button", no: "09", name: "Magnetic Button", description: "커서를 향해 버튼이 미세하게 끌린다", suits: ["hero", "cta", "header"] },
  { id: "counter-reveal", no: "10", name: "Counter Reveal", description: "숫자가 목표값까지 카운트업된다", suits: ["trust", "features"] },
  { id: "nav-transition", no: "11", name: "Navigation Transition", description: "스크롤에 따라 헤더가 압축·투명도 전환된다", suits: ["header"] },
  { id: "page-transition", no: "12", name: "Page Transition", description: "페이지 진입 시 오버레이가 걷힌다", suits: ["header", "hero"] },
];

/**
 * 내장 12종 + 외부에서 추출한 커스텀 Motion Template 중에서 찾는다.
 * extra 는 호출부(API 라우트)가 motionLibrary.ts 에서 미리 읽어 넘긴다 —
 * 이 파일은 순수/동기 모듈로 남기고 파일시스템 접근은 호출부 책임으로 둔다.
 */
export const findMotion = (id: string, extra: MotionTemplate[] = []) =>
  MOTION_TEMPLATES.find((t) => t.id === id) ?? extra.find((t) => t.id === id);

const DURATION: Record<MotionSpeed, number> = { slow: 1100, normal: 700, fast: 420 };
const DISTANCE: Record<MotionIntensity, number> = { subtle: 12, medium: 28, strong: 56 };

/** 숫자 단위 설정은 UI 에서 숨기고, 여기서 speed/intensity 를 실제 값으로 번역한다 (PRD §49) */
export function resolveMotion(settings: MotionSettings, extra: MotionTemplate[] = []) {
  const t = findMotion(settings.templateId, extra);
  if (!t) throw new Error(`알 수 없는 Motion 템플릿: ${settings.templateId}`);
  return {
    template: t,
    durationMs: DURATION[settings.speed],
    distancePx: DISTANCE[settings.intensity],
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  };
}

/** 선택 섹션에 이 모션을 적용하라는 지시문 — 다른 섹션은 건드리지 않는다 (PRD §48) */
export function motionInstruction(sectionId: string, settings: MotionSettings, extra: MotionTemplate[] = []) {
  const r = resolveMotion(settings, extra);
  return `## Motion 적용
- 대상 섹션: \`${sectionId}\` **하나뿐이다.** 다른 섹션의 모션이나 마크업은 절대 변경하지 않는다.
- 템플릿: ${r.template.no} ${r.template.name} — ${r.template.description}
- 지속시간 ${r.durationMs}ms, 이동/변화량 약 ${r.distancePx}px, easing \`${r.easing}\`
- 구현은 이 섹션 범위로 스코프된 인라인 \`<style>\`/\`<script>\` 로 하고, 전역 선택자를 쓰지 않는다.
- \`prefers-reduced-motion: reduce\` 에서는 애니메이션을 끄고 최종 상태를 즉시 보여준다.`;
}
