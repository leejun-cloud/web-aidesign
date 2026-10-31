import path from "node:path";
import { runAgent } from "@/lib/ai/cli";
import { captureHtml } from "@/lib/design/capture";
import { GENERATION_RULES, similarityInstruction } from "@/lib/design/rules";
import { auditSections, type SectionAudit } from "@/lib/design/sections";
import { notesBlock } from "@/lib/design/notes";
import { auditTokens, type TokenAudit } from "@/lib/design/tokens";
import { COPYRIGHT_GUARD } from "@/lib/design/visualDna";
import { SECTION_IDS, type DesignBrief, type VisualDna } from "@/lib/types";

/** 생성 HTML 이 실제로 세 뷰포트에서 깨지지 않게 하는 추가 지시 (PRD §13 보강) */
const VIEWPORT_RULES = `## 가로 스크롤 금지 (필수)
- 390 / 834 / 1440 어느 폭에서도 \`document.documentElement.scrollWidth\` 가 \`window.innerWidth\` 를 넘지 않아야 한다.
- \`*, *::before, *::after { box-sizing: border-box; }\` 와 \`html, body { max-width: 100%; overflow-x: hidden; }\` 를 선언한다.
- 고정 px 폭 대신 \`max-width\` + \`width: 100%\` 를 쓴다. \`100vw\` 로 폭을 잡지 않는다(스크롤바 때문에 넘친다).
- 이미지/미디어에 \`max-width: 100%; height: auto;\` 를 준다. 긴 단어는 \`overflow-wrap: anywhere\` 로 감싼다.
- 음수 margin, 화면 밖으로 나가는 장식 요소, 가로 스크롤 캐러셀은 쓰지 않는다.`;

export interface GenerateArgs {
  brief: DesignBrief;
  visualDna: VisualDna;
}

