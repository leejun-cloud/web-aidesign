/**
 * HTML Preview 생성 파이프라인 실측 검증 스크립트
 *   npx tsx scripts/generate-cli.ts <projectId>
 * 옵션: --no-refine (생략) / --refine-rounds=1 (라운드 수 제한)
 */
import path from "node:path";
import { generatePreview, refinePreview } from "../src/lib/design/generate";
import { referenceShots } from "../src/lib/design/reference";
import { auditTokens } from "../src/lib/design/tokens";
import { analyzeReference } from "../src/lib/design/visualDna";
import { patchMeta, paths, readMeta, saveVersion } from "../src/lib/store";
import { DesignBrief, VisualDna } from "../src/lib/types";

async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith("--"));
  if (!projectId) throw new Error("projectId 를 넘기세요");
  const refine = !args.includes("--no-refine");
  const refineRounds = Number(args.find((a) => a.startsWith("--refine-rounds="))?.split("=")[1] ?? 2);

  const meta = await readMeta(projectId);
  const brief = DesignBrief.parse(meta.brief);

  let dna: VisualDna;
  const stored = VisualDna.safeParse(meta.visualDna);
  if (stored.success) {
    dna = stored.data;
    console.error("[generate-cli] 저장된 Visual DNA 재사용");
  } else {
    console.error("[generate-cli] Visual DNA 분석 중…");
    dna = await analyzeReference(brief.references, {
      advanced: brief.advanced,
      blend: brief.blend,
      brandBrief: brief.brandBrief,
    });
    await patchMeta(projectId, { visualDna: dna });
  }

  console.error("[generate-cli] HTML 생성 중…");
  let result = await generatePreview({ brief, visualDna: dna });
  console.error(`[generate-cli] 생성 attempts=${result.attempts} audit.ok=${result.audit.ok}`);

  if (refine) {
    console.error("[generate-cli] Visual Refinement 중…");
    result = await refinePreview({
      html: result.html,
      brief,
      visualDna: dna,
      shots: brief.references.flatMap(referenceShots),
      outDir: path.join(paths(projectId).design, "refine"),
      maxRounds: refineRounds,
    });
    console.error(`[generate-cli] refine rounds=${result.attempts} audit.ok=${result.audit.ok}`);
  }

  const entry = await saveVersion(projectId, result.html, "Initial");
  console.log(
    JSON.stringify(
      {
        projectId,
        version: entry.version,
        file: entry.file,
        bytes: result.html.length,
        audit: result.audit,
        tokenAudit: auditTokens(result.html),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
