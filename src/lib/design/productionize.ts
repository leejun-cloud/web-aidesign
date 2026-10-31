import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, runAgentJson } from "@/lib/ai/cli";
import { captureHtml, captureUrl, type ViewportName } from "@/lib/design/capture";
import { notesBlock, type Note } from "@/lib/design/notes";
import { serveProduction } from "@/lib/design/serveProduction";
import { compareScreenshots, type DriftResult } from "@/lib/design/drift";
import {
  FidelityBreakdown,
  PRODUCTION_DIRECTIVE,
  ProductionPlan,
  auditPlanCoverage,
  shouldAutoCorrect,
  type Framework,
} from "@/lib/design/production";
import { parseSections } from "@/lib/design/sections";
import { latestVersion, paths } from "@/lib/store";

/** PRD §53 — Production 전환에 필요한 입력 자료 6종 */
export const PRODUCTION_INPUTS = [
  "approved-preview.html",
  "approved-desktop.png",
  "approved-mobile.png",
  "design-tokens.css",
  "DESIGN.md",
  "visual-dna.json",
] as const;

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  nextjs: "Next.js + TypeScript + Tailwind",
  react: "React + TypeScript",
  html: "정적 HTML + CSS",
  vue: "Vue 3 + TypeScript",
  nuxt: "Nuxt 3",
  astro: "Astro",
};

/** Visual QA 가 렌더할 정적 합성 페이지 — 빌드 없이 스크린샷을 찍기 위한 산출물 */
export const QA_PREVIEW_FILE = "qa-preview.html";

export interface PlanArgs {
  html: string;
  sectionIds: string[];
  framework: Framework;
  model?: string;
}

