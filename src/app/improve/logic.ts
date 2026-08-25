import { z } from "zod";
import { buildGeneratePrompt } from "@/lib/design/generate";
import { SiteAnalysis } from "@/lib/design/improve";
import { MenuProposal, MigrationMap, REWRITE_GUARDRAIL, REWRITE_INSTRUCTION } from "@/lib/design/migration";
import { menuTreeText } from "@/app/improve/menu";
import { RewriteLevel, type DesignBrief, type VisualDna } from "@/lib/types";

/** MODE 2 진행 상태 — project.json 의 `improve` 키에 저장된다 (PRD §23~§28) */
export const ImproveState = z.object({
  url: z.string(),
  rewriteLevel: RewriteLevel,
  /** SiteFacts — 실측치는 그대로 보관만 한다 */
  facts: z.unknown().optional(),
  analysis: SiteAnalysis,
  menu: MenuProposal,
  migration: MigrationMap,
  migrationAudit: z
    .object({
      ok: z.boolean(),
      unaccounted: z.array(z.string()),
      counts: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** PRD §25 승인 게이트 */
  menuApproved: z.boolean().optional(),
  migrationApproved: z.boolean().optional(),
});
export type ImproveState = z.infer<typeof ImproveState>;

/**
 * PRD §25 / §26 승인 게이트 — 순수 검증.
 * 저장된 improve 상태가 없거나 승인되지 않았으면 400 을 돌려준다.
 */
export function validateApproval(
  raw: unknown,
): { ok: true; state: ImproveState } | { ok: false; status: 400; error: string } {
  const parsed = ImproveState.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "저장된 사이트 분석 결과가 없습니다. 먼저 분석을 실행하세요" };
  }
  if (!parsed.data.menuApproved) {
    return { ok: false, status: 400, error: "메뉴 개선안이 승인되지 않았습니다" };
  }
  if (!parsed.data.migrationApproved) {
    return { ok: false, status: 400, error: "Content Migration Map 이 승인되지 않았습니다" };
  }
  return { ok: true, state: parsed.data };
}

/** 승인된 새 구조를 생성 프롬프트에 싣기 위한 블록 (PRD §26, §27) */
export function structureBlock(args: {
  menu: MenuProposal;
  migration: MigrationMap;
  rewriteLevel: RewriteLevel;
}): string {
  const rows = args.migration.items
    .map((i) => `| ${i.from} | ${i.to} | ${i.action} | ${i.reason} |`)
    .join("\n");
  return [
    "## 확정된 정보 구조 (사용자가 승인한 결과 — 그대로 따른다)",
    "### 새 메뉴 구조",
    menuTreeText(args.menu.after),
    "### Content Migration Map",
    "| from | to | action | reason |\n| --- | --- | --- | --- |\n" + rows,
    "### 제약",
    "- 이 메뉴 구조와 콘텐츠 배치를 그대로 따르라. 새 메뉴나 없는 사업을 발명하지 마라.",
    "- 헤더 내비게이션과 섹션 제목은 위 메뉴 트리의 최상위 항목을 쓴다.",
    "- REMOVE 로 표시된 콘텐츠는 새 페이지에 넣지 않는다.",
    `### 재작성 강도 (${args.rewriteLevel})\n${REWRITE_INSTRUCTION[args.rewriteLevel]}`,
    REWRITE_GUARDRAIL,
  ].join("\n\n");
}

/**
 * 승인된 메뉴·Migration Map 을 brief 에 실어 generatePreview 가 만드는 프롬프트에 포함시킨다.
 * generatePreview 는 프롬프트를 내부에서 조립하므로(재시도 게이트 유지) brief 경유로 주입한다.
 */
export function withApprovedStructure(brief: DesignBrief, state: ImproveState): DesignBrief {
  const block = structureBlock({
    menu: state.menu,
    migration: state.migration,
    rewriteLevel: state.rewriteLevel,
  });
  return {
    ...brief,
    brandBrief: [brief.brandBrief?.trim(), block].filter(Boolean).join("\n\n"),
  };
}

/** generatePreview 가 실제로 만들 리디자인 프롬프트 (테스트에서 이 조합을 검증한다) */
export function buildRedesignPrompt(args: {
  brief: DesignBrief;
  visualDna: VisualDna;
  state: ImproveState;
}): string {
  return buildGeneratePrompt({
    brief: withApprovedStructure(args.brief, args.state),
    visualDna: args.visualDna,
  });
}
