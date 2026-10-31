import { runAgentJson } from "@/lib/ai/cli";
import { referenceShots } from "@/lib/design/reference";
import { AXES, VisualDna, type AdvancedSimilarity, type BlendMode, type Reference } from "@/lib/types";

export interface AnalyzeOpts {
  advanced: AdvancedSimilarity;
  blend?: BlendMode;
  brandBrief?: string;
  model?: string;
}

/** PRD §7 Level 3 단서 — 저작권 경계. 어떤 프롬프트에도 항상 포함된다. */
export const COPYRIGHT_GUARD = `## 저작권 경계 (반드시 준수)
- 로고, 브랜드 고유 그래픽/아이콘, 저작권 있는 사진, 고유 문안(카피)은 기술하거나 복제하지 않는다.
- 특정 사이트만의 독창적 표현(고유 일러스트, 시그니처 그래픽, 상표성 모티프)은 재현 대상이 아니다.
- 오직 재현 가능한 '디자인 특성'(구조, 비율, 리듬, 색 관계, 사진의 촬영 특성, 컴포넌트 형태)만 기술한다.
- 어떤 축도 100% 복제하지 않는다. 점수는 0~90 범위이며 참고 강도일 뿐이다.`;

/** PRD §10 분석 축 지시문 */
const AXIS_SPEC = `## 분석 축 (각 하위 항목을 빠짐없이 채운다)
- Layout: heroStructure, grid, containerWidth, sectionOrder, contentAlignment, imagePlacement, header
- Photography: composition, lighting, colorGrading, cameraAngle, depthOfField, humanPose, environment, texture, imageRatio
- Typography: fontPersonality, headingScale, weight, lineHeight, letterSpacing, hierarchy
- Color: background, surface, primary, secondary, accent, text, saturation, temperature
- Components: buttons, cards, forms, navigation, border, radius, shadow
- Spacing: sectionGap, containerPadding, cardPadding, contentGap, heroWhitespace
- Motion: fade, reveal, scroll, hover, transition
- mood: 사이트 전체 분위기를 나타내는 형용사 3~6개 배열

배열 타입은 mood 와 layout.sectionOrder 두 개뿐이다. layout.sectionOrder 는 위에서 아래 순서의 섹션 이름 문자열 배열(예: ["header","hero","features"])이며 절대 하나의 문자열로 합치지 않는다. 나머지 모든 값은 문자열이다.`;

const COLOR_RULE = `## color 규칙
color 의 background/surface/primary/secondary/accent/text 는 스크린샷 픽셀에서 실제로 읽어낸 값을 \`#RRGGBB\` hex 로 적는다. 추측한 색 이름("파란색")이나 CSS 변수명은 쓰지 않는다. saturation/temperature 만 서술형으로 적는다.`;

const BLEND_TEXT: Record<BlendMode, string> = {
  "a-structure-b-style":
    "Reference A 의 구조를 따르고 B 의 스타일을 입힌다: layout / spacing / components 는 A 에서 추출하고, photography / color / typography / motion 은 B 에서 추출한다.",
  "a-lead":
    "Reference A 를 주도(lead)로 삼아 모든 축을 A 기준으로 추출하고, B 는 보조 힌트로만 참고해 미세하게 반영한다.",
  "b-lead":
    "Reference B 를 주도(lead)로 삼아 모든 축을 B 기준으로 추출하고, A 는 보조 힌트로만 참고해 미세하게 반영한다.",
};

function advancedBlock(advanced: AdvancedSimilarity) {
  const lines = AXES.map((a) => `- ${a}: ${advanced[a]} / 90`).join("\n");
  return `## 축별 참고 강도 (0~90, 100% 복제 금지)\n각 축을 아래 강도만큼만 참고해 기술한다. 점수가 낮은 축은 느낌만, 높은 축은 구체적으로 기술한다.\n${lines}`;
}

/** 순수 함수 — 테스트에서 직접 검증한다 */
export function buildVisualDnaPrompt(refs: Reference[], opts: AnalyzeOpts): string {
  const refList = refs
    .map((r, i) => {
      const label = String.fromCharCode(65 + i);
      const shots = referenceShots(r).join(", ") || "(스크린샷 없음)";
      return `- Reference ${label}: kind=${r.kind}, value=${r.value}, 스크린샷=${shots}`;
    })
    .join("\n");

  const blend =
    refs.length >= 2 && opts.blend
      ? `## 조합 모드: ${opts.blend}\n${BLEND_TEXT[opts.blend]}`
      : refs.length >= 2
        ? "## 조합 모드: 지정 없음\n두 Reference 의 공통 디자인 특성을 종합해 하나의 Visual DNA 로 통합한다."
        : "";

  return [
    "당신은 Design Analyzer 다. 첨부된 웹사이트 스크린샷을 보고 재현 가능한 Visual DNA 를 구조화 JSON 으로 추출한다.",
    `## 대상 Reference\n${refList}`,
    blend,
    AXIS_SPEC,
    COLOR_RULE,
    advancedBlock(opts.advanced),
    opts.brandBrief ? `## 브랜드 브리프 (해석의 맥락)\n${opts.brandBrief}` : "",
    COPYRIGHT_GUARD,
    "각 값은 다른 디자이너가 코드로 재현할 수 있을 만큼 구체적인 한 문장 또는 수치로 적는다.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PRD §12, §52 — 스크린샷에서 Visual DNA 추출 */
export async function analyzeReference(refs: Reference[], opts: AnalyzeOpts): Promise<VisualDna> {
  if (!refs.length) throw new Error("Reference 가 없습니다");
  const images = refs.flatMap(referenceShots);
  if (!images.length) throw new Error("분석할 스크린샷이 없습니다 — resolveReference 를 먼저 실행하세요");

  return runAgentJson(VisualDna, {
    prompt: buildVisualDnaPrompt(refs, opts),
    images,
    model: opts.model,
  });
}
