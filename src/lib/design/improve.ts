import { z } from "zod";
import { runAgentJson } from "@/lib/ai/cli";
import { notesBlock, type Note } from "@/lib/design/notes";
import { collectSiteFacts, type SiteFacts } from "@/lib/design/capture";
import {
  MenuProposal,
  MigrationMap,
  REWRITE_GUARDRAIL,
  REWRITE_INSTRUCTION,
  auditMigration,
} from "@/lib/design/migration";
import type { RewriteLevel } from "@/lib/types";

/** PRD §24 — 기존 사이트 분석 결과 */
export const SiteAnalysis = z.object({
  structure: z.object({
    navigation: z.string(),
    menuHierarchy: z.array(z.string()),
    footer: z.string(),
    cta: z.string(),
  }),
  content: z.object({
    duplicates: z.array(z.string()),
    tooLong: z.array(z.string()),
    weakHeadings: z.array(z.string()),
    missing: z.array(z.string()),
    misplaced: z.array(z.string()),
  }),
  design: z.object({
    typography: z.string(),
    spacing: z.string(),
    color: z.string(),
    components: z.string(),
    imagery: z.string(),
    mobile: z.string(),
  }),
  ux: z.object({
    primaryActions: z.array(z.string()),
    conversionPath: z.string(),
    navigationClarity: z.string(),
    ctaClarity: z.string(),
  }),
});
export type SiteAnalysis = z.infer<typeof SiteAnalysis>;

function factsBlock(facts: SiteFacts): string {
  return `## 실측 자료 (브라우저에서 직접 수집 — 이 사실을 바꾸지 말고 근거로 써라)
- URL: ${facts.url}
- 제목: ${facts.title}
- 상단 메뉴 (${facts.navLinks.length}): ${facts.navLinks.map((l) => l.text).join(" / ") || "없음"}
- Heading 구조: ${facts.headings.map((h) => `h${h.level}:${h.text}`).slice(0, 40).join(" | ") || "없음"}
- 버튼/링크 문구 (${facts.ctaTexts.length}): ${[...new Set(facts.ctaTexts)].slice(0, 30).join(" / ")}
- 이미지 ${facts.imageCount}개 (alt 누락 ${facts.missingAlt}개, 2400px 초과 ${facts.oversizedImages}개)
- 사용 폰트: ${facts.fonts.slice(0, 6).join(" / ")}
- 로드 시간: ${facts.loadMs}ms

## 본문 발췌
${facts.textSample.slice(0, 4000)}`;
}

/** PRD §24 — Content Architect 역할 (PRD §62) */
export function buildSiteAnalysisPrompt(facts: SiteFacts, notes?: Note[]): string {
  return `너는 Content Architect 다. 아래 기존 홈페이지를 구조·콘텐츠·디자인·UX 네 갈래로 분석하라.

${factsBlock(facts)}

## 분석 지침
- 구조: Navigation, 메뉴 위계, Footer, CTA 를 실제 수집된 메뉴 목록에 근거해 기술하라.
- 콘텐츠: 중복된 설명, 지나치게 긴 문장, 약한 제목, 빠진 정보, 잘못 배치된 정보를 **본문 발췌에서 실제로 관찰된 것만** 지적하라.
- 디자인: Typography, Spacing, Color, Components, Imagery, Mobile 을 관찰 가능한 수준에서 기술하라.
- UX: 방문자의 주요 행동, 전환 경로, 내비게이션 명확성, CTA 명확성.

## 금지
- 본문에 없는 사실·수치·성과를 만들어내지 마라.
- 확인할 수 없는 것은 지적하지 말고 빼라.
- 막연한 칭찬이나 총평을 쓰지 마라. 각 항목은 구체적 관찰이어야 한다.${notesBlock(notes, ["analysis", "content"])}`;
}

