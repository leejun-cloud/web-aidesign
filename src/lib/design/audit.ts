import path from "node:path";
import { runAgentJson } from "@/lib/ai/cli";
import { captureUrl, collectSiteFacts, type SiteFacts } from "@/lib/design/capture";
import {
  Evaluation,
  ScoreBreakdown,
  SimilarityReport,
  gapAnalysis,
  prioritize,
  type EvaluationReport,
  type Gap,
} from "@/lib/design/evaluate";
import { notesBlock, type Note } from "@/lib/design/notes";
import { measureSite, type Measurement } from "@/lib/design/measure";
import { WORKSPACE } from "@/lib/store";
import { AXES, SECTION_IDS } from "@/lib/types";

/** 실측 항목 → AI 세부 점수 항목 대응 (모순 검사 및 프롬프트 고정에 사용) */
export const MEASURE_TO_METRIC: Record<string, (keyof ScoreBreakdown)[]> = {
  headingStructure: ["visualHierarchy"],
  navSimplicity: ["navigation"],
  ctaFocus: ["conversion"],
  imageAccessibility: ["accessibility"],
  imageWeight: ["performance"],
  loadSpeed: ["performance"],
};

const BREAKDOWN_KEYS = Object.keys(ScoreBreakdown.shape) as (keyof ScoreBreakdown)[];

/** AI 가 평가해도 되는 영역 / 실측이 이미 끝난 영역을 프롬프트에서 갈라놓는다 (PRD §31) */
const SOURCE_SPLIT = `## 평가 출처 분리 (절대 규칙, PRD §31)
평가는 세 갈래다. 이 중 **측정 가능 항목은 이미 실측이 끝났다.**

### 1) 측정 가능 항목 — 이미 실측됨. 네가 판단할 영역이 아니다
아래 "실측 결과"의 숫자는 브라우저에서 직접 측정한 값이다. **그 숫자를 존중하고 절대 뒤집지 마라.**
- 실측 점수가 낮은 항목을 "좋다"고 쓰지 마라. 대응하는 세부 점수를 높게 주지 마라.
- 실측 점수가 60 미만인 항목의 대응 세부 점수는 반드시 60 미만으로 준다.
- 실측 관측치와 어긋나는 서술(예: alt 누락이 있는데 "접근성 양호")은 오류로 간주한다.

### 2) AI Visual Evaluation — 네가 평가할 영역
visual hierarchy, brand consistency, photography, typography, design cohesion.

### 3) UX Heuristic — 네가 평가할 영역
navigation, content clarity, CTA clarity, cognitive load, information density.

이 두 영역(2, 3) 외에는 새로운 판단을 만들어내지 마라.`;

const HONESTY = `## 서술 규칙
- 근거 없는 칭찬 금지. 추측 금지. **스크린샷과 사실 자료에서 실제로 관찰한 것만** 쓴다.
- 확인할 수 없는 항목은 좋게 쓰지 말고, 관찰된 범위 안에서만 보수적으로 적는다.
- 문안·로고·브랜드 고유 그래픽을 복제하거나 인용하지 않는다.`;

function factsBlock(facts: SiteFacts, label: string): string {
  const navs = facts.navLinks.map((l) => l.text).slice(0, 20).join(" / ") || "(없음)";
  const heads = facts.headings.slice(0, 20).map((h) => `h${h.level}: ${h.text}`).join("\n");
  const ctas = [...new Set(facts.ctaTexts)].slice(0, 25).join(" / ") || "(없음)";
  return `## ${label} 사실 자료
- URL: ${facts.url}
- title: ${facts.title}
- 로드 시간: ${facts.loadMs}ms
- 이미지: ${facts.imageCount}개 (alt 누락 ${facts.missingAlt}, 2400px 초과 ${facts.oversizedImages})
- 폰트: ${facts.fonts.slice(0, 8).join(", ")}
- 색: ${facts.colors.slice(0, 14).join(", ")}
- 상단 메뉴: ${navs}
- CTA 문구: ${ctas}
- 헤딩 구조:
${heads}
- 본문 발췌: ${facts.textSample.slice(0, 1800)}`;
}

