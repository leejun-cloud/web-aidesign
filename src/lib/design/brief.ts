import {
  AXES,
  AdvancedSimilarity,
  DesignBrief,
  LEVEL_PRESETS,
  PHOTO_PRESETS,
  PhotoSimilarity,
  type Axis,
  type BlendMode,
  type Reference,
  type RewriteLevel,
  type SimilarityLevel,
} from "@/lib/types";
import type { Note } from "@/lib/design/notes";

/** 축 값은 0~90 (PRD §9 — 100% 복제 금지) */
export function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(90, Math.max(0, Math.round(v)));
}

/** 레벨의 기본 프리셋 (고급 7축 + Photo Style) */
export function presetFor(level: SimilarityLevel): {
  advanced: AdvancedSimilarity;
  photo: PhotoSimilarity;
} {
  return { advanced: { ...LEVEL_PRESETS[level] }, photo: { ...PHOTO_PRESETS[level] } };
}

/**
 * 레벨 변경 시 슬라이더 병합.
 * 사용자가 직접 만진 축(dirtyAxes)은 현재 값을 유지하고, 나머지는 새 프리셋으로 갱신한다.
 */
export function mergeAdvanced(
  level: SimilarityLevel,
  dirtyAxes: Set<Axis>,
  current: AdvancedSimilarity,
): AdvancedSimilarity {
  const preset = LEVEL_PRESETS[level];
  const out = {} as AdvancedSimilarity;
  for (const axis of AXES) {
    out[axis] = clampAxis(dirtyAxes.has(axis) ? current[axis] : preset[axis]);
  }
  return out;
}

export interface BuildBriefInput {
  projectId: string;
  mode: "create" | "improve";
  references: Reference[];
  level: SimilarityLevel;
  advanced: AdvancedSimilarity;
  photo: PhotoSimilarity;
  blend?: BlendMode;
  existingUrl?: string;
  rewriteLevel?: RewriteLevel;
  brandBrief?: string;
  /** 단계별 자유 요청 — 빈 텍스트는 걸러낸다 */
  notes?: Note[];
}

function clampAll<T extends Record<string, number>>(o: T): T {
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(o)) out[k] = clampAxis(v);
  return out as T;
}

/** UI 상태 → 검증된 DesignBrief. Reference 2개면 blend 필수, 1개면 blend 제거. */
export function buildBrief(input: BuildBriefInput): DesignBrief {
  const twoRefs = input.references.length === 2;
  if (twoRefs && !input.blend) {
    throw new Error("Reference 가 2개면 조합 방식(blend)을 골라야 합니다");
  }
  return DesignBrief.parse({
    projectId: input.projectId,
    mode: input.mode,
    references: input.references,
    level: input.level,
    advanced: clampAll(input.advanced),
    photo: clampAll(input.photo),
    blend: twoRefs ? input.blend : undefined,
    existingUrl: input.existingUrl,
    rewriteLevel: input.rewriteLevel,
    brandBrief: input.brandBrief?.trim() ? input.brandBrief : undefined,
    notes: input.notes?.filter((n) => n.text.trim()).length
      ? input.notes.filter((n) => n.text.trim())
      : undefined,
  });
}
