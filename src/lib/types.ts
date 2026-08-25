import { z } from "zod";

/**
 * 유사도 5단계.
 * PRD §7 은 3단계였으나 "느낌만"과 "비슷하게" 사이, "비슷하게"와 "매우 비슷하게" 사이의
 * 간격이 커서 중간값을 원하는 요구가 많았다. 상한 90 은 그대로 — 100% 복제는 제공하지 않는다.
 */
export const SimilarityLevel = z.enum(["hint", "feel", "similar", "close", "very"]);
export type SimilarityLevel = z.infer<typeof SimilarityLevel>;

/** 고급 유사도 축 (PRD §9) — 범위 0~90, 100% 복제 모드는 제공하지 않는다 */
export const AXES = [
  "layout",
  "photography",
  "typography",
  "color",
  "components",
  "spacing",
  "motion",
] as const;
export type Axis = (typeof AXES)[number];

const axisScore = z.number().int().min(0).max(90);

export const AdvancedSimilarity = z.object({
  layout: axisScore,
  photography: axisScore,
  typography: axisScore,
  color: axisScore,
  components: axisScore,
  spacing: axisScore,
  motion: axisScore,
});
export type AdvancedSimilarity = z.infer<typeof AdvancedSimilarity>;

/** PRD §11 Advanced Photography Settings */
export const PhotoSimilarity = z.object({
  composition: axisScore,
  lighting: axisScore,
  colorGrading: axisScore,
  cameraAngle: axisScore,
  depthOfField: axisScore,
  humanPose: axisScore,
  texture: axisScore,
});
export type PhotoSimilarity = z.infer<typeof PhotoSimilarity>;

/** PRD §7 기본 레벨 → 고급 축 기본값 매핑 */
export const LEVEL_PRESETS: Record<SimilarityLevel, AdvancedSimilarity> = {
  hint:    { layout: 15, photography: 20, typography: 15, color: 25, components: 10, spacing: 15, motion: 10 },
  feel:    { layout: 30, photography: 35, typography: 30, color: 40, components: 25, spacing: 30, motion: 25 },
  similar: { layout: 60, photography: 65, typography: 45, color: 45, components: 50, spacing: 60, motion: 40 },
  close:   { layout: 80, photography: 85, typography: 60, color: 50, components: 70, spacing: 80, motion: 55 },
  very:    { layout: 90, photography: 90, typography: 85, color: 80, components: 85, spacing: 90, motion: 80 },
};

export const PHOTO_PRESETS: Record<SimilarityLevel, PhotoSimilarity> = {
  hint:    { composition: 15, lighting: 20, colorGrading: 20, cameraAngle: 10, depthOfField: 15, humanPose: 10, texture: 15 },
  feel:    { composition: 30, lighting: 40, colorGrading: 40, cameraAngle: 25, depthOfField: 30, humanPose: 20, texture: 30 },
  similar: { composition: 55, lighting: 65, colorGrading: 60, cameraAngle: 40, depthOfField: 50, humanPose: 30, texture: 50 },
  close:   { composition: 80, lighting: 90, colorGrading: 85, cameraAngle: 60, depthOfField: 75, humanPose: 50, texture: 70 },
  very:    { composition: 90, lighting: 90, colorGrading: 90, cameraAngle: 85, depthOfField: 85, humanPose: 70, texture: 85 },
};

/** UI 라벨과 설명 — 화면마다 다시 쓰지 않도록 한 곳에 둔다 */
export const LEVEL_LABELS: Record<SimilarityLevel, { label: string; hint: string }> = {
  hint:    { label: "살짝만",       hint: "색온도와 분위기 정도만 빌려옵니다" },
  feel:    { label: "느낌만",       hint: "시각적 방향과 디자인 철학을 참고합니다" },
  similar: { label: "비슷하게",     hint: "레이아웃과 타이포를 참고하되 구조는 새로 만듭니다" },
  close:   { label: "많이 비슷하게", hint: "섹션 리듬·여백·컴포넌트 성격까지 적극 참고합니다" },
  very:    { label: "매우 비슷하게", hint: "Hero 비율과 콘텐츠 배치까지 강하게 참고합니다" },
};

/** 라디오 렌더 순서 */
export const LEVEL_ORDER: SimilarityLevel[] = ["hint", "feel", "similar", "close", "very"];

