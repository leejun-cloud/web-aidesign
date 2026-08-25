/**
 * Step 4/5 실측 검증 스크립트 — 섹션 수정 / Motion / 복구 / 디자인 확정
 *   npx tsx scripts/edit-cli.ts [projectId] [--only=edit,motion,restore,approve]
 * 결과를 workspace/.verify/step45-report.json 에 기록한다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { auditApproval } from "../src/lib/design/approve";
import { approveDesign, restoreVersion, runMotionEdit, runSectionEdit } from "../src/lib/design/editRun";
import { auditSections, changedSections } from "../src/lib/design/sections";
import { auditTokens } from "../src/lib/design/tokens";
import { SectionEditRequest } from "../src/lib/design/sectionEdit";
import { WORKSPACE, readMeta, readVersion } from "../src/lib/store";

/**
 * tsx(esbuild) 의 keepNames 가 심는 `__name` 참조가 page.evaluate 본문에 남아
 * 브라우저에서 `__name is not defined` 로 죽는다 — 페이지에 no-op 을 심어 우회한다.
 * (capture.ts 는 수정 금지)
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

const projectId = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "verify-step3";
const onlyArg = process.argv.slice(2).find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : ["edit", "motion", "restore", "approve"];

const outDir = path.join(WORKSPACE, ".verify");
const reportFile = path.join(outDir, "step45-report.json");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const report: Record<string, any> = { projectId, startedAt: new Date().toISOString(), steps: {} };

async function flush() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
}

async function step(name: string, fn: () => Promise<unknown>) {
  if (!only.includes(name)) return;
  const t0 = Date.now();
  console.log(`\n=== ${name} 시작 ===`);
  try {
    const result = await fn();
    report.steps[name] = { ok: true, ms: Date.now() - t0, ...(result as object) };
  } catch (e) {
    report.steps[name] = { ok: false, ms: Date.now() - t0, error: (e as Error).message };
    console.error(`${name} 실패: ${(e as Error).message}`);
  }
  await flush();
  console.log(JSON.stringify(report.steps[name], null, 2).slice(0, 2000));
}

async function main() {
  const startMeta = await readMeta(projectId);
  report.baseVersions = startMeta.versions.map((v) => `v${v.version} ${v.label}`);

  let editedVersion = 0;

  // 1) hero 수정 — changedSections 가 정확히 ["hero"] 여야 통과
  await step("edit", async () => {
    const baseVersion = (await readMeta(projectId)).versions.at(-1)!.version;
    const before = (await readVersion(projectId, baseVersion)).html;
    const r = await runSectionEdit(
      SectionEditRequest.parse({
        projectId,
        sectionId: "hero",
        instruction: "CTA 버튼을 하나만 남기고 제목을 더 크게 해줘",
      }),
    );
    editedVersion = r.version;
    const after = (await readVersion(projectId, r.version)).html;
    const diff = changedSections(before, after);
    return {
      fromVersion: baseVersion,
      newVersion: r.version,
      changedSections: diff,
      pass: diff.length === 1 && diff[0] === "hero",
      reverted: r.reverted,
      sectionsOk: auditSections(after).ok,
      tokensOk: auditTokens(after).ok,
      sections: auditSections(after),
      tokens: { variableCount: auditTokens(after).variableCount, hardcoded: auditTokens(after).hardcodedColors },
    };
  });

  // 2) Motion 적용 — hero 에 image-reveal
  await step("motion", async () => {
    const baseVersion = (await readMeta(projectId)).versions.at(-1)!.version;
    const before = (await readVersion(projectId, baseVersion)).html;
    const r = await runMotionEdit(
      SectionEditRequest.parse({ projectId, sectionId: "hero", instruction: "Motion 적용" }),
      { templateId: "image-reveal", speed: "normal", intensity: "medium" },
    );
    const after = (await readVersion(projectId, r.version)).html;
    const diff = changedSections(before, after);
    return {
      fromVersion: baseVersion,
      newVersion: r.version,
      changedSections: diff,
      pass: diff.length === 1 && diff[0] === "hero" && /prefers-reduced-motion/.test(after),
      hasReducedMotion: /prefers-reduced-motion/.test(after),
      reverted: r.reverted,
      sectionsOk: auditSections(after).ok,
      tokensOk: auditTokens(after).ok,
    };
  });

  // 3) 복구 — v1 로 되돌려도 이력이 남아야 한다
  await step("restore", async () => {
    const r = await restoreVersion(projectId, 1);
    const meta = await readMeta(projectId);
    const list = meta.versions.map((v) => v.version);
    const v1 = (await readVersion(projectId, 1)).html;
    const restored = (await readVersion(projectId, r.version)).html;
    return {
      newVersion: r.version,
      label: r.label,
      versions: meta.versions.map((v) => `v${v.version} ${v.label}`),
      pass: list.includes(1) && list.includes(2) && list.includes(3) && restored === v1,
      historyKept: list,
    };
  });

  // 4) 디자인 확정
  await step("approve", async () => {
    const r = await approveDesign(projectId);
    const audit = await auditApproval(projectId);
    const dir = path.join(WORKSPACE, "projects", projectId, "design");
    const sizes: Record<string, number> = {};
    for (const f of r.files) {
      try {
        sizes[f] = (await fs.stat(path.join(dir, f))).size;
      } catch {
        sizes[f] = -1;
      }
    }
    return {
      approvedVersion: r.version,
      designMdAttempts: r.designMdAttempts,
      sizes,
      pass: audit.ok,
      audit,
    };
  });

  report.editedVersion = editedVersion;
  report.finishedAt = new Date().toISOString();
  report.pass = Object.entries(report.steps).every(([, v]) => (v as { pass?: boolean }).pass !== false);
  await flush();
  console.log(`\n리포트: ${reportFile}\n전체 통과: ${report.pass}`);
}

main().catch(async (e) => {
  report.fatal = e instanceof Error ? e.message : String(e);
  await flush();
  console.error(report.fatal);
  process.exit(1);
});