/** 순수 함수 — 컴포넌트 계획 프롬프트 (PRD §54, §55) */
export function buildProductionPlanPrompt(args: { html: string; sectionIds: string[]; framework: Framework; notes?: Note[] }): string {
  return [
    "당신은 Production Architect 다. 승인된 HTML 을 실제 프로젝트의 Component 구조로 **변환할 계획**을 JSON 으로 세운다.",
    `## 대상 프레임워크\nframework 는 반드시 \`${args.framework}\` (${FRAMEWORK_LABELS[args.framework]}) 로 적는다.`,
    [
      "## 섹션 → 컴포넌트 1:1 매핑 (필수)",
      `승인 HTML 의 data-vdna-id 섹션은 다음 ${args.sectionIds.length}개다: ${args.sectionIds.join(", ")}`,
      "이 목록의 각 섹션에 대해 정확히 하나의 컴포넌트를 만든다. 목록에 없는 sectionId 를 만들어내지 않는다.",
      "components[].sectionId 는 위 값 중 하나여야 하고, 전체 목록을 빠짐없이 덮어야 한다.",
      "components[].file 은 PascalCase 파일명(예: Hero.tsx)으로 적는다.",
    ].join("\n"),
    "## 그 밖에 채울 것\n- tokenStrategy: design-tokens.css 를 어떻게 그대로 가져갈지\n- responsiveStrategy: 승인 HTML 의 브레이크포인트를 어떻게 보존할지",
    PRODUCTION_DIRECTIVE,
    notesBlock(args.notes, ["production"]),
    "## 승인된 HTML\n```html\n" + args.html.slice(0, 120_000) + "\n```",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 커버리지 감사 결과를 재시도 프롬프트용 되먹임 문자열로 변환 */
export function coverageFeedback(audit: ReturnType<typeof auditPlanCoverage>): string {
  const lines: string[] = [];
  if (audit.missing.length) lines.push(`- 컴포넌트로 매핑되지 않은 섹션: ${audit.missing.join(", ")} (각각 하나씩 컴포넌트를 추가하라)`);
  if (audit.orphan.length) lines.push(`- 승인 HTML 에 없는 유령 섹션: ${audit.orphan.join(", ")} (이 컴포넌트를 제거하라)`);
  return lines.join("\n");
}

/** PRD §54 — 계획을 세우고 섹션 커버리지가 맞을 때까지 최대 2회 되먹임 재시도 */
export async function planProduction(args: PlanArgs): Promise<ProductionPlan> {
  const base = buildProductionPlanPrompt(args);
  let feedback = "";
  let last: ProductionPlan | null = null;
  let lastAudit: ReturnType<typeof auditPlanCoverage> | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = feedback ? `${base}\n\n## 직전 계획이 섹션 커버리지 검사에 실패했다\n${feedback}\n같은 형식으로 계획 전체를 다시 출력하라.` : base;
    const plan = await runAgentJson(ProductionPlan, {
      prompt,
      model: args.model,
      timeoutMs: 20 * 60 * 1000,
    });
    const audit = auditPlanCoverage(plan, args.sectionIds);
    last = plan;
    lastAudit = audit;
    if (audit.ok) return plan;
    feedback = coverageFeedback(audit);
  }
  throw new Error(`컴포넌트 계획이 섹션을 덮지 못했습니다: ${coverageFeedback(lastAudit!)} / 최종 계획 컴포넌트 ${last!.components.length}개`);
}

export interface CodeArgs {
  html: string;
  tokensCss: string;
  plan: ProductionPlan;
  outDir: string;
  /** 자동 수정 루프에서 직전 Fidelity 결과를 되먹인다 */
  feedback?: string;
  /** 개발 시 참고할 사용자 요청 */
  notes?: Note[];
}

/** 순수 함수 — 실제 파일을 쓰게 하는 프롬프트 (PRD §54~§56) */
export function buildProductionCodePrompt(args: CodeArgs): string {
  const files = args.plan.components.map((c) => `- components/${c.file} ← 섹션 \`${c.sectionId}\` (props: ${c.props.join(", ") || "없음"}) ${c.notes}`).join("\n");
  return [
    `당신은 Production Engineer 다. 승인된 HTML 을 ${FRAMEWORK_LABELS[args.plan.framework]} 컴포넌트로 **변환**해 실제 파일로 쓴다.`,
    "**승인 HTML 을 참고해 다시 디자인하지 말고 변환하라.** 시각적 결과가 승인본과 픽셀 수준에서 같아야 한다.",
    `## 작업 디렉터리 (여기에만 파일을 쓴다)\n${args.outDir}`,
    [
      "## 쓸 파일",
      files,
      "- app/globals.css ← 아래 design-tokens.css 를 그대로 포함하고, 승인 HTML 의 <style> 규칙을 컴포넌트 클래스 기준으로 옮긴다",
      "- app/page.tsx ← 컴포넌트를 승인 HTML 과 같은 순서로 배치한다",
      `- ${QA_PREVIEW_FILE} ← **Visual QA 전용 산출물.** 위 컴포넌트들이 렌더하는 최종 마크업을 그대로 담은 자기완결 정적 HTML 한 장. globals.css 를 <style> 로 인라인하고, 외부 리소스를 참조하지 않는다. 빌드 없이 브라우저로 열어 승인 스크린샷과 픽셀 비교하는 용도이므로 마크업과 CSS 가 컴포넌트 출력과 일치해야 한다.`,
    ].join("\n"),
    "## 스타일 방식\nTailwind 빌드 없이도 동일하게 보이도록, 레이아웃/타이포/색은 globals.css 의 순수 CSS 로 작성한다. 승인 HTML 의 클래스 의미와 요소 순서를 보존한다.",
    PRODUCTION_DIRECTIVE,
    `## 계획\n\`\`\`json\n${JSON.stringify(args.plan, null, 2)}\n\`\`\``,
    `## design-tokens.css (값을 재해석하지 말고 그대로 가져간다)\n\`\`\`css\n${args.tokensCss}\n\`\`\``,
    "## 승인된 HTML (유일한 진실)\n```html\n" + args.html.slice(0, 120_000) + "\n```",
    notesBlock(args.notes, ["production", "design"]),
    args.feedback ? `## 직전 전환 결과가 Fidelity 목표에 미달했다\n${args.feedback}\n같은 파일들을 이 문제만 고쳐 다시 써라. 재디자인은 금지다.` : "",
    "파일을 실제로 쓴 뒤, 쓴 파일 목록만 짧게 보고하라.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 생성된 파일 목록 (production 디렉터리 기준 상대 경로) */
export async function listProducedFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string) => {
    const entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
    for (const e of entries) {
      const next = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".qa") continue;
        await walk(next);
      } else if (!e.name.endsWith(".log")) out.push(next); // 에이전트 툴이 남기는 디버그 로그는 산출물이 아니다
    }
  };
  try {
    await walk("");
  } catch {
    return [];
  }
  return out.sort();
}

