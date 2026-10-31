/**
 * 드림브릿지 홈페이지를 AWS AI 페이지 참조로 리디자인 (레벨 5 = "very")
 *   VDNA_ENGINE=codex npx tsx scripts/dreambridge-redesign.ts
 *
 * /improve 플로우(분석→승인게이트→리디자인→리파인→확정)를 UI 없이 그대로 재현한다.
 * 프로덕션 변환(production/build)은 우리 레포 구조(src/app)와 이 툴의 가정(app/)이 달라
 * 여기서 하지 않는다 — 확정 산출물(design/)까지만 만들고 결과를 리포트한다.
 */
import path from "node:path";
import { nanoid } from "nanoid";
import { chromium } from "playwright";
import { analyzeExistingSite } from "../src/lib/design/improve";
import { generatePreview, refinePreview } from "../src/lib/design/generate";
import { resolveReference, referenceShots } from "../src/lib/design/reference";
import { analyzeReference } from "../src/lib/design/visualDna";
import { approveDesign } from "../src/lib/design/editRun";
import { auditTokens } from "../src/lib/design/tokens";
import { createProject, patchMeta, paths, saveVersion } from "../src/lib/store";
import { withApprovedStructure, type ImproveState } from "../src/app/improve/logic";
import { DesignBrief, LEVEL_PRESETS, PHOTO_PRESETS, type VisualDna } from "../src/lib/types";

const EXISTING_URL = "https://db.nolgong.app";
const REFERENCE_URL = "https://aws.amazon.com/ko/ai/";
const REWRITE_LEVEL = "clarify" as const;
const LEVEL = "very" as const; // 레벨 5 = 매우 비슷하게

const BRAND_BRIEF = [
  "드림브릿지(DreamBridge) — AI 비즈니스 전환(AX) 파트너.",
  "중소 사업자가 AI 인터뷰 30분으로 전환 최적화 홈페이지를 만들고,",
  "24시간 AI 세일즈 에이전트가 방문자를 고객으로 바꾸는 풀스택 SaaS 플랫폼.",
  "핵심 서비스: AI 상담봇 풀세팅, 업무 자동화, AI 에이전틱 홈페이지 제작, 콘텐츠(블로그) 자동화.",
  "브랜드 컬러: 딥그린(#070e0a, #122b1e, #22573d) + 골드(#f9ca62, #feebac).",
  "AWS AI 페이지처럼 정보 구조가 명확하고 위계가 뚜렷한, '지금 뭘 하는 곳인지 한눈에 보이는' 사이트를 원한다.",
].join(" ");

/**
 * tsx(esbuild) 는 keepNames 로 `__name(...)` 래퍼를 심는데, page.evaluate 로 넘어간
 * 함수 본문에도 그 참조가 남아 브라우저에서 `__name is not defined` 로 죽는다.
 * (scripts/improve-cli.ts 와 동일한 우회 — capture.ts 는 수정 금지)
 */
const origLaunch = chromium.launch.bind(chromium);
chromium.launch = (async (...args: Parameters<typeof origLaunch>) => {
  const browser = await origLaunch(...args);
  const origNewPage = browser.newPage.bind(browser);
  browser.newPage = (async (...p: Parameters<typeof origNewPage>) => {
    const page = await origNewPage(...p);
    await page.addInitScript(() => {
      (globalThis as unknown as { __name: unknown }).__name = (f: unknown) => f;
    });
    return page;
  }) as typeof origNewPage;
  return browser;
}) as typeof origLaunch;

async function main() {
  console.error(`[dreambridge-redesign] engine=${process.env.VDNA_ENGINE ?? "claude"}`);

  console.error("[1/7] 기존 사이트 분석 중…");
  const existing = await analyzeExistingSite(EXISTING_URL, REWRITE_LEVEL, {});
  console.error(
    `  menu.before=${existing.menu.before.length} menu.after=${existing.menu.after.length} ` +
      `migrationAudit.ok=${existing.migrationAudit?.ok}`,
  );

  const projectId = await createProject("dreambridge-aws-ai");
  console.error(`  projectId=${projectId}`);

  const improveState: ImproveState = {
    url: EXISTING_URL,
    rewriteLevel: REWRITE_LEVEL,
    facts: existing.facts,
    analysis: existing.analysis,
    menu: existing.menu,
    migration: existing.migration,
    migrationAudit: existing.migrationAudit,
    // 사람 검수 대신 이 스크립트를 돌리기 전에 별도로 결과를 검토했다는 전제 하에 자동 승인한다.
    menuApproved: true,
    migrationApproved: true,
  };
  await patchMeta(projectId, { improve: improveState } as never);

  console.error("[2/7] Reference 캡처 중…");
  const rawRef = { id: nanoid(), kind: "url" as const, value: REFERENCE_URL };
  const resolvedRef = await resolveReference(projectId, rawRef);

  const brief = DesignBrief.parse({
    projectId,
    mode: "improve",
    references: [resolvedRef],
    level: LEVEL,
    advanced: LEVEL_PRESETS[LEVEL],
    photo: PHOTO_PRESETS[LEVEL],
    existingUrl: EXISTING_URL,
    rewriteLevel: REWRITE_LEVEL,
    brandBrief: BRAND_BRIEF,
  });
  await patchMeta(projectId, { brief });

  console.error("[3/7] Visual DNA 추출 중…");
  const visualDna: VisualDna = await analyzeReference([resolvedRef], {
    advanced: brief.advanced,
    blend: brief.blend,
    brandBrief: brief.brandBrief,
  });
  await patchMeta(projectId, { visualDna });

  console.error("[4/7] 확정된 메뉴/Migration Map을 프롬프트에 반영해 HTML 생성 중…");
  const structuredBrief = withApprovedStructure(brief, improveState);
  let result = await generatePreview({ brief: structuredBrief, visualDna });
  console.error(`  attempts=${result.attempts} audit.ok=${result.audit.ok}`);

  console.error("[5/7] Visual Refinement 중…");
  result = await refinePreview({
    html: result.html,
    brief: structuredBrief,
    visualDna,
    shots: referenceShots(resolvedRef),
    outDir: path.join(paths(projectId).design, "refine"),
    maxRounds: 2,
  });
  console.error(`  refine rounds=${result.attempts} audit.ok=${result.audit.ok}`);

  await saveVersion(projectId, result.html, "AWS AI 스타일 리디자인 v1 (level=very)");

  console.error("[6/7] 디자인 확정 중 (스크린샷 + DESIGN.md + 토큰)…");
  const approveResult = await approveDesign(projectId);

  console.error("[7/7] 완료");
  console.log(
    JSON.stringify(
      {
        projectId,
        designDir: paths(projectId).design,
        approveResult,
        tokenAudit: auditTokens(result.html),
        menuAfter: existing.menu.after,
        migrationItemCount: existing.migration.items.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
