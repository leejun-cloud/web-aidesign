import { JSDOM } from "jsdom";

/**
 * 승인된 HTML 에서 design-tokens.css 를 추출한다 (PRD §21, §3.4).
 * DESIGN.md 를 보고 다시 디자인하지 않기 위해, 토큰은 **승인 HTML 이 진실**이다.
 */
export interface TokenSet {
  variables: Record<string, string>;
  fontFamilies: string[];
  breakpoints: string[];
}

const VAR_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;}]+)/g;

export function extractTokens(html: string): TokenSet {
  const dom = new JSDOM(html);
  const css = [...dom.window.document.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");

  const variables: Record<string, string> = {};
  // :root 블록을 우선 채우고, 그 밖의 선언은 덮어쓰지 않는다
  const rootBlocks = css.match(/:root[^{]*\{([\s\S]*?)\}/g) ?? [];
  const scan = (source: string) => {
    for (const m of source.matchAll(VAR_RE)) {
      const name = m[1];
      const value = m[2].trim();
      if (!(name in variables) && value) variables[name] = value;
    }
  };
  rootBlocks.forEach(scan);
  scan(css);

  const fontFamilies = [
    ...new Set(
      [...css.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((m) => m[1].trim().replace(/\s+/g, " ")),
    ),
  ];
  const breakpoints = [
    ...new Set([...css.matchAll(/@media[^{]*?\(\s*(?:min|max)-width\s*:\s*([^)]+)\)/g)].map((m) => m[1].trim())),
  ];

  return { variables, fontFamilies, breakpoints };
}

export function renderTokensCss(tokens: TokenSet): string {
  const entries = Object.entries(tokens.variables);
  const lines = entries.length
    ? entries.map(([k, v]) => `  ${k}: ${v};`).join("\n")
    : "  /* 승인 HTML 에서 CSS 커스텀 프로퍼티를 찾지 못했습니다 */";
  const meta = [
    tokens.fontFamilies.length ? `Font stacks:\n${tokens.fontFamilies.map((f) => ` - ${f}`).join("\n")}` : "",
    tokens.breakpoints.length ? `Breakpoints: ${tokens.breakpoints.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `/* design-tokens.css — approved-preview.html 에서 자동 추출
${meta}
   손으로 고치지 말고 승인 HTML 을 고친 뒤 다시 추출하라. */
:root {
${lines}
}
`;
}

export interface TokenAudit {
  ok: boolean;
  variableCount: number;
  /** 토큰 없이 하드코딩된 색상 — 값이 많으면 재현성이 깨진다 */
  hardcodedColors: string[];
}

export function auditTokens(html: string): TokenAudit {
  const tokens = extractTokens(html);
  const dom = new JSDOM(html);
  const css = [...dom.window.document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  const declared = new Set(Object.values(tokens.variables).map((v) => v.toLowerCase()));
  const used = [...css.matchAll(/(?:^|[\s:,(])(#[0-9a-fA-F]{3,8})\b/g)].map((m) => m[1].toLowerCase());
  const hardcoded = [...new Set(used.filter((c) => !declared.has(c)))];
  return {
    ok: Object.keys(tokens.variables).length >= 8 && hardcoded.length <= 6,
    variableCount: Object.keys(tokens.variables).length,
    hardcodedColors: hardcoded,
  };
}
