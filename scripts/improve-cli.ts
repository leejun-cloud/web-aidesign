/**
 * MODE 2 실측 검증 스크립트 (PRD §23~§28)
 *   npx tsx scripts/improve-cli.ts <url> [rewriteLevel] [model]
 *   npx tsx scripts/improve-cli.ts <url> --facts-only   (AI 없이 수집 메뉴만 확인 — 봇 차단 여부 판별용)
 * 결과를 workspace/.verify/mode2-report.json 에 기록한다. (리디자인 생성은 하지 않는다)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { collectSiteFacts } from "../src/lib/design/capture";
import { SiteAnalysis, analyzeExistingSite } from "../src/lib/design/improve";
import { MenuProposal, MigrationMap, droppedMenus, topLevelCount } from "../src/lib/design/migration";
import { WORKSPACE } from "../src/lib/store";
import { RewriteLevel } from "../src/lib/types";
import { menuTreeText } from "../src/app/improve/menu";

/**
 * tsx(esbuild) 는 keepNames 로 `__name(...)` 래퍼를 심는데, page.evaluate 로 넘어간
 * 함수 본문에도 그 참조가 남아 브라우저에서 `__name is not defined` 로 죽는다.
 * 검증용 실행기이므로 페이지 쪽에 no-op 을 심어 우회한다. (capture.ts 는 수정 금지)
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
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const [url, levelArg, model] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!url) throw new Error("URL 을 넘기세요");

  // 봇 차단 사이트를 AI 호출 전에 걸러낸다
  if (flags.includes("--facts-only")) {
    const facts = await collectSiteFacts(url);
    const blocked = /blocked|Attention Required|Access Denied/i.test(facts.textSample.slice(0, 400));
    console.log(JSON.stringify({
      url, title: facts.title, blocked,
      navCount: facts.navLinks.length,
      navLinks: facts.navLinks.map((l) => l.text),
      imageCount: facts.imageCount, missingAlt: facts.missingAlt, loadMs: facts.loadMs,
    }, null, 2));
    return;
  }
  const rewriteLevel = RewriteLevel.parse(levelArg ?? "clarify");

  const result = await analyzeExistingSite(url, rewriteLevel, model ? { model } : {});

  SiteAnalysis.parse(result.analysis);
  MenuProposal.parse(result.menu);
  MigrationMap.parse(result.migration);

  const collected = result.facts.navLinks.map((l) => l.text);
  const beforeMatchesCollected =
    result.menu.before.length === collected.length &&
    result.menu.before.every((b, i) => b === collected[i]);

  const summary = {
    url,
    rewriteLevel,
    model: model ?? "sonnet",
    collectedMenus: collected,
    collectedMenuCount: collected.length,
    before: result.menu.before,
    beforeMatchesCollected,
    beforeSubsetOfCollected: result.menu.before.every((b) =>
      collected.some((c) => c.replace(/\s+/g, "") === b.replace(/\s+/g, "")),
    ),
    after: result.menu.after,
    afterTree: menuTreeText(result.menu.after),
    topLevelCount: topLevelCount(result.menu),
    topLevelWithinSeven: topLevelCount(result.menu) <= 7,
    droppedMenus: droppedMenus(result.menu),
    rationale: result.menu.rationale,
    migrationItems: result.migration.items,
    migrationAudit: result.migrationAudit,
    analysis: result.analysis,
    facts: {
      title: result.facts.title,
      imageCount: result.facts.imageCount,
      missingAlt: result.facts.missingAlt,
      oversizedImages: result.facts.oversizedImages,
      loadMs: result.facts.loadMs,
      fonts: result.facts.fonts,
    },
  };

  const outDir = path.join(WORKSPACE, ".verify");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "mode2-report.json"), JSON.stringify(summary, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        url,
        collectedMenuCount: summary.collectedMenuCount,
        beforeMatchesCollected,
        topLevelCount: summary.topLevelCount,
        topLevelWithinSeven: summary.topLevelWithinSeven,
        droppedMenus: summary.droppedMenus,
        migrationAudit: summary.migrationAudit,
        migrationItemCount: result.migration.items.length,
      },
      null,
      2,
    ),
  );
  console.log(`\n${summary.afterTree}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
