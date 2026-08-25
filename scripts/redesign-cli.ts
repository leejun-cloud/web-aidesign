/**
 * MODE 2 5단계(리디자인 생성) 실측 검증 (PRD §14, Acceptance #14).
 *   npx tsx scripts/redesign-cli.ts <url> [rewriteLevel] [model]
 *
 * 1~4단계(분석·메뉴·Migration Map)를 실행하고 승인 상태로 저장한 뒤,
 * 승인 게이트를 통과시켜 실제 리디자인 Preview 를 생성한다.
 * 결과를 workspace/.verify/mode2-redesign-report.json 에 기록한다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeExistingSite } from "@/lib/design/improve";
import { auditSections } from "@/lib/design/sections";
import { auditTokens } from "@/lib/design/tokens";
import { ensureProject, patchMeta, saveVersion, writeMeta, WORKSPACE } from "@/lib/store";
import { DesignBrief, LEVEL_PRESETS, PHOTO_PRESETS, RewriteLevel } from "@/lib/types";
import { validateApproval, withApprovedStructure, structureBlock } from "../src/app/improve/logic";
import { generatePreview } from "@/lib/design/generate";
import { analyzeReference } from "@/lib/design/visualDna";
import { resolveReference } from "@/lib/design/reference";

const PROJECT = "e2e-redesign";

async function main() {
  const [url, levelArg, model] = process.argv.slice(2);
  if (!url) throw new Error("URL 을 넘기세요: npx tsx scripts/redesign-cli.ts <url> [rewriteLevel] [model]");
  const rewriteLevel = RewriteLevel.parse(levelArg ?? "clarify");

  console.log(`1~4단계 — ${url} 분석 (rewriteLevel=${rewriteLevel})`);
  const analysis = await analyzeExistingSite(url, rewriteLevel, model ? { model } : {});
  console.log(`  메뉴 ${analysis.menu.before.length}개 → 최상위 ${analysis.menu.after.length}개`);
  console.log(`  migrationAudit.ok = ${analysis.migrationAudit.ok} (유실 ${analysis.migrationAudit.unaccounted.length}건)`);

  await ensureProject(PROJECT);
  await writeMeta(PROJECT, {
    projectId: PROJECT,
    name: "MODE 2 리디자인 검증",
    createdAt: new Date().toISOString(),
    versions: [],
  });

  // Reference 는 리디자인 대상 사이트 자신 — "그 사이트를 개선한다"는 시나리오를 그대로 반영
  const brief = DesignBrief.parse({
    projectId: PROJECT,
    mode: "improve",
    references: [{ id: "A", kind: "url", value: url }],
    level: "similar",
    advanced: LEVEL_PRESETS.similar,
    photo: PHOTO_PRESETS.similar,
    existingUrl: url,
    rewriteLevel,
  });
  await patchMeta(PROJECT, { brief });

  // 승인 없이 리디자인을 막는 게이트가 실제로 동작하는지 먼저 확인한다
  const unapproved = validateApproval({
    url, rewriteLevel, analysis: analysis.analysis, menu: analysis.menu,
    migration: analysis.migration, migrationAudit: analysis.migrationAudit,
  });
  console.log(`\n승인 전 게이트: ok=${unapproved.ok} ${unapproved.ok ? "" : `(${unapproved.error}) — 정상`}`);
  if (unapproved.ok) throw new Error("승인 게이트가 승인 없이 통과했습니다 — 버그");

  // PRD §25 — 사용자가 승인해야 Preview 에 반영된다. 여기서 그 승인을 실측으로 흉내낸다.
  const improveState = {
    url, rewriteLevel, analysis: analysis.analysis, menu: analysis.menu,
    migration: analysis.migration, migrationAudit: analysis.migrationAudit,
    menuApproved: true, migrationApproved: true,
  };
  await patchMeta(PROJECT, { improve: improveState } as never);

  const gate = validateApproval(improveState);
  console.log(`승인 후 게이트: ok=${gate.ok}`);
  if (!gate.ok) throw new Error(`승인 후에도 게이트 실패: ${gate.error}`);

  console.log("\n5단계 — Reference 분석 (자기 자신의 사이트를 Visual DNA 로)");
  const references = [await resolveReference(PROJECT, brief.references[0])];
  const visualDna = await analyzeReference(references, {
    advanced: brief.advanced,
    brandBrief: brief.brandBrief,
  });

  const injectedBrief = withApprovedStructure(brief, gate.state);
  const block = structureBlock({ menu: gate.state.menu, migration: gate.state.migration, rewriteLevel });
  console.log(`  구조 주입 블록 길이: ${block.length}자`);

  console.log("\n5단계 — 리디자인 HTML 생성");
  const result = await generatePreview({ brief: injectedBrief, visualDna });
  const entry = await saveVersion(PROJECT, result.html, "리디자인 v1 (실측)");

  const sections = auditSections(result.html);
  const tokens = auditTokens(result.html);

  // 승인된 메뉴 최상위 항목이 실제 생성 HTML 에 반영됐는지 확인 (텍스트 근사 검사)
  const htmlText = result.html.replace(/<[^>]+>/g, " ").toLowerCase();
  const menuReflected = gate.state.menu.after.map((m) => ({
    label: m.label,
    found: htmlText.includes(m.label.toLowerCase()),
  }));
  const reflectedCount = menuReflected.filter((m) => m.found).length;

  console.log(`\nv${entry.version} 저장 (${result.html.length} bytes, 시도 ${result.attempts}회)`);
  console.log(`섹션: ${sections.found.join(", ")} · ok=${sections.ok}`);
  console.log(`토큰: 변수 ${tokens.variableCount}개 · 하드코딩 ${tokens.hardcodedColors.length}개 · ok=${tokens.ok}`);
  console.log(`메뉴 반영: ${reflectedCount}/${menuReflected.length} — ${JSON.stringify(menuReflected)}`);

  const report = {
    ranAt: new Date().toISOString(),
    url, rewriteLevel,
    analysis: {
      before: analysis.menu.before,
      after: analysis.menu.after,
      topLevelCount: analysis.menu.after.length,
      migrationAudit: analysis.migrationAudit,
    },
    approvalGate: { blockedWithoutApproval: !unapproved.ok, passedWithApproval: gate.ok },
    generate: {
      version: entry.version,
      bytes: result.html.length,
      attempts: result.attempts,
      sections: sections.found,
      sectionsOk: sections.ok,
      tokenVariableCount: tokens.variableCount,
      hardcodedColors: tokens.hardcodedColors,
      tokensOk: tokens.ok,
    },
    menuReflected,
    reflectedCount,
    reflectedTotal: menuReflected.length,
    verdict:
      !unapproved.ok && gate.ok && sections.ok && tokens.ok && reflectedCount >= Math.ceil(menuReflected.length * 0.5)
        ? "PASS"
        : "FAIL",
  };

  const out = path.join(WORKSPACE, ".verify", "mode2-redesign-report.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n판정: ${report.verdict}\n리포트: ${out}`);
  if (report.verdict !== "PASS") process.exitCode = 1;
}

main().catch((e) => {
  console.error("실패:", (e as Error).message);
  process.exitCode = 1;
});
