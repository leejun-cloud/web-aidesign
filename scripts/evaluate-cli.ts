/**
 * 사이트 평가 / 두 사이트 비교 실측 검증 스크립트
 *   npx tsx scripts/evaluate-cli.ts <url> [refUrl]
 * 결과 요약을 workspace/.verify/step6-report.json 에 기록한다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { compareSites, contradictions, evaluateSite } from "../src/lib/design/audit";
import { Evaluation } from "../src/lib/design/evaluate";
import { WORKSPACE } from "../src/lib/store";

/**
 * tsx(esbuild) 는 keepNames 로 `__name(...)` 래퍼를 심는데, page.evaluate 로 넘어간
 * 함수 본문에도 그 참조가 남아 브라우저에서 `__name is not defined` 로 죽는다.
 * 이 스크립트는 검증용 실행기이므로 페이지 쪽에 no-op 을 심어 우회한다. (capture.ts 는 수정 금지)
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
  const [url, refUrl] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!url) throw new Error("URL 을 넘기세요");

  const outDir = path.join(WORKSPACE, ".verify");
  await fs.mkdir(outDir, { recursive: true });

  if (refUrl) {
    const result = await compareSites(url, refUrl);
    const summary = {
      mode: "compare",
      ours: { url, total: result.ours.total, breakdown: result.ours.breakdown },
      reference: { url: refUrl, total: result.reference.total, breakdown: result.reference.breakdown },
      similarity: result.similarity,
      gaps: result.gaps,
    };
    await fs.writeFile(path.join(outDir, "step6-compare.json"), JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const report = await evaluateSite(url);
  Evaluation.parse(report);
  const bad = contradictions(report);
  const summary = {
    mode: "evaluate",
    url,
    total: report.total,
    breakdown: report.breakdown,
    contentScore: report.contentScore,
    contentIssues: report.contentIssues,
    measuredScore: report.measuredScore,
    measurements: report.measurements,
    contradictionCount: bad.length,
    contradictions: bad,
    impactOrder: report.improvements.map((i) => i.impact),
    withSectionId: report.improvements.filter((i) => i.sectionId).length,
    improvements: report.improvements,
    visualNotes: report.visualNotes,
    uxNotes: report.uxNotes,
  };
  await fs.writeFile(path.join(outDir, "step6-report.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify({ ...summary, improvements: undefined }, null, 2));
  console.log(`\n모순 ${bad.length}건 / 개선안 ${report.improvements.length}개 / sectionId ${summary.withSectionId}개`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
