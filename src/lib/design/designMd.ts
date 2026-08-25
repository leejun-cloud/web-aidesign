import type { TokenSet } from "@/lib/design/tokens";

/** PRD §22 — DESIGN.md 필수 섹션. 하나라도 빠지면 확정 산출물로 인정하지 않는다. */
export const REQUIRED_DESIGN_SECTIONS = [
  "Design Direction",
  "Color System",
  "Typography",
  "Spacing",
  "Layout",
  "Grid",
  "Photography",
  "Components",
  "Navigation",
  "Buttons",
  "Forms",
  "Cards",
  "Motion",
  "Responsive",
  "Do",
  "Don't",
] as const;

export interface DesignMdAudit {
  ok: boolean;
  missing: string[];
  /** 내용 없이 제목만 있는 섹션 */
  empty: string[];
  /** 승인 HTML 이 진실임을 명시했는가 (PRD §3.4) */
  hasSourceOfTruth: boolean;
}

function sectionBodies(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = md.split("\n");
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) out.set(current, buf.join("\n").trim());
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m) {
      flush();
      current = m[1].trim();
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

export function auditDesignMd(md: string): DesignMdAudit {
  const bodies = sectionBodies(md);
  const keys = [...bodies.keys()];
  const findKey = (name: string) =>
    keys.find((k) => k.toLowerCase().replace(/[’']/g, "'") === name.toLowerCase().replace(/[’']/g, "'"));

  const missing: string[] = [];
  const empty: string[] = [];
  for (const name of REQUIRED_DESIGN_SECTIONS) {
    const key = findKey(name);
    if (!key) missing.push(name);
    else if ((bodies.get(key) ?? "").length < 12) empty.push(name);
  }
  return {
    ok: missing.length === 0 && empty.length === 0,
    missing,
    empty,
    hasSourceOfTruth: /approved-preview\.html/.test(md),
  };
}

/** Design Generator 에게 DESIGN.md 를 쓰게 하는 프롬프트 (PRD §3.4, §22) */
export function designMdPrompt(args: { html: string; tokens: TokenSet; visualDna: unknown }): string {
  return `너는 Design Director 다. 아래 **승인된 HTML** 을 읽고 이 디자인을 재현하기 위한 \`DESIGN.md\` 를 작성하라.

## 절대 원칙
- 새로 디자인하지 마라. 승인 HTML 에 **이미 있는 것**을 기술하는 문서다.
- 우선순위: approved-preview.html > 스크린샷 > design-tokens.css > DESIGN.md. 문서 안에 이 순서를 명시하고, \`approved-preview.html\` 이 유일한 진실임을 적어라.
- 추측한 수치를 쓰지 마라. 값은 아래 토큰과 HTML 에서 실제로 읽은 것만 쓴다.

## 필수 섹션 (\`## 제목\` 으로, 이 순서대로, 하나도 빠뜨리지 말 것)
${REQUIRED_DESIGN_SECTIONS.map((s) => `- ${s}`).join("\n")}

각 섹션은 최소 2~5줄의 구체적 내용을 담아야 한다. 제목만 있는 빈 섹션은 실패로 간주된다.
\`Do\` / \`Don't\` 는 이 디자인을 다른 페이지로 확장할 때의 실행 규칙을 각각 4개 이상 나열하라.

## 추출된 Design Token
\`\`\`json
${JSON.stringify(args.tokens, null, 2)}
\`\`\`

## Visual DNA
\`\`\`json
${JSON.stringify(args.visualDna, null, 2)}
\`\`\`

## 승인된 HTML
\`\`\`html
${args.html.slice(0, 120_000)}
\`\`\`

Markdown 본문만 출력하라. 코드펜스로 전체를 감싸지 마라.`;
}
