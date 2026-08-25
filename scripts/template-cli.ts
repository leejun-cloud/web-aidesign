/**
 * Template 저장 실측 검증
 *   npx tsx scripts/template-cli.ts [projectId] [templateName]
 * 기존 산출물(preview-v1.html)로 saveTemplate 을 돌려 8개 파일을 실제로 만든다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { auditTemplateFiles, TEMPLATE_FILES } from "../src/lib/design/template";
import { saveTemplate } from "../src/lib/design/templateStore";
import { WORKSPACE, readMeta, latestVersion } from "../src/lib/store";
import { VisualDna } from "../src/lib/types";
import { PhotoDna } from "../src/lib/design/template";

/**
 * tsx(esbuild) 의 keepNames 래퍼가 page.evaluate 안에서 `__name is not defined` 로 죽는다.
 * 검증 실행기 쪽에서 no-op 을 심어 우회한다. (capture.ts 는 수정 금지)
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
  const [projectId = "verify-step3", name = "Step7 검증 템플릿"] = process.argv.slice(2);
  const meta = await readMeta(projectId);
  const { html } = await latestVersion(projectId);
  const visualDna = VisualDna.parse(meta.visualDna);
  const photoDna = PhotoDna.parse({
    name: `${name} Photo`,
    traits: [visualDna.photography.composition, visualDna.photography.texture, visualDna.photography.imageRatio],
    lighting: visualDna.photography.lighting,
    grading: visualDna.photography.colorGrading,
    subject: visualDna.photography.humanPose || visualDna.photography.environment,
    depthOfField: visualDna.photography.depthOfField,
  });

  const template = await saveTemplate({ name, html, visualDna, photoDna, origin: "mine" });
  const dir = path.join(WORKSPACE, "templates", template.id);
  const entries = await fs.readdir(dir);
  const audit = auditTemplateFiles(entries);
  const files: Record<string, number> = {};
  for (const f of TEMPLATE_FILES) files[f] = (await fs.stat(path.join(dir, f))).size;
  const tokensCss = await fs.readFile(path.join(dir, "design-tokens.css"), "utf8");
  const varCount = (tokensCss.match(/^\s*--[a-zA-Z0-9-_]+\s*:/gm) ?? []).length;

  const report = { templateId: template.id, dir, auditOk: audit.ok, missing: audit.missing, files, tokenVariableCount: varCount };
  const outDir = path.join(WORKSPACE, ".verify");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "step7-template.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!audit.ok) throw new Error(`파일 누락: ${audit.missing.join(", ")}`);
  if (files["preview-desktop.png"] < 20_000 || files["preview-mobile.png"] < 20_000) {
    throw new Error("PNG 가 20KB 미만이다 — 캡처가 제대로 되지 않았다");
  }
  if (varCount < 8) throw new Error(`CSS 변수 ${varCount}개 — 8개 미만`);
  console.log("\n8개 파일 통과 / PNG 20KB+ / CSS 변수 " + varCount + "개");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
