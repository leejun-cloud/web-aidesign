import { z } from "zod";
import type { Measurement } from "@/lib/design/measure";

const score100 = z.number().int().min(0).max(100);

/** PRD §30 — Website Quality Score 세부 항목 */
export const ScoreBreakdown = z.object({
  visualDesign: score100,
  visualHierarchy: score100,
  typography: score100,
  brandConsistency: score100,
  navigation: score100,
  contentClarity: score100,
  conversion: score100,
  mobileUx: score100,
  accessibility: score100,
  performance: score100,
  motionQuality: score100,
  trust: score100,
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

export const Impact = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type Impact = z.infer<typeof Impact>;

/** PRD §32, §33, §68 — 점수만 보여주지 않고 바로 작업으로 변환한다 */
export const Improvement = z.object({
  title: z.string().min(2),
  impact: Impact,
  /** 어느 점수 항목을 끌어올리는가 */
  metric: z.string(),
  /** 어느 섹션을 수정해야 하는가 — Preview 에서 자동 선택에 쓰인다 */
  sectionId: z.string().optional(),
  problem: z.string().min(4),
  fix: z.string().min(4),
});
export type Improvement = z.infer<typeof Improvement>;

/** PRD §31 — 평가 출처를 세 갈래로 분리해 보관한다 */
export const Evaluation = z.object({
  url: z.string(),
  total: score100,
  breakdown: ScoreBreakdown,
  /** AI Visual Evaluation 근거 */
  visualNotes: z.array(z.string()).min(1),
  /** UX Heuristic 근거 */
  uxNotes: z.array(z.string()).min(1),
  /** PRD §67 콘텐츠 구조 평가 */
  contentScore: score100,
  contentIssues: z.array(z.string()),
  improvements: z.array(Improvement).min(1),
});
export type Evaluation = z.infer<typeof Evaluation>;

/** 측정 실측치 + AI 평가를 합친 최종 리포트 */
export interface EvaluationReport extends Evaluation {
  measurements: Measurement[];
  measuredScore: number;
  measuredAt: string;
}

const IMPACT_RANK: Record<Impact, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** PRD §32 — Impact 우선, 동급이면 점수가 낮은 항목부터 */
export function prioritize(improvements: Improvement[], breakdown: ScoreBreakdown): Improvement[] {
  const scoreOf = (metric: string) => {
    const key = Object.keys(breakdown).find((k) => k.toLowerCase() === metric.toLowerCase());
    return key ? breakdown[key as keyof ScoreBreakdown] : 50;
  };
  return [...improvements].sort(
    (a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || scoreOf(a.metric) - scoreOf(b.metric),
  );
}

/** PRD §37, §38 — Reference 와의 축별 유사도와 Gap */
export const SimilarityReport = z.object({
  overall: score100,
  axes: z.object({
    layout: score100,
    typography: score100,
    photography: score100,
    color: score100,
    components: score100,
    spacing: score100,
    motion: score100,
  }),
});
export type SimilarityReport = z.infer<typeof SimilarityReport>;

export interface Gap {
  axis: string;
  ours: number;
  reference: number;
  delta: number;
}

/** 우리 점수와 Reference 점수의 축별 차이를 큰 것부터 (PRD §38) */
export function gapAnalysis(
  ours: Record<string, number>,
  reference: Record<string, number>,
): Gap[] {
  return Object.keys(ours)
    .filter((axis) => axis in reference)
    .map((axis) => ({ axis, ours: ours[axis], reference: reference[axis], delta: ours[axis] - reference[axis] }))
    .sort((a, b) => a.delta - b.delta);
}

/** 재평가 이력 (PRD §34) */
export interface ScoreHistoryEntry {
  at: string;
  total: number;
  label: string;
}

export function scoreTrend(history: ScoreHistoryEntry[]): { improved: boolean; delta: number } {
  if (history.length < 2) return { improved: false, delta: 0 };
  const delta = history[history.length - 1].total - history[0].total;
  return { improved: delta > 0, delta };
}