/** Reference 입력 (PRD §5) */
export const Reference = z.object({
  id: z.string(),
  kind: z.enum(["url", "screenshot", "template"]),
  /** kind=url 이면 URL, screenshot 이면 workspace 상대 경로, template 이면 template id */
  value: z.string().min(1),
  /** 캡처 완료 후 채워지는 데스크톱/모바일 스크린샷 경로 */
  desktopShot: z.string().optional(),
  mobileShot: z.string().optional(),
});
export type Reference = z.infer<typeof Reference>;

/** Reference 2개 조합 모드 (PRD §8) */
export const BlendMode = z.enum(["a-structure-b-style", "a-lead", "b-lead"]);
export type BlendMode = z.infer<typeof BlendMode>;

/** 첨부 이미지 역할 (PRD §19) */
export const ImageRole = z.enum(["overall", "layout", "photo", "typography", "motion"]);
export type ImageRole = z.infer<typeof ImageRole>;

/** 기존 콘텐츠 Rewrite 강도 (PRD §27) */
export const RewriteLevel = z.enum(["keep", "clarify", "rewrite"]);
export type RewriteLevel = z.infer<typeof RewriteLevel>;

/** 디자인 생성 요청 — Step 1 UI가 조립해 Step 3 생성기로 넘기는 계약 */
export const DesignBrief = z.object({
  projectId: z.string(),
  mode: z.enum(["create", "improve"]),
  references: z.array(Reference).min(1).max(2),
  level: SimilarityLevel,
  advanced: AdvancedSimilarity,
  photo: PhotoSimilarity,
  blend: BlendMode.optional(),
  /** mode=improve 일 때 개선 대상 사이트 */
  existingUrl: z.string().url().optional(),
  rewriteLevel: RewriteLevel.optional(),
  brandBrief: z.string().max(4000).optional(),
  /** 단계별로 사용자가 직접 남긴 자유 요청 (src/lib/design/notes.ts) */
  notes: z
    .array(
      z.object({
        stage: z.enum(["design", "content", "analysis", "evaluate", "production"]),
        text: z.string().min(1).max(4000),
        at: z.string(),
      }),
    )
    .max(20)
    .optional(),
});
export type DesignBrief = z.infer<typeof DesignBrief>;

/** Visual DNA (PRD §12, §52) */
export const VisualDna = z.object({
  mood: z.array(z.string()).min(1),
  layout: z.object({
    heroStructure: z.string(),
    grid: z.string(),
    containerWidth: z.string(),
    sectionOrder: z.array(z.string()),
    contentAlignment: z.string(),
    imagePlacement: z.string(),
    header: z.string(),
  }),
  typography: z.object({
    fontPersonality: z.string(),
    headingScale: z.string(),
    weight: z.string(),
    lineHeight: z.string(),
    letterSpacing: z.string(),
    hierarchy: z.string(),
  }),
  color: z.object({
    background: z.string(),
    surface: z.string(),
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    text: z.string(),
    saturation: z.string(),
    temperature: z.string(),
  }),
  photography: z.object({
    composition: z.string(),
    lighting: z.string(),
    colorGrading: z.string(),
    cameraAngle: z.string(),
    depthOfField: z.string(),
    humanPose: z.string(),
    environment: z.string(),
    texture: z.string(),
    imageRatio: z.string(),
  }),
  components: z.object({
    buttons: z.string(),
    cards: z.string(),
    forms: z.string(),
    navigation: z.string(),
    border: z.string(),
    radius: z.string(),
    shadow: z.string(),
  }),
  spacing: z.object({
    sectionGap: z.string(),
    containerPadding: z.string(),
    cardPadding: z.string(),
    contentGap: z.string(),
    heroWhitespace: z.string(),
  }),
  motion: z.object({
    fade: z.string(),
    reveal: z.string(),
    scroll: z.string(),
    hover: z.string(),
    transition: z.string(),
  }),
});
export type VisualDna = z.infer<typeof VisualDna>;

/** 표준 섹션 식별자 (PRD §15, §64) */
export const SECTION_IDS = [
  "header",
  "hero",
  "trust",
  "services",
  "story",
  "features",
  "testimonials",
  "cta",
  "footer",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];
