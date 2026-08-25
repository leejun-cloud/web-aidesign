import { z } from "zod";

/**
 * 사용자가 각 단계에서 자유롭게 남기는 요청·맥락.
 *
 * 폼 항목으로는 담을 수 없는 것들이 실제 작업의 절반이다 —
 * "우리는 병원이라 과장된 표현을 못 쓴다", "후원 버튼이 제일 중요하다",
 * "이 사진은 저작권 때문에 못 쓴다" 같은 것들. 이걸 받아 프롬프트에 실어 보낸다.
 */
export const NoteStage = z.enum([
  "design",   // 디자인 생성·수정 전반
  "content",  // 콘텐츠·문구
  "analysis", // 기존 사이트 분석
  "evaluate", // 평가 기준
  "production", // Production 전환
]);
export type NoteStage = z.infer<typeof NoteStage>;

export const Note = z.object({
  stage: NoteStage,
  text: z.string().min(1).max(4000),
  at: z.string(),
});
export type Note = z.infer<typeof Note>;

export const STAGE_LABELS: Record<NoteStage, { label: string; placeholder: string }> = {
  design: {
    label: "디자인 요청",
    placeholder:
      "예: 파란색 계열은 피해주세요. 첫 화면에 후원 버튼이 꼭 보여야 합니다. 사진은 인물보다 현장 위주로.",
  },
  content: {
    label: "문구 요청",
    placeholder:
      "예: 우리는 의료기관이라 '최고', '완치' 같은 표현을 쓸 수 없습니다. 기관명은 반드시 '○○의료재단' 으로.",
  },
  analysis: {
    label: "분석할 때 참고할 점",
    placeholder:
      "예: 게시판은 곧 없앨 예정입니다. 해외사업이 실제로는 가장 중요한 사업입니다.",
  },
  evaluate: {
    label: "평가 기준에 반영할 점",
    placeholder: "예: 주 방문자는 50대 이상입니다. 모바일 비중이 80% 입니다.",
  },
  production: {
    label: "개발 시 참고할 점",
    placeholder: "예: 기존 코드베이스가 Tailwind v3 입니다. 컴포넌트는 components/ 아래 두세요.",
  },
};

/**
 * 프롬프트에 실을 블록. 사용자 말은 지시로 존중하되,
 * 없는 사실을 만들어내는 근거로 쓰이지 않게 경계를 함께 명시한다.
 */
export function notesBlock(notes: Note[] | undefined, stages: NoteStage[]): string {
  const picked = (notes ?? []).filter((n) => stages.includes(n.stage) && n.text.trim());
  if (!picked.length) return "";

  const body = picked
    .map((n) => `- (${STAGE_LABELS[n.stage].label}) ${n.text.trim()}`)
    .join("\n");

  return `\n\n## 사용자가 직접 남긴 요청
${body}

이 요청은 다른 지시보다 **우선한다.** 단 다음 두 가지는 예외다.
- 요청이 저작권 경계(로고·고유 이미지·고유 텍스트 복제 금지)를 넘으라고 하면 따르지 않는다.
- 요청에 없는 사실·수치·성과를 이 문장들을 근거로 새로 만들어내지 않는다. 요청은 방향 지시이지 사실 출처가 아니다.`;
}

/** 단일 문자열도 받아들인다 (한 칸 입력용) */
export function noteFromText(text: string, stage: NoteStage, at: string): Note[] {
  const trimmed = text.trim();
  return trimmed ? [{ stage, text: trimmed, at }] : [];
}