export interface ProductionRunResult {
  files: string[];
  log: string;
}

/** PRD §55 — Coding Agent 로 실제 컴포넌트 파일을 생성한다 */
export async function runProduction(args: CodeArgs): Promise<ProductionRunResult> {
  await fs.mkdir(args.outDir, { recursive: true });
  const log = await runAgent({
    prompt: buildProductionCodePrompt(args),
    cwd: args.outDir,
    allowWrite: true,
    timeoutMs: 25 * 60 * 1000,
  });
  return { files: await listProducedFiles(args.outDir), log };
}

/** production 산출물을 빌드 없이 렌더할 정적 HTML 을 얻는다 */
export type QaMethod = "served-app" | "qa-preview" | "composed-components";

export interface QaSource {
  method: QaMethod;
  html: string;
}

/** JSX 를 대략적인 HTML 로 환원한다 — qa-preview.html 이 없을 때의 최후 수단 */
export function composeFromComponents(files: { name: string; source: string }[], css: string): string {
  const body = files
    .map(({ source }) => {
      const m = source.match(/return\s*\(([\s\S]*?)\);\s*\n?\s*}/);
      const jsx = m ? m[1] : "";
      return jsx
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/<\/?>/g, "")
        .replace(/className=/g, "class=")
        .replace(/\{["'`]([^"'`]*)["'`]\}/g, "$1")
        .replace(/\{[^{}]*\}/g, "");
    })
    .join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>\n${css}\n</style></head><body>\n${body}\n</body></html>`;
}

export async function qaSource(productionDir: string): Promise<QaSource> {
  const preview = path.join(productionDir, QA_PREVIEW_FILE);
  try {
    return { method: "qa-preview", html: await fs.readFile(preview, "utf8") };
  } catch {
    // 빌드/구동이 어려우므로 컴포넌트 마크업을 합성해 비교한다
  }
  const files = await listProducedFiles(productionDir);
  const components: { name: string; source: string }[] = [];
  for (const f of files.filter((f) => /\.(tsx|jsx)$/.test(f) && !/page\.(tsx|jsx)$/.test(f))) {
    components.push({ name: f, source: await fs.readFile(path.join(productionDir, f), "utf8") });
  }
  if (!components.length) throw new Error("Visual QA 대상 산출물이 없습니다 (qa-preview.html 도, 컴포넌트도 없음)");
  const cssFile = files.find((f) => f.endsWith("globals.css")) ?? files.find((f) => f.endsWith(".css"));
  const css = cssFile ? await fs.readFile(path.join(productionDir, cssFile), "utf8") : "";
  return { method: "composed-components", html: composeFromComponents(components, css) };
}

/** PRD §57 — pixelmatch 결과에서 항목별 점수를 파생시킨다 (실측 근거: drift) */
export function deriveBreakdown(drift: DriftResult): FidelityBreakdown {
  const diffRatio = drift.totalPixels ? drift.diffPixels / drift.totalPixels : 1;
  // 세로 길이 차이는 레이아웃/간격 쪽 감점으로만 반영한다 (1000px 차이를 최대 감점으로 본다)
  const heightRatio = Math.min(1, drift.heightDeltaPx / 1000);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const base = 100 - diffRatio * 100;
  return FidelityBreakdown.parse({
    layout: clamp(base - (drift.widthMismatch ? 10 : 0) - heightRatio * 100),
    typography: clamp(base),
    spacing: clamp(base - heightRatio * 100),
    images: clamp(base),
    components: clamp(base),
    color: clamp(base),
  });
}

export interface VisualQaArgs {
  projectId: string;
  /** 승인 스크린샷 절대 경로 — fullPage 비교에서는 승인 HTML 을 다시 찍어 대체한다 */
  approvedShot: string;
  viewport?: ViewportName;
  outDir?: string;
  /**
   * 전체 페이지를 비교한다 (기본 true).
   * 저장된 승인 스크린샷을 뷰포트 크기로 찍는 것은 후속 **AI 분석**이 4MB 이미지에서
   * 타임아웃 나기 때문이다. Drift 비교는 AI 를 쓰지 않으므로 그 제약이 적용되지 않는다.
   * 스크롤 아래 드리프트를 잡으려면 양쪽을 fullPage 로 다시 찍어 비교해야 한다.
   */
  fullPage?: boolean;
  /** fullPage 비교용 승인 HTML — 없으면 approvedOrLatest 로 읽는다 */
  approvedHtml?: string;
  /** 자동 수정 루프에 필요한 재전환 입력 — 없으면 측정만 한다 */
  correct?: Omit<CodeArgs, "feedback">;
  /** 실제 빌드·구동을 시도할지 (기본 true). 빌드는 수 분 걸린다 */
  serve?: boolean;
}

export interface VisualQaResult {
  fidelity: number;
  /** 비교 범위 — fullPage 면 스크롤 아래까지 포함한다 */
  scope: "full-page" | "above-the-fold";
  breakdown?: FidelityBreakdown;
  drift: DriftResult;
  /** 실제 구동된 앱을 찍었는가(served-app), 정적 대체물로 내려갔는가 */
  method: QaMethod;
  /** 실제 구동에 실패해 대체 경로로 내려간 경우 그 이유 */
  serveError?: string;
  attempts: number;
  producedShot: string;
  history: { attempt: number; fidelity: number; method: QaMethod }[];
}

/** PRD §56~§58 — production 결과를 렌더해 승인본과 픽셀 비교하고, 미달이면 자동 수정 루프를 돈다 */
export async function visualQa(args: VisualQaArgs): Promise<VisualQaResult> {
  const p = paths(args.projectId);
  const viewport: ViewportName = args.viewport ?? "desktop";
  const outDir = args.outDir ?? path.join(p.production, ".qa");
  await fs.mkdir(outDir, { recursive: true });

  const fullPage = args.fullPage ?? true;

  // fullPage 비교는 양쪽을 같은 조건으로 다시 찍어야 의미가 있다.
  // 승인 HTML 을 구할 수 없으면 주어진 스크린샷으로 비교하고 범위를 낮춰 보고한다.
  let approvedShot = args.approvedShot;
  let scope: VisualQaResult["scope"] = fullPage ? "full-page" : "above-the-fold";
  if (fullPage) {
    let approvedHtml = args.approvedHtml;
    if (!approvedHtml) {
      approvedHtml = await approvedOrLatest(args.projectId)
        .then((r) => r.html)
        .catch(() => undefined);
    }
    if (approvedHtml) {
      approvedShot = path.join(outDir, `approved-${viewport}-full.png`);
      await captureHtml(approvedHtml, approvedShot, viewport, { fullPage: true });
    } else {
      scope = "above-the-fold";
    }
  }

  const history: VisualQaResult["history"] = [];
  let attempt = 0;
  let result: VisualQaResult | null = null;

  for (;;) {
    const shot = path.join(outDir, `production-${viewport}-a${attempt}.png`);

    // PRD §56 — 실제로 구동된 Production 앱을 찍는 것이 원칙이다.
    // 빌드/구동이 실패하면 정적 대체 경로로 내려가되, 그 사실을 method 로 남긴다.
    let method: QaMethod;
    let serveError: string | undefined;
    try {
      if (args.serve === false) throw new Error("serve: false — 실제 구동을 건너뛰었습니다");
      // 컴포넌트가 없으면 빌드할 것이 없다 — 수 분짜리 빌드를 헛돌리지 않는다
      if (!(await hasBuildableSource(p.production))) {
        throw new Error("빌드할 컴포넌트가 없습니다");
      }
      const app = await serveProduction(p.production);
      try {
        await captureUrl(app.url, shot, viewport, { fullPage });
      } finally {
        await app.stop();
      }
      method = "served-app";
    } catch (e) {
      serveError = (e as Error).message;
      const src = await qaSource(p.production);
      await captureHtml(src.html, shot, viewport, { fullPage });
      method = src.method;
    }

    const drift = await compareScreenshots(approvedShot, shot, path.join(outDir, `diff-${viewport}-a${attempt}.png`));
    history.push({ attempt, fidelity: drift.fidelity, method });
    result = {
      fidelity: drift.fidelity,
      scope,
      breakdown: deriveBreakdown(drift),
      drift,
      method,
      serveError,
      attempts: attempt + 1,
      producedShot: shot,
      history: [...history],
    };

    if (!args.correct || !shouldAutoCorrect(drift.fidelity, attempt)) return result;

    await runProduction({
      ...args.correct,
      feedback: [
        `- Design Fidelity ${drift.fidelity} / 100 (목표 90). 다른 픽셀 ${drift.diffPixels} / ${drift.totalPixels}`,
        drift.widthMismatch ? "- 가로 폭이 승인본과 다르다 — 컨테이너 폭과 패딩을 승인 HTML 값으로 맞춰라" : "",
        drift.heightDeltaPx ? `- 세로 길이가 ${drift.heightDeltaPx}px 다르다 — 섹션 간격/폰트 크기/행간을 토큰 값 그대로 맞춰라` : "",
        `- diff 이미지: ${drift.diffImagePath ?? "(없음)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    attempt += 1;
  }
}

/** 실제 빌드를 시도할 가치가 있는지 — .tsx/.jsx 산출물이 있어야 한다 */
async function hasBuildableSource(productionDir: string): Promise<boolean> {
  try {
    const files = await listProducedFiles(productionDir);
    return files.some((f) => /\.(tsx|jsx)$/.test(f));
  } catch {
    return false;
  }
}

/** 승인 HTML 에서 섹션 목록을 뽑는다 (계획 프롬프트 입력) */
export const productionSectionIds = (html: string) => parseSections(html);

/** 승인 HTML 이 있으면 그것이 진실, 없으면 최신 버전으로 대체한다 */
export async function approvedOrLatest(projectId: string): Promise<{ html: string; approved: boolean }> {
  const file = path.join(paths(projectId).design, "approved-preview.html");
  try {
    return { html: await fs.readFile(file, "utf8"), approved: true };
  } catch {
    return { html: (await latestVersion(projectId)).html, approved: false };
  }
}

/** 비교 기준 스크린샷 — 승인 스크린샷이 없으면 승인 HTML 로 즉석 캡처한다 */
export async function approvedShot(projectId: string, html: string, viewport: ViewportName = "desktop"): Promise<string> {
  const p = paths(projectId);
  const existing = path.join(p.design, `approved-${viewport}.png`);
  try {
    await fs.access(existing);
    return existing;
  } catch {
    const out = path.join(p.production, ".qa", `approved-${viewport}.png`);
    return captureHtml(html, out, viewport, { fullPage: false });
  }
}
