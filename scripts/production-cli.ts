/**
 * Production 전환 + Visual QA 실측 검증
 *   npx tsx scripts/production-cli.ts [projectId]
 * 기존 승인/최신 HTML 로 계획 → 코드 생성 → Fidelity 측정까지 실제로 돌린다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { auditPlanCoverage } from "../src/lib/design/production";
import {
  approvedOrLatest,
  approvedShot,
  planProduction,
  productionSectionIds,
  runProduction,
  visualQa,
} from "../src/lib/design/productionize";
import { extractTokens, renderTokensCss } from "../src/lib/design/tokens";
import { WORKSPACE, paths } from "../src/lib/store";

/** tsx keepNames 래퍼 우회 — page.evaluate 안의 `__name is not defined` 방지 (capture.ts 무수정) */
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
  const [projectId = "verify-step3"] = process.argv.slice(2);
  const p = paths(projectId);
  const { html, approved } = await approvedOrLatest(projectId);
  const sectionIds = productionSectionIds(html);
  console.log(`[1/4] 섹션 ${sectionIds.length}개: ${sectionIds.join(", ")} (승인본=${approved})`);

  const plan = await planProduction({ html, sectionIds, framework: "nextjs" });
  const coverage = auditPlanCoverage(plan, sectionIds);
  console.log(`[2/4] 계획: 컴포넌트 ${plan.components.length}개, coverage.ok=${coverage.ok}`);
  if (!coverage.ok) throw new Error(`coverage 실패: ${JSON.stringify(coverage)}`);

  const tokensCss = renderTokensCss(extractTokens(html));
  const build = await runProduction({ html, tokensCss, plan, outDir: p.production });
  console.log(`[3/4] 생성 파일 ${build.files.length}개:\n${build.files.map((f) => "  - " + f).join("\n")}`);

  const shot = await approvedShot(projectId, html, "desktop");
  const qa = await visualQa({ projectId, approvedShot: shot });
  console.log(`[4/4] Fidelity ${qa.fidelity} / method ${qa.method} / diff ${qa.drift.diffPixels}/${qa.drift.totalPixels}`);

  const report = {
    projectId,
    approved,
    sectionIds,
    plan,
    coverage,
    producedFiles: build.files,
    fidelity: qa.fidelity,
    breakdown: qa.breakdown,
    method: qa.method,
    diffPixels: qa.drift.diffPixels,
    totalPixels: qa.drift.totalPixels,
    heightDeltaPx: qa.drift.heightDeltaPx,
    widthMismatch: qa.drift.widthMismatch,
    diffImagePath: qa.drift.diffImagePath,
    producedShot: qa.producedShot,
    approvedShot: shot,
  };
  const outDir = path.join(WORKSPACE, ".verify");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "step7-production.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n리포트: ${path.join(outDir, "step7-production.json")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
