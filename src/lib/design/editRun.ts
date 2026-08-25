import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { runAgent } from "@/lib/ai/cli";
import { auditApproval, sourceOfTruthBlock, type ApprovalAudit } from "@/lib/design/approve";
import { captureHtml } from "@/lib/design/capture";
import { auditDesignMd, designMdPrompt, type DesignMdAudit } from "@/lib/design/designMd";
import { carveHtml } from "@/lib/design/generate";
import { motionInstruction, type MotionSettings, type MotionTemplate } from "@/lib/design/motion";
import {
  allowedFor,
  buildSectionEditPrompt,
  enforceLock,
  type SectionEditRequest,
} from "@/lib/design/sectionEdit";
import { auditSections, extractSection, parseSections, replaceSection } from "@/lib/design/sections";
import { auditTokens, extractTokens, renderTokensCss } from "@/lib/design/tokens";
import { WORKSPACE, latestVersion, patchMeta, paths, readMeta, readVersion, saveVersion } from "@/lib/store";

/**
 * 에이전트 응답에서 **섹션 요소 하나만** 뽑는다.
 * 코드펜스로 감싸거나 앞에 설명을 붙여도, 전체 페이지를 돌려줘도 대상 요소만 남긴다.
 */
export function carveSection(text: string, sectionId: string): string {
  const fences = [...text.matchAll(/```(?:html)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fences, text];
  for (const body of candidates) {
    const dom = new JSDOM(`<body>${body.trim()}</body>`);
    const doc = dom.window.document;
    const el =
      doc.querySelector(`[data-vdna-id="${sectionId}"]`) ?? doc.querySelector("[data-vdna-id]");
    if (el) return el.outerHTML;
  }
  throw new Error(`응답에서 ${sectionId} 섹션 요소를 찾지 못했습니다`);
}

function tryCarveHtml(text: string): string | null {
  try {
    return carveHtml(text);
  } catch {
    return null;
  }
}

/** 응답이 섹션 조각이 아니라 페이지 문서인지 */
function isFullDocument(text: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(text);
}

/** 테스트/CLI 에서 AI 호출을 갈아끼울 수 있게 한다 */
export type Agent = (args: { prompt: string; images?: string[] }) => Promise<string>;

const defaultAgent: Agent = ({ prompt, images }) =>
  runAgent({ prompt, images, model: "sonnet", timeoutMs: 20 * 60 * 1000 });

export interface EditResult {
  version: number;
  label: string;
  changed: string[];
  reverted: string[];
  sections: ReturnType<typeof auditSections>;
  tokens: ReturnType<typeof auditTokens>;
}

export class StructuralViolation extends Error {
  constructor() {
    super("AI 응답이 섹션 구조를 바꿨습니다(섹션 추가/삭제/순서 변경). 변경을 적용하지 않았습니다.");
  }
}

/**
 * 섹션 수정의 단일 경로 (PRD §16~§19, §65).
 * `/api/section-edit`, `/api/motion`, 검증 CLI 가 모두 이 함수를 쓴다 —
 * 어느 입구로 들어와도 enforceLock 을 반드시 통과한다.
 */
export async function runSectionEdit(
  req: SectionEditRequest,
  opts: { agent?: Agent; label?: string; instruction?: string } = {},
): Promise<EditResult> {
  const agent = opts.agent ?? defaultAgent;
  const { html: before } = await latestVersion(req.projectId);
  const allSectionIds = parseSections(before);
  if (!allSectionIds.includes(req.sectionId)) {
    throw new Error(`현재 디자인에 ${req.sectionId} 섹션이 없습니다`);
  }

  const prompt = buildSectionEditPrompt({
    req: { ...req, instruction: opts.instruction ?? req.instruction },
    sectionHtml: extractSection(before, req.sectionId),
    allSectionIds,
    tokensCss: renderTokensCss(extractTokens(before)),
  });

  const raw = await agent({
    prompt,
    images: req.images.length
      ? req.images.map((p) => (path.isAbsolute(p) ? p : path.resolve(WORKSPACE, p)))
      : undefined,
  });
  // 에이전트가 지시를 어기고 페이지 전체를 돌려주는 경우가 있다. 그때는 문서를 그대로 후보로 삼아
  // enforceLock 이 침범한 섹션을 되돌리게 한다 — 섹션만 오려내면 위반이 조용히 감춰진다.
  // 반대로 섹션 하나만 담긴 문서 껍데기라면(에이전트가 습관적으로 <html> 을 씌운 경우) 오려낸다.
  const asDocument = isFullDocument(raw) ? tryCarveHtml(raw) : null;
  const candidate =
    asDocument && parseSections(asDocument).length > 1
      ? asDocument
      : replaceSection(before, req.sectionId, carveSection(raw, req.sectionId));

  // 프롬프트를 믿지 않는다 — 결과를 강제한다
  const related = allSectionIds.filter((id) => id !== req.sectionId);
  const locked = enforceLock(before, candidate, allowedFor(req, related));
  if (locked.structuralViolation) throw new StructuralViolation();

  const label = opts.label ?? `${req.sectionId} 수정`;
  const entry = await saveVersion(req.projectId, locked.html, label);
  return {
    version: entry.version,
    label: entry.label,
    changed: locked.changed,
    reverted: locked.reverted,
    sections: auditSections(locked.html),
    tokens: auditTokens(locked.html),
  };
}

/** Motion Library 적용 (PRD §46~§49) — 섹션 수정과 같은 Lock 경로를 탄다 */
export function runMotionEdit(
  req: SectionEditRequest,
  settings: MotionSettings,
  opts: { agent?: Agent; extraMotions?: MotionTemplate[] } = {},
) {
  return runSectionEdit(req, {
    agent: opts.agent,
    instruction: motionInstruction(req.sectionId, settings, opts.extraMotions ?? []),
    label: `${req.sectionId} Motion (${settings.templateId})`,
  });
}

/** PRD §20 — 복구는 이력을 지우지 않고 새 버전을 쌓는다 */
export async function restoreVersion(projectId: string, version: number) {
  const { html } = await readVersion(projectId, version);
  const entry = await saveVersion(projectId, html, `v${version} 복구`);
  return { version: entry.version, label: entry.label, restoredFrom: version };
}

/** DESIGN.md 재생성 되먹임 — 빠진/빈 섹션 이름을 그대로 되먹인다 */
export function designMdFeedback(audit: DesignMdAudit): string {
  const lines: string[] = [];
  if (audit.missing.length) lines.push(`- 아래 필수 섹션이 아예 없다: ${audit.missing.join(", ")}`);
  if (audit.empty.length)
    lines.push(`- 아래 섹션은 제목만 있고 내용이 없다(각 2~5줄 필요): ${audit.empty.join(", ")}`);
  if (!audit.hasSourceOfTruth) lines.push("- approved-preview.html 이 유일한 진실임을 문서에 명시하지 않았다.");
  if (!lines.length) lines.push("- 원인 불명 (DESIGN.md 검사 실패)");
  return lines.join("\n");
}

export interface ApproveResult {
  version: number;
  files: string[];
  audit: ApprovalAudit;
  designMdAttempts: number;
}

/** PRD §21, §22, §3.4 — 디자인 확정 */
export async function approveDesign(
  projectId: string,
  opts: { agent?: Agent } = {},
): Promise<ApproveResult> {
  const agent = opts.agent ?? defaultAgent;
  const dir = paths(projectId).design;
  const { entry, html } = await latestVersion(projectId);

  // 확정은 여러 파일 쓰기 + AI 호출(수 분)이 이어지는 긴 작업이다.
  // 도중에 클라이언트 연결이 끊기거나 프로세스가 죽으면, 실제 design/ 에 절반만
  // 쓰인 파일이 남아 approvedAt 은 안 갱신된 채 approved-preview.html 만 최신인
  // 혼란스러운 상태가 될 수 있다 — 실제로 이런 사고가 있었다.
  // 스테이징 디렉터리에 전부 완성한 뒤 마지막에 한 번의 rename 으로 교체한다.
  // rename 은 같은 파일시스템 안에서 원자적이므로, 실 design/ 은 "이전 완전한 상태"
  // 아니면 "새 완전한 상태" 둘 중 하나만 보인다 — 중간 상태가 노출되지 않는다.
  // dir 의 하위가 아니라 형제 경로에 만든다 — 하위에 만들면 dir 자체를 백업으로
  // rename 할 때 staging 까지 함께 딸려가 버려 마지막 rename(staging, dir) 이 깨진다.
  const staging = `${dir}.staging-${Date.now()}`;
  await fs.mkdir(staging, { recursive: true });

  let designMdAttempts = 0;
  try {
    await fs.writeFile(path.join(staging, "approved-preview.html"), html, "utf8");

    // fullPage 는 4MB 를 넘겨 후속 AI 분석을 타임아웃시킨 전례가 있다 — 뷰포트 크기로만 찍는다
    await captureHtml(html, path.join(staging, "approved-desktop.png"), "desktop", { fullPage: false });
    await captureHtml(html, path.join(staging, "approved-mobile.png"), "mobile", { fullPage: false });

    const tokens = extractTokens(html);
    await fs.writeFile(path.join(staging, "design-tokens.css"), renderTokensCss(tokens), "utf8");

    const meta = await readMeta(projectId);
    await fs.writeFile(
      path.join(staging, "visual-dna.json"),
      JSON.stringify(meta.visualDna ?? {}, null, 2),
      "utf8",
    );

    // DESIGN.md — 실패하면 빠진 섹션을 되먹여 최대 2회 재생성
    const basePrompt = designMdPrompt({ html, tokens, visualDna: meta.visualDna ?? {} });
    let feedback = "";
    let md = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      designMdAttempts = attempt;
      const prompt = feedback
        ? `${basePrompt}\n\n## 직전 시도가 검증을 통과하지 못했다\n${feedback}\n이 문제만 고쳐 문서 전체를 다시 출력하라.`
        : basePrompt;
      let body: string;
      try {
        body = (await agent({ prompt })).trim();
      } catch (e) {
        feedback = `- 직전 시도가 문서를 만들지 못했다: ${(e as Error).message}`;
        continue;
      }
      body = body.replace(/^```(?:markdown|md)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      md = `${sourceOfTruthBlock()}\n${body}\n`;
      const a = auditDesignMd(md);
      if (a.ok) break;
      feedback = designMdFeedback(a);
    }
    if (md) await fs.writeFile(path.join(staging, "DESIGN.md"), md, "utf8");

    // 여기까지 전부 성공했을 때만 실제 design/ 을 통째로 교체한다.
    const backup = `${dir}.prev-${Date.now()}`;
    const hadPrevious = await fs
      .stat(dir)
      .then(() => true)
      .catch(() => false);
    if (hadPrevious) await fs.rename(dir, backup);
    await fs.rename(staging, dir);
    if (hadPrevious) await fs.rm(backup, { recursive: true, force: true });

    const fresh = await readMeta(projectId);
    const patch: Record<string, unknown> = {
      approvedAt: new Date().toISOString(),
      versions: fresh.versions.map((v) => (v.version === entry.version ? { ...v, approved: true } : v)),
    };
    await patchMeta(projectId, patch as Partial<typeof fresh>);
  } catch (e) {
    // 실패했으면 스테이징만 지우고 기존 design/ 은 손대지 않은 채로 둔다
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }

  const audit = await auditApproval(projectId);
  return {
    version: entry.version,
    files: [
      "approved-preview.html",
      "approved-desktop.png",
      "approved-mobile.png",
      "design-tokens.css",
      "visual-dna.json",
      "DESIGN.md",
    ],
    audit,
    designMdAttempts,
  };
}