/** PRD §25, §66 — Before / After 메뉴 재구성 */
export function buildMenuProposalPrompt(args: { facts: SiteFacts; analysis: SiteAnalysis; notes?: Note[] }): string {
  const before = args.facts.navLinks.map((l) => l.text).filter(Boolean);
  return `너는 Content Architect 다. 아래 기존 메뉴를 방문자의 행동 기준으로 재구성하라.

## 기존 메뉴 (before 에 이 목록을 그대로 담아라)
${before.map((b) => `- ${b}`).join("\n") || "- (수집된 메뉴 없음)"}

## 분석 요약
- Navigation: ${args.analysis.structure.navigation}
- 주요 행동: ${args.analysis.ux.primaryActions.join(", ")}
- 전환 경로: ${args.analysis.ux.conversionPath}

## 재구성 규칙
- 최상위 메뉴는 **5~6개 이내**로 묶어라. 조직도가 아니라 방문자가 하려는 일을 기준으로 나눈다.
- 기존 메뉴 항목을 조용히 버리지 마라. 통합하거나 하위로 내리고, 정말 없앨 것은 명시적으로 남겨라.
- \`after\` 는 \`{ label, children? }\` 트리다. 깊이는 2단까지만.
- \`rationale\` 에 왜 이렇게 묶었는지 항목별로 적어라.
- 없는 사업이나 페이지를 새로 발명하지 마라. 기존 메뉴와 본문에 근거가 있어야 한다.${notesBlock(args.notes, ["analysis", "content"])}`;
}

/** PRD §26, §27 — Content Migration Map */
export function buildMigrationPrompt(args: {
  facts: SiteFacts;
  menu: MenuProposal;
  rewriteLevel: RewriteLevel;
  notes?: Note[];
}): string {
  const flat = (nodes: MenuProposal["after"], depth = 0): string[] =>
    nodes.flatMap((n) => [
      `${"  ".repeat(depth)}- ${n.label}`,
      ...(n.children?.length ? flat(n.children as MenuProposal["after"], depth + 1) : []),
    ]);

  return `너는 Content Architect 다. 기존 콘텐츠를 새 구조의 어디에 쓸지 매핑하라.

## 기존 메뉴
${args.menu.before.map((b) => `- ${b}`).join("\n")}

## 새 구조
${flat(args.menu.after).join("\n")}

## 본문 발췌
${args.facts.textSample.slice(0, 4000)}

## 매핑 규칙
- 각 항목에 action 을 하나 부여한다: KEEP / MOVE / MERGE / REWRITE / REMOVE
- **새 구조에서 사라진 기존 메뉴는 반드시 MERGE 또는 REMOVE 로 등장해야 한다.** 설명 없이 사라지면 실패다.
- \`from\` 은 기존 메뉴명이나 콘텐츠 덩어리 이름, \`to\` 는 새 구조의 위치.
- \`reason\` 은 한 줄로 구체적으로.
- \`rewriteLevel\` 은 \`${args.rewriteLevel}\` 로 그대로 채워라.

## 재작성 강도
${REWRITE_INSTRUCTION[args.rewriteLevel]}

${REWRITE_GUARDRAIL}${notesBlock(args.notes, ["content", "analysis"])}`;
}

export interface ImproveAnalysis {
  facts: SiteFacts;
  analysis: SiteAnalysis;
  menu: MenuProposal;
  migration: MigrationMap;
  migrationAudit: ReturnType<typeof auditMigration>;
}

/**
 * 기존 사이트를 분석해 메뉴 개선안과 Migration Map 까지 만든다 (PRD §23~§28).
 * Migration Map 이 사라진 메뉴를 설명하지 못하면 그 목록을 되먹여 한 번 더 요청한다.
 */
export async function analyzeExistingSite(
  url: string,
  rewriteLevel: RewriteLevel,
  opts: { model?: string; notes?: Note[] } = {},
): Promise<ImproveAnalysis> {
  const facts = await collectSiteFacts(url);

  const analysis = await runAgentJson(SiteAnalysis, {
    prompt: buildSiteAnalysisPrompt(facts, opts.notes),
    model: opts.model,
  });

  const menu = await runAgentJson(MenuProposal, {
    prompt: buildMenuProposalPrompt({ facts, analysis, notes: opts.notes }),
    model: opts.model,
  });

  let migration = await runAgentJson(MigrationMap, {
    prompt: buildMigrationPrompt({ facts, menu, rewriteLevel, notes: opts.notes }),
    model: opts.model,
  });
  let migrationAudit = auditMigration(menu, migration);

  if (!migrationAudit.ok) {
    migration = await runAgentJson(MigrationMap, {
      prompt: `${buildMigrationPrompt({ facts, menu, rewriteLevel, notes: opts.notes })}

## 직전 시도가 놓친 항목
다음 기존 메뉴가 새 구조에서 사라졌는데 매핑에 등장하지 않았다. 이들을 반드시 포함하라:
${migrationAudit.unaccounted.map((u) => `- ${u}`).join("\n")}`,
      model: opts.model,
    });
    migrationAudit = auditMigration(menu, migration);
  }

  return { facts, analysis, menu, migration, migrationAudit };
}
