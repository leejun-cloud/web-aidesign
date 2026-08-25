import { z } from "zod";
import { runAgentJson } from "@/lib/ai/cli";

/**
 * 외부 모션 쇼케이스 사이트(예 motionsites.ai)에서 모션 **특성**만 추출한다.
 * PRD §43 의 Reference Template 원칙(원본 코드·자산을 저장하지 않고 재현 가능한
 * 특성만 뽑는다)을 모션에 그대로 적용한 것 — 실제 CSS/JS/타임라인 코드를 베끼지 않고,
 * "이런 종류의 움직임이다"라는 서술만 자산화한다.
 */
export const MotionDna = z.object({
  /** 무엇이 이 모션을 일으키는가 */
  trigger: z.enum(["scroll", "hover", "load", "click"]),
  /** 체감 타이밍 성격 — 초 단위 숫자가 아니라 느낌으로 서술한다 */
  timingFeel: z.string().min(4),
  /** 여러 요소가 있다면 등장 순서/구성 방식 */
  choreography: z.string().min(4),
  /** easing 의 느낌 (예: 탄성 있는, 관성이 큰, 딱딱 끊기는) */
  easingFeel: z.string().min(2),
  /** 이 모션이 적용되는 대상 요소의 성격 (텍스트/이미지/카드/버튼 등) */
  targetElements: z.array(z.string()).min(1),
  /** 전반적 강도 인상 */
  intensity: z.enum(["subtle", "medium", "strong"]),
  /** 이 모션이 주는 전체적 무드 */
  mood: z.array(z.string()).min(1),
  /** 한 문단 서술 — Motion 라이브러리 카드 설명으로 쓰인다 */
  description: z.string().min(10),
  /** 어떤 섹션 성격에 잘 맞는지 */
  suits: z.array(z.string()).min(1),
});
export type MotionDna = z.infer<typeof MotionDna>;

/** 실제 코드를 만들거나 베끼지 못하게 못박는 경계 — Reference Template 가드레일과 같은 원칙 */
export const MOTION_EXTRACTION_GUARDRAIL = `## 모션 추출 원칙
- 스크린샷에서 관찰되는 모션의 **성격**만 서술한다. 실제 CSS 애니메이션 코드, JS 타이밍 함수,
  라이브러리 이름(GSAP, Framer Motion 등)을 추측해 적지 않는다 — 우리는 그 사이트의 코드를
  본 적이 없고, 여러 장의 정지 스크린샷에서 움직임의 인상만 추론한다.
- 이 사이트 고유의 브랜드 요소(로고 애니메이션, 고유 일러스트 모션)를 그대로 재현하라고
  지시하지 않는다. 재사용 가능한 **모션의 패턴**(등장 방식·타이밍 인상·강도)만 뽑는다.
- 실제로 확인할 수 없는 트리거(스크롤인지 호버인지)는 화면 구성상 가장 개연성 있는 것으로
  추정하되, 추정임을 서술에서 감추지 않는다.`;

/**
 * 순수 함수 — 여러 시점의 스크린샷(스크롤 전/중/후 등)을 보고 모션 특성을 추출하는 프롬프트.
 * shots 이 1장뿐이면(정적 캡처 한계) 그 사실을 프롬프트에서 인정하고 레이아웃 근거로
 * 개연성 있는 모션을 추론하게 한다.
 */
export function buildMotionExtractionPrompt(args: { url: string; shots: number }): string {
  return `너는 Motion Analyzer 다. 아래 웹사이트에서 사용되고 있을 법한 모션의 **성격**을 분석해 구조화된 JSON 으로 만든다.

## 대상
${args.url}

## 제공된 자료
${args.shots}장의 스크린샷 (${args.shots > 1 ? "서로 다른 스크롤 위치/상태" : "단일 스크롤 위치"}).
${args.shots === 1 ? "스크린샷이 한 장뿐이라 실제 애니메이션 진행은 보이지 않는다. 레이아웃 구성(마스크·오버레이·초기 위치로 보이는 여백·카드 그림자 등)에서 개연성 있는 모션을 추론하고, 그것이 추정이라는 것을 description 에 명시하라." : ""}

${MOTION_EXTRACTION_GUARDRAIL}

## 분석 지침
- trigger: 이 사이트의 히어로/섹션 진입 방식으로 보아 스크롤/호버/로드/클릭 중 가장 유력한 것.
- timingFeel: "느리고 여유로운", "빠르고 경쾌한" 처럼 체감 표현으로. 초 단위 숫자를 만들어내지 마라.
- choreography: 여러 요소가 순차 등장하는지, 한 번에 나타나는지, 무엇이 먼저인지.
- easingFeel: 관성/탄성/각지음 등 느낌으로.
- targetElements: 이 모션이 실제로 걸릴 법한 요소 종류(제목 텍스트, 카드, 이미지, 버튼 등).
- intensity: subtle(거의 안 보이는) / medium / strong(과감한) 중 하나.
- suits: header, hero, trust, services, story, features, testimonials, cta, footer 중 이 모션이 자연스러운 것들.
- description: 한 문단, Motion 라이브러리 카드에 그대로 노출될 설명. 추정 근거를 짧게 포함한다.

JSON 만 출력하라.`;
}

/** 실제로 사이트를 캡처해 Motion DNA 를 추출한다 (호출부에서 캡처를 마친 스크린샷 경로를 넘긴다) */
export async function extractMotionDna(args: {
  url: string;
  shots: string[];
  model?: string;
}): Promise<MotionDna> {
  return runAgentJson(MotionDna, {
    prompt: buildMotionExtractionPrompt({ url: args.url, shots: args.shots.length }),
    images: args.shots,
    model: args.model,
  });
}
