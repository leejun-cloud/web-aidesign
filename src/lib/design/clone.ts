import { analyzeExistingSite } from "@/lib/design/improve";
import { generatePreview, refinePreview } from "@/lib/design/generate";
import { resolveReference, referenceShots } from "@/lib/design/reference";
import { analyzeReference } from "@/lib/design/visualDna";
import type { ImproveState } from "@/app/improve/logic";
import { withApprovedStructure } from "@/app/improve/logic";
import { createProject, patchMeta, paths, saveVersion } from "@/lib/store";
import { normalizeUrl } from "@/lib/design/url";
import { DesignBrief, LEVEL_PRESETS, PHOTO_PRESETS } from "@/lib/types";
import { nanoid } from "nanoid";
import path from "node:path";

export interface CloneResult {
  projectId: string;
  attempts: number;
  auditOk: boolean;
}

/**
 * URL 하나로 기존 사이트를 구조·콘텐츠까지 최대한 그대로 재현하는 "완전 복제" 모드.
 * /improve 와 달리 사람 승인 게이트 없이 자동 진행하고(rewriteLevel=keep, level=very),
 * 레퍼런스도 대상 사이트 자신으로 둔다 — 톤을 다듬는 게 아니라 거의 그대로 다시 만드는 것이 목적이다.
 * capture.ts/cli.ts 를 거치므로 로컬 Claude/Codex CLI + Playwright 가 필요해 배포 환경에서는 동작하지 않는다.
 */
export async function runClone(rawUrl: string, opts: { brandBrief?: string } = {}): Promise<CloneResult> {
  const check = normalizeUrl(rawUrl);
  if (!check.ok) throw new Error(check.error ?? "잘못된 URL");
  const url = check.url!;

  const existing = await analyzeExistingSite(url, "keep");

  const projectId = await createProject(new URL(url).hostname);
  const improveState: ImproveState = {
    url,
    rewriteLevel: "keep",
    facts: existing.facts,
    analysis: existing.analysis,
    menu: existing.menu,
    migration: existing.migration,
    migrationAudit: existing.migrationAudit,
    menuApproved: true,
    migrationApproved: true,
  };
  await patchMeta(projectId, { improve: improveState } as never);

  const rawRef = { id: nanoid(), kind: "url" as const, value: url };
  const resolvedRef = await resolveReference(projectId, rawRef);

  const brief = DesignBrief.parse({
    projectId,
    mode: "improve",
    references: [resolvedRef],
    level: "very",
    advanced: LEVEL_PRESETS.very,
    photo: PHOTO_PRESETS.very,
    existingUrl: url,
    rewriteLevel: "keep",
    brandBrief: opts.brandBrief,
  });
  await patchMeta(projectId, { brief });

  const visualDna = await analyzeReference([resolvedRef], { advanced: brief.advanced, brandBrief: brief.brandBrief });
  await patchMeta(projectId, { visualDna });

  const structuredBrief = withApprovedStructure(brief, improveState);
  let result = await generatePreview({ brief: structuredBrief, visualDna });
  result = await refinePreview({
    html: result.html,
    brief: structuredBrief,
    visualDna,
    shots: referenceShots(resolvedRef),
    outDir: path.join(paths(projectId).design, "refine"),
    maxRounds: 2,
  });

  await saveVersion(projectId, result.html, `전체 복제 v1 (${url})`);

  return { projectId, attempts: result.attempts, auditOk: result.audit.ok };
}
