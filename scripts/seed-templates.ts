/**
 * 10개 레퍼런스 사이트로 Reference Template(디자인 가이드 샘플)을 만들어 seed-templates/ 에 커밋한다.
 *   VDNA_ENGINE=codex npx tsx scripts/seed-templates.ts
 * /api/template/from-url 과 완전히 동일한 파이프라인을 HTTP 없이 직접 호출한다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { captureUrl } from "../src/lib/design/capture";
import { generatePreview } from "../src/lib/design/generate";
import { analyzeReference } from "../src/lib/design/visualDna";
import { buildReferenceTemplateBrief, extractPhotoDna, saveTemplate, SEED_TEMPLATES_DIR } from "../src/lib/design/templateStore";
import { templatesDir } from "../src/lib/store";
import { LEVEL_PRESETS, SimilarityLevel } from "../src/lib/types";

/** scripts/template-cli.ts, scripts/dreambridge-redesign.ts 와 동일한 tsx/esbuild __name 우회 */
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

const LEVEL: SimilarityLevel = "similar";

const SAMPLES: { name: string; url: string }[] = [
  { name: "Stripe", url: "https://stripe.com" },
  { name: "Linear", url: "https://linear.app" },
  { name: "Vercel", url: "https://vercel.com" },
  { name: "Notion", url: "https://www.notion.so" },
  { name: "Figma", url: "https://www.figma.com" },
  { name: "Framer", url: "https://www.framer.com" },
  { name: "Mercury", url: "https://mercury.com" },
  { name: "Webflow", url: "https://webflow.com" },
  { name: "Ramp", url: "https://ramp.com" },
  { name: "Attio", url: "https://attio.com" },
];

async function seedOne(sample: { name: string; url: string }) {
  console.error(`\n=== ${sample.name} (${sample.url}) ===`);
  const staging = path.join(templatesDir(), ".staging", `seed-${sample.name.toLowerCase()}`);
  await fs.mkdir(staging, { recursive: true });

  console.error("  [1/4] 스크린샷 캡처");
  const timeoutMs = Number(process.env.SEED_TIMEOUT_MS ?? 45_000);
  const shots = [
    await captureUrl(sample.url, path.join(staging, "ref-desktop.png"), "desktop", { fullPage: false, timeoutMs }),
    await captureUrl(sample.url, path.join(staging, "ref-mobile.png"), "mobile", { fullPage: false, timeoutMs }),
  ];

  const brief = buildReferenceTemplateBrief({ projectId: `seed-${sample.name}`, sourceUrl: sample.url, level: LEVEL, shots });

  console.error("  [2/4] Visual DNA + Photo DNA 추출");
  const visualDna = await analyzeReference(brief.references, { advanced: LEVEL_PRESETS[LEVEL], brandBrief: brief.brandBrief });
  const photoDna = await extractPhotoDna(shots, { name: `${sample.name} Photo`, sourceUrl: sample.url });

  console.error("  [3/4] 새 Preview 생성");
  const generated = await generatePreview({ brief, visualDna });
  console.error(`    attempts=${generated.attempts} audit.ok=${generated.audit.ok}`);

  console.error("  [4/4] Template 저장 + seed-templates/ 로 복사");
  const template = await saveTemplate({
    name: sample.name,
    html: generated.html,
    visualDna,
    photoDna,
    origin: "reference",
    sourceUrl: sample.url,
    defaultLevel: LEVEL,
  });

  const src = path.join(templatesDir(), template.id);
  const dest = path.join(SEED_TEMPLATES_DIR, template.id);
  await fs.cp(src, dest, { recursive: true });
  await fs.rm(staging, { recursive: true, force: true });
  console.error(`  완료 → seed-templates/${template.id}`);
  return template.id;
}

async function main() {
  await fs.mkdir(SEED_TEMPLATES_DIR, { recursive: true });
  const only = process.env.SEED_ONLY?.split(",").map((s) => s.trim().toLowerCase());
  const limit = Number(process.argv[2] ?? SAMPLES.length);
  const targets = (only ? SAMPLES.filter((s) => only.includes(s.name.toLowerCase())) : SAMPLES).slice(0, limit);
  const results: { name: string; id?: string; error?: string }[] = [];
  for (const sample of targets) {
    try {
      const id = await seedOne(sample);
      results.push({ name: sample.name, id });
    } catch (e) {
      console.error(`  실패: ${(e as Error).message}`);
      results.push({ name: sample.name, error: (e as Error).message });
    }
  }
  console.log("\n" + JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} 실패`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
