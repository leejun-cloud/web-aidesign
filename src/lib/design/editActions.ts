/** PRD §14 — 하단 액션 6개. 마지막 '직접 요청' 은 대화창 포커스이므로 프리셋이 없다. */
export const ACTION_PRESETS = {
  "더 비슷하게": "이 섹션을 Reference 의 디자인 특성에 더 가깝게 다듬어라. 레이아웃 비율·여백 리듬·타이포 위계를 Reference 쪽으로 더 밀되, 구성 요소를 새로 추가하거나 없애지는 마라.",
  "조금 다르게": "이 섹션을 Reference 에서 한 발 떨어뜨려 새로운 구성으로 다시 제안하라. 같은 콘텐츠와 정보량을 유지한 채 배치·강조 방식만 다르게 바꿔라.",
  "사진 바꾸기": "이 섹션의 이미지/사진 표현만 바꿔라. 구도·비율·색보정·마스킹을 다르게 하고 텍스트와 레이아웃 골격은 유지하라.",
  "색상 바꾸기": "이 섹션의 색 사용만 바꿔라. 기존 Design Token 변수 안에서 배경/강조 면적과 대비를 재배분하고, 레이아웃과 타이포는 그대로 둔다.",
  Motion: "이 섹션에 스크롤 진입 모션을 더해라. 섹션 범위로 스코프하고 prefers-reduced-motion: reduce 에서는 애니메이션을 끈다.",
} as const;

export type ActionLabel = keyof typeof ACTION_PRESETS;
export const ACTION_LABELS = Object.keys(ACTION_PRESETS) as ActionLabel[];

export function actionInstruction(label: ActionLabel): string {
  const preset = ACTION_PRESETS[label];
  if (!preset) throw new Error(`알 수 없는 액션: ${label}`);
  return preset;
}