/** 순수 함수 — Design Generator 프롬프트 조립 (PRD §62) */
export function buildGeneratePrompt(args: GenerateArgs & { feedback?: string }): string {
  const { brief, visualDna, feedback } = args;
  return [
    "당신은 Design Generator 다. 아래 Visual DNA 스펙을 코드로 재현해 랜딩페이지 HTML Preview 한 장을 만든다.",
    `## Visual DNA (이 스펙대로 CSS 를 작성한다)\n\`\`\`json\n${JSON.stringify(visualDna, null, 2)}\n\`\`\``,
    [
      "## 색상 (그대로 옮긴다)",
      "visualDna.color 의 hex 값을 추측하거나 보정하지 말고 :root CSS 변수로 그대로 선언한다:",
      `- --color-background: ${visualDna.color.background}`,
      `- --color-surface: ${visualDna.color.surface}`,
      `- --color-primary: ${visualDna.color.primary}`,
      `- --color-secondary: ${visualDna.color.secondary}`,
      `- --color-accent: ${visualDna.color.accent}`,
      `- --color-text: ${visualDna.color.text}`,
      `채도/색온도 지침: ${visualDna.color.saturation} / ${visualDna.color.temperature}`,
    ].join("\n"),
    [
      "## 섹션 순서 (정본)",
      `visualDna.layout.sectionOrder 가 섹션을 위에서 아래로 배치하는 정본이다: ${visualDna.layout.sectionOrder.join(" → ")}`,
      "이 순서를 지키되, 각 섹션에 붙이는 `data-vdna-id` 는 아래 허용값 중 성격이 가장 가까운 것으로 매핑한다.",
      `허용값: ${SECTION_IDS.join(", ")}`,
      "허용값에 매핑할 수 없는 항목은 인접한 허용 섹션에 합치고, 같은 id 를 두 번 쓰지 않는다.",
    ].join("\n"),
    similarityInstruction(brief.advanced),
    brief.brandBrief ? `## 브랜드 브리프 (콘텐츠 방향)\n${brief.brandBrief}\n카피와 섹션 내용은 이 브리프를 따르고, Reference 의 문안을 베끼지 않는다.` : "",
    GENERATION_RULES,
    VIEWPORT_RULES,
    COPYRIGHT_GUARD,
    // 사용자가 직접 남긴 요청은 규칙 뒤에 둔다 — 뒤에 오는 지시가 더 강하게 읽힌다
    notesBlock(brief.notes, ["design", "content"]),
    feedback ? `## 직전 시도가 검증을 통과하지 못했다\n${feedback}\n같은 스펙으로 이 문제만 고쳐 전체 HTML 을 다시 출력하라.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** audit 결과를 재생성 프롬프트용 오류 목록으로 변환 */
export function auditFeedback(audit: SectionAudit): string {
  const lines: string[] = [];
  if (audit.duplicates.length) lines.push(`- 중복된 data-vdna-id: ${audit.duplicates.join(", ")} (각 id 는 한 번만)`);
  if (audit.unknown.length) lines.push(`- 허용되지 않는 data-vdna-id: ${audit.unknown.join(", ")} (허용값: ${SECTION_IDS.join(", ")})`);
  if (audit.missingRequired.length) lines.push(`- 필수 섹션 누락: ${audit.missingRequired.join(", ")}`);
  if (!lines.length) lines.push("- 원인 불명 (섹션 검사 실패)");
  lines.push(`- 직전 결과에서 발견된 id 목록: ${audit.found.join(", ") || "(없음)"}`);
  return lines.join("\n");
}

/** 토큰을 우회한 하드코딩 색상을 재생성 프롬프트용 오류로 변환 (PRD §79 재현성) */
export function tokenFeedback(t: TokenAudit): string {
  const lines: string[] = [];
  if (t.variableCount < 8) {
    lines.push(`- :root 의 CSS 커스텀 프로퍼티가 ${t.variableCount}개뿐이다. 색·간격·타이포를 토큰으로 선언하라.`);
  }
  if (t.hardcodedColors.length) {
    lines.push(
      `- 토큰을 우회한 하드코딩 색상 ${t.hardcodedColors.length}개: ${t.hardcodedColors.join(", ")}`,
      "  이 값들을 :root 의 변수로 선언하고 사용처는 var(--...) 로 바꿔라. 그라데이션 정지점과 장식 색도 예외가 아니다.",
    );
  }
  return lines.join("\n");
}

/** 에이전트 응답에서 HTML 문서만 추출 */
export function carveHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<!DOCTYPE html|<html/);
  if (start === -1) throw new Error("응답에 HTML 문서가 없습니다");
  const end = body.lastIndexOf("</html>");
  return (end === -1 ? body.slice(start) : body.slice(start, end + 7)).trim();
}

export interface GenerateResult {
  html: string;
  audit: SectionAudit;
  tokens: TokenAudit;
  attempts: number;
}

const MAX_ATTEMPTS = 3; // 최초 1회 + 재생성 최대 2회

/** PRD §62 — HTML Preview 생성 + 섹션 무결성 자동 재시도 */
export async function generatePreview(args: GenerateArgs & { model?: string }): Promise<GenerateResult> {
  let feedback: string | undefined;
  let last: GenerateResult | null = null;

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let html: string;
    try {
      const raw = await runAgent({
        prompt: buildGeneratePrompt({ ...args, feedback }),
        model: args.model,
        timeoutMs: 20 * 60 * 1000,
      });
      html = carveHtml(raw);
    } catch (e) {
      // 에이전트 호출은 간헐적으로 실패한다 — 남은 시도를 쓴다
      lastError = (e as Error).message;
      feedback = `- 직전 시도가 HTML 을 만들지 못했다: ${lastError}`;
      continue;
    }
    const audit = auditSections(html);
    const tokens = auditTokens(html);
    last = { html, audit, tokens, attempts: attempt };
    if (audit.ok && tokens.ok) return last;
    // 섹션 무결성과 토큰 재현성을 함께 게이트한다
    feedback = [audit.ok ? "" : auditFeedback(audit), tokens.ok ? "" : tokenFeedback(tokens)]
      .filter(Boolean)
      .join("\n");
  }
  if (!last) throw new Error(`HTML 생성 실패: ${lastError}`);
  return last;
}

export interface RefineArgs {
  html: string;
  brief: DesignBrief;
  visualDna: VisualDna;
  /** Reference 스크린샷 절대 경로 */
  shots: string[];
  /** 캡처 파일을 둘 디렉터리 */
  outDir?: string;
  /** 비평·수정 라운드 수 (기본 2, PRD §63 MVP 상한) */
  maxRounds?: number;
  model?: string;
}

const MAX_REFINE = 2;

/** PRD §63 — 자동 Visual Refinement: 자기 스크린샷을 Reference 와 대조해 스스로 고친다 */
export async function refinePreview(args: RefineArgs): Promise<GenerateResult> {
  const outDir = args.outDir ?? path.join(process.cwd(), ".refine");
  let html = args.html;
  let audit = auditSections(html);
  let attempts = 0;

  const rounds = Math.min(args.maxRounds ?? MAX_REFINE, MAX_REFINE);
  for (let round = 1; round <= rounds; round++) {
    const own: string[] = [];
    for (const vp of ["desktop", "mobile"] as const) {
      // 뷰포트 크기로만 찍는다 — fullPage 는 수 MB 가 되어 에이전트가 읽지 못한다
      own.push(await captureHtml(html, path.join(outDir, `refine-r${round}-${vp}.png`), vp, { fullPage: false }));
    }

    const prompt = [
      "당신은 Design Critic 이다. 첨부 이미지에는 (1) Reference 스크린샷과 (2) 지금 만든 페이지의 desktop/mobile 스크린샷이 함께 들어 있다.",
      "두 쪽을 나란히 대조해, 만든 페이지가 Visual DNA 스펙과 Reference 의 디자인 특성에서 어긋난 지점을 찾아 고쳐라.",
      `## 내 페이지 스크린샷\n${own.map((p) => `- ${p}`).join("\n")}`,
      `## Reference 스크린샷\n${args.shots.map((p) => `- ${p}`).join("\n")}`,
      "## 특히 볼 것\n- 여백/섹션 리듬이 Reference 보다 답답하거나 헐렁하지 않은가\n- 타이포 위계(크기 점프, 굵기, 자간)가 Reference 의 인상과 어긋나지 않는가\n- 색 사용 비율(배경 대비 accent 면적)이 과하거나 부족하지 않은가\n- 모바일에서 겹침·잘림·가로 스크롤이 없는가\n- 컴포넌트(버튼/카드) 형태와 그림자·라운드가 스펙과 맞는가",
      `## Visual DNA\n\`\`\`json\n${JSON.stringify(args.visualDna, null, 2)}\n\`\`\``,
      similarityInstruction(args.brief.advanced),
      "## 고칠 HTML\n아래 HTML 을 기준으로 수정한다. 섹션 구조와 `data-vdna-id` 는 유지한다.\n```html\n" + html + "\n```",
      GENERATION_RULES,
      VIEWPORT_RULES,
      COPYRIGHT_GUARD,
    ].join("\n\n");

    attempts = round;
    let next: string;
    try {
      const raw = await runAgent({
        prompt,
        images: [...own, ...args.shots],
        model: args.model,
        timeoutMs: 20 * 60 * 1000,
      });
      next = carveHtml(raw);
    } catch {
      // 타임아웃이거나 비평만 하고 HTML 을 안 준 경우 — 직전 결과를 그대로 유지한다
      break;
    }
    const nextAudit = auditSections(next);
    if (!nextAudit.ok && audit.ok) break; // 개선이 아니라 퇴행 — 되돌린다
    html = next;
    audit = nextAudit;
  }

  return { html, audit, tokens: auditTokens(html), attempts };
}
