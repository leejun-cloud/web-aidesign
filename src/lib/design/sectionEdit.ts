import { z } from "zod";
import { ImageRole, SECTION_IDS } from "@/lib/types";
import { notesBlock, type Note } from "@/lib/design/notes";
import { changedSections, extractSection, parseSections, replaceSection } from "@/lib/design/sections";

/** PRD §17 — 수정 범위 */
export const EditScope = z.enum(["selected-only", "allow-related"]);
export type EditScope = z.infer<typeof EditScope>;

export const SectionEditRequest = z.object({
  projectId: z.string().min(1),
  sectionId: z.enum(SECTION_IDS),
  instruction: z.string().min(1).max(4000),
  /** 첨부 참고 이미지 (workspace 상대 또는 절대 경로) */
  images: z.array(z.string()).default([]),
  /** PRD §19 — 이 이미지를 무엇에 참고할지. 기본값은 전체 스타일 */
  imageRole: ImageRole.default("overall"),
  scope: EditScope.default("selected-only"),
});
export type SectionEditRequest = z.infer<typeof SectionEditRequest>;

const ROLE_INSTRUCTION: Record<ImageRole, string> = {
  overall: "첨부 이미지는 **전체 스타일** 참고용이다. 분위기·색·타이포·컴포넌트 성격을 함께 참고하라.",
  layout: "첨부 이미지는 **레이아웃**만 참고한다. 구조·비율·요소 배치만 가져오고 색과 타이포는 현재 디자인을 유지하라.",
  photo: "첨부 이미지는 **사진**만 참고한다. 사진의 구도·조명·색보정·피사계심도만 가져오고 레이아웃은 유지하라.",
  typography: "첨부 이미지는 **Typography** 만 참고한다. 폰트 성격·크기 위계·자간·행간만 가져오고 나머지는 유지하라.",
  motion: "첨부 이미지는 **Motion 느낌**의 참고다. 정적 이미지에서 읽히는 움직임의 성격만 반영하라.",
};

/**
 * 섹션 수정 프롬프트 (PRD §16~§19, §65).
 * Lock 상태를 프롬프트에 명시적으로 전달한다.
 */
export function buildSectionEditPrompt(args: {
  req: SectionEditRequest;
  sectionHtml: string;
  allSectionIds: string[];
  /** 전체 디자인 일관성을 위한 참고 — 토큰 선언부 */
  tokensCss?: string;
  /** 프로젝트 전반에 걸린 사용자 요청 */
  notes?: Note[];
}): string {
  const { req, sectionHtml, allSectionIds, tokensCss, notes } = args;
  const locked = allSectionIds.filter((id) => id !== req.sectionId);

  const lockTable = allSectionIds
    .map((id) => `- ${id.padEnd(14)} ${id === req.sectionId ? "EDIT" : "LOCK"}`)
    .join("\n");

  return `너는 Design Generator 다. 이미 승인된 디자인의 **한 섹션만** 수정한다.

## 수정 대상
\`data-vdna-id="${req.sectionId}"\` 섹션 **하나뿐이다.**

## Component Lock (PRD §65)
${lockTable}

LOCK 된 섹션(${locked.join(", ") || "없음"})의 마크업·스타일·스크립트를 **읽기만 하고 절대 출력하지 마라.**
전역 선택자(\`body\`, \`:root\`, \`*\`, \`h1\` 등)에 새 규칙을 추가하지 마라 — 다른 섹션에 번진다.
새로 필요한 스타일은 \`[data-vdna-id="${req.sectionId}"]\` 하위로 스코프하라.

## 사용자 요청
${req.instruction}

${req.images.length ? `## 첨부 참고 이미지 (PRD §19)\n${ROLE_INSTRUCTION[req.imageRole]}\n먼저 현재 섹션과 첨부 이미지의 구조 차이를 파악한 뒤 수정하라.\n` : ""}
${tokensCss ? `## 사용 가능한 Design Token (새 색·간격을 발명하지 말고 이 변수를 써라)\n\`\`\`css\n${tokensCss}\n\`\`\`\n` : ""}
## 현재 섹션 HTML
\`\`\`html
${sectionHtml}
\`\`\`

## 출력 규칙
- 설명 없이 **수정된 섹션 요소 하나만** 출력한다. \`<section data-vdna-id="${req.sectionId}" ...>\` 로 시작해 그 요소의 닫는 태그로 끝난다.
- \`data-vdna-id="${req.sectionId}"\` 를 반드시 유지한다.
- 페이지 전체나 \`<html>\`, \`<head>\`, \`<body>\` 를 출력하지 마라.
- Reference 의 로고·브랜드 고유 그래픽·저작권 이미지·고유 텍스트를 복제하지 마라.${notesBlock(notes, ["design", "content"])}`;
}

export interface LockEnforcement {
  html: string;
  /** 실제로 바뀐 섹션 */
  changed: string[];
  /** AI 가 침범했으나 되돌린 섹션 */
  reverted: string[];
  /** 되돌릴 수 없는 위반 — 섹션이 추가/삭제됐다 */
  structuralViolation: boolean;
}

/**
 * 프롬프트를 믿지 않고 결과를 강제한다 (PRD §17, §3.5).
 * 허용되지 않은 섹션이 바뀌었으면 원본으로 되돌린다.
 */
export function enforceLock(before: string, after: string, allowed: string[]): LockEnforcement {
  const beforeIds = sectionIdsOf(before);
  const afterIds = sectionIdsOf(after);
  const structuralViolation =
    beforeIds.length !== afterIds.length || beforeIds.some((id, i) => afterIds[i] !== id);

  if (structuralViolation) {
    return { html: before, changed: [], reverted: [], structuralViolation: true };
  }

  let html = after;
  const reverted: string[] = [];
  for (const id of changedSections(before, after)) {
    if (allowed.includes(id)) continue;
    html = replaceSection(html, id, extractSection(before, id));
    reverted.push(id);
  }
  return { html, changed: changedSections(before, html), reverted, structuralViolation: false };
}

/**
 * 섹션 id 를 DOM 에서 센다.
 * 정규식으로 세면 <style> 안의 `[data-vdna-id="hero"]` 스코프 선택자까지
 * 섹션으로 오인해 정상 수정을 구조 위반으로 거부한다.
 */
function sectionIdsOf(html: string): string[] {
  return parseSections(html);
}

/** PRD §17 — 관련 영역까지 허용할 때 열어줄 섹션 */
export function allowedFor(req: SectionEditRequest, related: string[] = []): string[] {
  return req.scope === "allow-related" ? [req.sectionId, ...related] : [req.sectionId];
}
