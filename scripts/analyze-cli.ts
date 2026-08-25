/**
 * 캡처 + Visual DNA 분석 실측 검증 스크립트
 *   npx tsx scripts/analyze-cli.ts https://a.com [https://b.com]
 * 옵션: --blend=a-structure-b-style --project=<id>
 */
import fs from "node:fs/promises";
import { resolveReference } from "../src/lib/design/reference";
import { analyzeReference } from "../src/lib/design/visualDna";
import { ensureProject } from "../src/lib/store";
import { LEVEL_PRESETS, VisualDna, type BlendMode, type Reference } from "../src/lib/types";

async function main() {
  const args = process.argv.slice(2);
  const urls = args.filter((a) => !a.startsWith("--"));
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  if (!urls.length) throw new Error("URL 을 하나 이상 넘기세요");

  const projectId = flag("project") ?? `cli-analyze-${Date.now()}`;
  await ensureProject(projectId);

  const refs: Reference[] = [];
  for (const [i, url] of urls.entries()) {
    const ref: Reference = { id: `ref-${String.fromCharCode(97 + i)}`, kind: "url", value: url };
    refs.push(await resolveReference(projectId, ref));
  }

  const sizes: Record<string, number> = {};
  for (const r of refs) {
    for (const shot of [r.desktopShot, r.mobileShot]) {
      if (shot) sizes[shot] = (await fs.stat(shot)).size;
    }
  }

  const dna = await analyzeReference(refs, {
    advanced: LEVEL_PRESETS.similar,
    blend: flag("blend") as BlendMode | undefined,
  });

  console.log(JSON.stringify({ projectId, refs, screenshotBytes: sizes, visualDna: VisualDna.parse(dna) }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