function measurementBlock(measurements: Measurement[]): string {
  const rows = measurements
    .map((m) => {
      const metrics = MEASURE_TO_METRIC[m.key] ?? [];
      const link = metrics.length ? ` → 대응 세부 점수: ${metrics.join(", ")}` : "";
      return `- ${m.key} (${m.label}): ${m.score}/100 — 관측: ${m.observed} — ${m.note}${link}`;
    })
    .join("\n");
  const low = measurements.filter((m) => m.score < 60);
  const warn = low.length
    ? `\n\n실측 60 미만 항목: ${low
        .map((m) => `${m.key}(${m.score}) → ${(MEASURE_TO_METRIC[m.key] ?? []).join(",")}`)
        .join(" / ")}\n이 항목의 대응 세부 점수는 60 미만이어야 한다. 높게 주면 잘못된 평가다.`
    : "";
  return `## 실측 결과 (측정 완료 — 뒤집지 말 것)\n${rows}${warn}`;
}

function shotsBlock(shots: string[], label = "스크린샷"): string {
  if (!shots.length) return "";
  return `## ${label}\n${shots.map((s) => `- ${path.resolve(s)}`).join("\n")}`;
}

const BREAKDOWN_SPEC = `## 요구 출력: breakdown (12개 세부 점수, PRD §30)
아래 12개 키를 빠짐없이 0~100 정수로 채운다.
${BREAKDOWN_KEYS.map((k) => `- ${k}`).join("\n")}
total 은 12개 세부 점수를 종합한 총점(0~100)이다.`;

const CONTENT_SPEC = `## 요구 출력: 콘텐츠 구조 평가 (PRD §67)
- contentScore: 메시지 위계 / 카피 명확성 / 정보 밀도 / CTA 문구 품질을 종합한 0~100 정수
- contentIssues: 관찰된 콘텐츠 구조 문제 문자열 배열 (없으면 빈 배열)`;

const IMPROVEMENT_SPEC = `## 요구 출력: improvements (PRD §32, §68)
점수만 내지 말고 바로 실행 가능한 작업으로 바꿔라. 3~8개. 각 항목:
- title: 작업 제목
- impact: "HIGH" | "MEDIUM" | "LOW"
- metric: 이 작업이 끌어올리는 세부 점수 키 (위 12개 중 하나)
- sectionId: 수정 대상 섹션. 가능하면 다음 중 하나를 반드시 채운다 — ${SECTION_IDS.join(", ")}
- problem: 관찰된 문제 (실측/스크린샷 근거)
- fix: 구체적 수정 방법
최소 1개는 sectionId 를 가져야 한다.`;

