import { SECTION_IDS } from "@/lib/types";

/**
 * HTML Preview 생성기가 지켜야 하는 하드 제약 (PRD §13, §64).
 * Design Generator 프롬프트에 그대로 실어 보낸다.
 */
export const GENERATION_RULES = `## 산출물 하드 제약
- 결과는 **단일 HTML 파일 하나**다. 외부 CSS/JS 파일, 빌드 도구, 프레임워크를 쓰지 않는다.
- HTML / CSS / Responsive CSS / 기본 JavaScript / hover / motion 을 모두 이 한 파일 안에 인라인으로 담는다.
- CDN 스크립트나 외부 스타일시트를 로드하지 않는다. 웹폰트는 시스템 폰트 스택으로 대체한다.
- 이미지는 실제 사진이 필요한 자리에 \`https://images.unsplash.com/...\` 같은 외부 URL 대신
  \`<img>\` + CSS gradient/색면 플레이스홀더를 쓰되, \`alt\` 를 반드시 채우고 의도한 사진의 성격을 alt 에 기술한다.
- 색상·간격·타이포는 \`:root\` 의 CSS 커스텀 프로퍼티로 선언하고 그 변수만 참조한다. (design-tokens.css 추출 가능해야 한다)
- **색상 리터럴(\`#rrggbb\`, \`rgb()\`, \`hsl()\`)은 \`:root\` 안에서만 등장한다.** 그라데이션 정지점, 아이콘/일러스트 장식 색,
  그림자 색, 반투명 오버레이도 예외가 아니다 — 필요한 만큼 토큰을 더 선언하고 사용처는 \`var(--...)\` 로만 쓴다.
- 모바일 우선. 최소 \`390px\` / \`834px\` / \`1440px\` 에서 깨지지 않아야 한다.
- 접근성: 논리적 heading 계층(h1 은 정확히 1개), 본문 대비 4.5:1 이상, 인터랙티브 요소에 접근 가능한 이름.

## 섹션 식별자 (필수)
- 모든 주요 섹션의 최상위 요소에 \`data-vdna-id="..."\` 를 정확히 하나 붙인다.
- 허용 값은 다음뿐이다: ${SECTION_IDS.join(", ")}
- 같은 id 를 두 번 쓰지 않는다. \`header\`, \`hero\`, \`footer\` 는 반드시 포함한다.
- 그 외의 id 를 발명하지 않는다.

## 저작권 경계
- Reference 의 로고, 브랜드 고유 그래픽, 저작권 이미지, 고유 텍스트, 특정 사이트만의 독창적 표현은 복제하지 않는다.
- 재현하는 것은 레이아웃 리듬·비율·타이포 위계·색 온도·컴포넌트 성격 같은 **디자인 특성**뿐이다.

## 출력 형식
- 설명·머리말 없이 \`<!doctype html>\` 로 시작하는 완전한 HTML 문서만 출력한다.`;

/** 유사도 축 점수를 생성 프롬프트용 지시문으로 변환 */
export function similarityInstruction(advanced: Record<string, number>): string {
  const label = (v: number) =>
    v >= 80 ? "강하게 참고" : v >= 55 ? "적극 참고" : v >= 35 ? "분위기만 참고" : "거의 참고하지 않음";
  const lines = Object.entries(advanced).map(([axis, v]) => `- ${axis}: ${v}/90 → ${label(v)}`);
  return `## 축별 참고 강도 (0~90, 100% 복제는 금지)\n${lines.join("\n")}`;
}
