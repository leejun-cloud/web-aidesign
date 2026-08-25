/**
 * 최종 E2E 검증 — 강화된 토큰 게이트로 새로 생성한 디자인이
 * 확정 감사(auditApproval)까지 통과하는지 실측한다.
 *
 * 실행: npx tsx scripts/e2e-cli.ts
 *
 * verify-step3 에 저장된 Reference 스크린샷과 Visual DNA 를 재사용해
 * 캡처·분석 단계를 건너뛰고 생성부터 확정까지만 돌린다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { approveDesign } from "@/lib/design/editRun";
import { generatePreview } from "@/lib/design/generate";
import { auditSections } from "@/lib/design/sections";
import { auditTokens } from "@/lib/design/tokens";
import { ensureProject, patchMeta, readMeta, saveVersion, writeMeta, WORKSPACE } from "@/lib/store";
import { DesignBrief, VisualDna } from "@/lib/types";

const SOURCE = "verify-step3";
const PROJECT = "e2e-final";

async function main() {
  const src = await readMeta(SOURCE);
  const brief = DesignBrief.parse({ ...(src.brief as object), projectId: PROJECT });
  const visualDna = VisualDna.parse(src.visualDna);

  await ensureProject(PROJECT);
  await writeMeta(PROJECT, {
    projectId: PROJECT,
    name: "최종 E2E 검증",
    createdAt: new Date().toISOString(),
    versions: [],
  });
  await patchMeta(PROJECT, { brief, visualDna });

  console.log("생성 시작 — 섹션 무결성 + 토큰 재현성 게이트 적용");
  const result = await generatePreview({ brief, visualDna });

  const sections = auditSections(result.html);
  const tokens = auditTokens(result.html);
  console.log(`시도 ${result.attempts}회`);
  console.log(`섹션: ${sections.found.join(", ")} · ok=${sections.ok}`);
  console.log(
    `토큰: 변수 ${tokens.variableCount}개 · 하드코딩 ${tokens.hardcodedColors.length}개 · ok=${tokens.ok}`,
  );
  if (tokens.hardcodedColors.length) console.log(`  ${tokens.hardcodedColors.join(" ")}`);

  const entry = await saveVersion(PROJECT, result.html, "E2E Initial");
  console.log(`v${entry.version} 저장`);

  console.log("확정 진행 — 산출물 6종 + DESIGN.md 생성");
  const approved = await approveDesign(PROJECT);
  console.log(`DESIGN.md 시도 ${approved.designMdAttempts}회 · 확정 감사 ok=${approved.audit.ok}`);
  if (!approved.audit.ok) {
    console.log("  미달:", JSON.stringify({
      missingFiles: approved.audit.missingFiles,
      emptyFiles: approved.audit.emptyFiles,
      sections: approved.audit.sections.ok,
      tokens: approved.audit.tokens,
      designMd: { missing: approved.audit.designMd.missing, empty: approved.audit.designMd.empty },
    }));
  }

  const report = {
    ranAt: new Date().toISOString(),
    projectId: PROJECT,
    generate: {
      attempts: result.attempts,
      bytes: result.html.length,
      sections: sections.found,
      sectionsOk: sections.ok,
      tokenVariableCount: tokens.variableCount,
      hardcodedColors: tokens.hardcodedColors,
      tokensOk: tokens.ok,
    },
    approve: {
      version: approved.version,
      files: approved.files,
      designMdAttempts: approved.designMdAttempts,
      auditOk: approved.audit.ok,
      audit: approved.audit,
    },
    verdict: sections.ok && tokens.ok && approved.audit.ok ? "PASS" : "FAIL",
  };

  const out = path.join(WORKSPACE, ".verify", "e2e-report.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n판정: ${report.verdict}\n리포트: ${out}`);
  if (report.verdict !== "PASS") process.exitCode = 1;
}

main().catch((e) => {
  console.error("E2E 실패:", (e as Error).message);
  process.exitCode = 1;
});
