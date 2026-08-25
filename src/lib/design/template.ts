import { z } from "zod";
import { SimilarityLevel, VisualDna } from "@/lib/types";
import { MotionSettings } from "@/lib/design/motion";

/** PRD §50 — Photo DNA 를 별도 자산으로 뽑아 재사용한다 */
export const PhotoDna = z.object({
  name: z.string().min(1),
  traits: z.array(z.string()).min(3),
  lighting: z.string(),
  grading: z.string(),
  subject: z.string(),
  depthOfField: z.string(),
});
export type PhotoDna = z.infer<typeof PhotoDna>;

/** PRD §41, §52 — 하나의 Template 은 7개 DNA 로 구성된다 */
export const DesignTemplate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 내가 만든 디자인인가, 외부 사이트에서 추출한 Reference Template 인가 (PRD §40, §43) */
  origin: z.enum(["mine", "reference"]),
  /** origin=reference 일 때 추출 출처 — 복제가 아니라 특성 추출임을 기록으로 남긴다 */
  sourceUrl: z.string().optional(),
  createdAt: z.string(),
  visualDna: VisualDna,
  photoDna: PhotoDna,
  motion: z.array(MotionSettings),
  /** 재사용 시 기본 유사도 (PRD §44) */
  defaultLevel: SimilarityLevel,
});
export type DesignTemplate = z.infer<typeof DesignTemplate>;

/** PRD §41 — Template 디렉터리에 반드시 있어야 하는 파일 */
export const TEMPLATE_FILES = [
  "preview.html",
  "preview-desktop.png",
  "preview-mobile.png",
  "DESIGN.md",
  "design-tokens.css",
  "visual-dna.json",
  "photo-dna.json",
  "motion.json",
] as const;

export function auditTemplateFiles(present: string[]): { ok: boolean; missing: string[] } {
  const set = new Set(present.map((p) => p.split("/").pop() ?? p));
  const missing = TEMPLATE_FILES.filter((f) => !set.has(f));
  return { ok: missing.length === 0, missing };
}

/** PRD §43 — 외부 사이트를 그대로 저장하는 것이 아니라 특성을 추출한다 */
export const REFERENCE_TEMPLATE_GUARDRAIL = `## 외부 사이트 → Reference Template 원칙
- 원본 사이트의 HTML, CSS, 이미지, 텍스트, 로고를 저장하거나 복제하지 않는다.
- 저장하는 것은 재현 가능한 디자인 특성(Visual DNA / Photo DNA / Motion DNA)뿐이다.
- Template 의 preview.html 은 원본 마크업이 아니라 **새로 생성한 디자인**이다.
- sourceUrl 은 출처 기록용이며, 결과물이 원본을 대체하도록 만들지 않는다.`;