/** 순수 함수 — UX Auditor 프롬프트 (PRD §62) */
export function buildEvaluationPrompt(args: {
  facts: SiteFacts;
  measurements: Measurement[];
  shots: string[];
  notes?: Note[];
}): string {
  return [
    "당신은 UX Auditor 다. 실제 운영 중인 웹사이트를 진단해 구조화 JSON 리포트를 만든다.",
    SOURCE_SPLIT,
    measurementBlock(args.measurements),
    factsBlock(args.facts, "평가 대상"),
    shotsBlock(args.shots, "스크린샷 (desktop / mobile)"),
    BREAKDOWN_SPEC,
    "## 요구 출력: 근거\n- visualNotes: AI Visual Evaluation 근거 문자열 배열 (1개 이상)\n- uxNotes: UX Heuristic 근거 문자열 배열 (1개 이상)",
    CONTENT_SPEC,
    IMPROVEMENT_SPEC,
    HONESTY,
    notesBlock(args.notes, ["evaluate", "content"]),
    `## JSON 형태\n{ "url": "${args.facts.url}", "total": 0, "breakdown": { ... }, "visualNotes": [], "uxNotes": [], "contentScore": 0, "contentIssues": [], "improvements": [] }`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 순수 함수 — 두 사이트 축별 유사도 프롬프트 (PRD §36, §37) */
export function buildComparisonPrompt(args: {
  ours: SiteFacts;
  reference: SiteFacts;
  ourShots: string[];
  refShots: string[];
}): string {
  return [
    "당신은 Design Comparator 다. 두 사이트의 스크린샷과 사실 자료를 비교해 축별 유사도를 0~100 정수로 산출한다.",
    factsBlock(args.ours, "우리 사이트(ours)"),
    factsBlock(args.reference, "Reference 사이트(reference)"),
    shotsBlock(args.ourShots, "우리 사이트 스크린샷"),
    shotsBlock(args.refShots, "Reference 스크린샷"),
    `## 요구 출력: 7축 유사도 (PRD §37)\naxes 에 아래 7개 축을 빠짐없이 0~100 정수로 채운다. 100 은 사실상 동일한 인상, 0 은 전혀 다른 인상이다.\n${AXES.map((a) => `- ${a}`).join("\n")}\noverall 은 7축을 종합한 전체 유사도(0~100)다.`,
    HONESTY,
    '## JSON 형태\n{ "overall": 0, "axes": { "layout": 0, "typography": 0, "photography": 0, "color": 0, "components": 0, "spacing": 0, "motion": 0 } }',
  ]
    .filter(Boolean)
    .join("\n\n");
}

function shotDir(url: string): string {
  const slug = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-").slice(0, 40);
  return path.join(WORKSPACE, "audit", `${slug}-${Date.now()}`);
}

interface AuditRun {
  report: EvaluationReport;
  facts: SiteFacts;
  shots: string[];
}

async function runAudit(url: string, opts: { model?: string; notes?: Note[] }): Promise<AuditRun> {
  const dir = shotDir(url);
  const [facts, desktop, mobile] = await Promise.all([
    collectSiteFacts(url),
    captureUrl(url, path.join(dir, "desktop.png"), "desktop"),
    captureUrl(url, path.join(dir, "mobile.png"), "mobile"),
  ]);
  const shots = [desktop, mobile];
  const { measurements, score: measuredScore } = measureSite(facts);

  const evaluation = await runAgentJson(Evaluation, {
    prompt: buildEvaluationPrompt({ notes: opts.notes, facts, measurements, shots }),
    images: shots,
    model: opts.model,
  });

  const report: EvaluationReport = {
    ...evaluation,
    url,
    improvements: prioritize(evaluation.improvements, evaluation.breakdown),
    measurements,
    measuredScore,
    measuredAt: new Date().toISOString(),
  };
  return { report, facts, shots };
}

/** URL 하나를 평가한다 — 실측 + AI 평가 합본 (PRD §29~§33) */
export async function evaluateSite(
  url: string,
  opts: { model?: string; notes?: Note[] } = {},
): Promise<EvaluationReport> {
  return (await runAudit(url, opts)).report;
}

export interface ComparisonResult {
  ours: EvaluationReport;
  reference: EvaluationReport;
  similarity: SimilarityReport;
  gaps: Gap[];
}

/** 두 사이트 비교 (PRD §36~§39) */
export async function compareSites(
  oursUrl: string,
  refUrl: string,
  opts: { model?: string; notes?: Note[] } = {},
): Promise<ComparisonResult> {
  const [a, b] = await Promise.all([runAudit(oursUrl, opts), runAudit(refUrl, opts)]);
  const similarity = await runAgentJson(SimilarityReport, {
    prompt: buildComparisonPrompt({
      ours: a.facts,
      reference: b.facts,
      ourShots: a.shots,
      refShots: b.shots,
    }),
    images: [...a.shots, ...b.shots],
    model: opts.model,
  });
  return {
    ours: a.report,
    reference: b.report,
    similarity,
    gaps: gapAnalysis(a.report.breakdown, b.report.breakdown),
  };
}

/** 실측치와 AI 세부 점수가 모순되는 건수 (검증용) */
export function contradictions(report: EvaluationReport): {
  measureKey: string;
  metric: string;
  measured: number;
  given: number;
}[] {
  const out: { measureKey: string; metric: string; measured: number; given: number }[] = [];
  for (const m of report.measurements) {
    if (m.score >= 60) continue;
    for (const metric of MEASURE_TO_METRIC[m.key] ?? []) {
      const given = report.breakdown[metric];
      if (given >= 90) out.push({ measureKey: m.key, metric, measured: m.score, given });
    }
  }
  return out;
}
