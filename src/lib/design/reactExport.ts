import { JSDOM } from "jsdom";

/** style="a: b; c: d" → React style 객체 리터럴 */
function styleAttrToObject(value: string): string {
  const entries = value
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(":");
      if (idx === -1) return null;
      const prop = d.slice(0, idx).trim();
      const val = d.slice(idx + 1).trim();
      const camel = prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `${JSON.stringify(camel)}: ${JSON.stringify(val)}`;
    })
    .filter((x): x is string => x !== null);
  return `{{${entries.join(", ")}}}`;
}

/** HTML 속성명 → JSX 속성명 (자주 쓰는 것만 — 나머지는 그대로 둔다. React 는 알려지지 않은 속성도 그대로 렌더한다) */
const ATTR_RENAME: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  autoplay: "autoPlay",
  autofocus: "autoFocus",
  allowfullscreen: "allowFullScreen",
  frameborder: "frameBorder",
  contenteditable: "contentEditable",
};

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function escapeJsxText(text: string): string {
  // JSX 텍스트에서 특수한 의미를 갖는 { } 만 표현식으로 감싸 이스케이프한다
  return text.replace(/[{}]/g, (c) => `{${JSON.stringify(c)}}`);
}

function attrsToJsx(el: Element): string {
  const parts: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === "style") {
      parts.push(`style=${styleAttrToObject(attr.value)}`);
      continue;
    }
    const jsxName = ATTR_RENAME[name] ?? (name.startsWith("data-") || name.startsWith("aria-") ? name : name);
    if (attr.value === "") parts.push(jsxName);
    else parts.push(`${jsxName}=${JSON.stringify(attr.value)}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function nodeToJsx(node: Node, depth: number): string {
  const pad = "  ".repeat(depth);
  if (node.nodeType === 8) return ""; // 주석은 버린다 — JSX 주석 문법이 다르다
  if (node.nodeType === 3) {
    const text = (node.textContent ?? "").trim();
    return text ? `${pad}${escapeJsxText(text)}\n` : "";
  }
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === "script") return ""; // 인라인 스크립트는 React 컴포넌트에 그대로 옮길 수 없다

  if (tag === "style") {
    return `${pad}<style>{\`${(el.textContent ?? "").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`}</style>\n`;
  }

  const attrs = attrsToJsx(el);
  if (VOID_TAGS.has(tag)) return `${pad}<${tag}${attrs} />\n`;

  const children = Array.from(el.childNodes)
    .map((c) => nodeToJsx(c, depth + 1))
    .join("");
  if (!children.trim()) return `${pad}<${tag}${attrs} />\n`;
  return `${pad}<${tag}${attrs}>\n${children}${pad}</${tag}>\n`;
}

export interface ReactExportResult {
  componentName: string;
  code: string;
}

/**
 * 생성된 전체 HTML 문서를 단일 React 컴포넌트(.tsx)로 변환한다.
 * head 의 <style> 은 컴포넌트 안으로, body 는 JSX 트리로 옮긴다.
 * AI 를 쓰지 않는 순수 코드 변환이라 배포 환경에서도 그대로 동작한다.
 */
export function htmlToReactComponent(html: string, componentName = "GeneratedPage"): ReactExportResult {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const headStyles = Array.from(doc.querySelectorAll("head style"));
  const body = doc.body;

  const styleJsx = headStyles
    .map((s) => nodeToJsx(s, 1))
    .join("");
  const bodyJsx = Array.from(body.childNodes)
    .map((c) => nodeToJsx(c, 2))
    .join("");

  const code = `// ${componentName}.tsx
// VisualDNA Studio 가 생성한 HTML 을 React 컴포넌트로 변환한 결과입니다.
// 인라인 <script> 태그는 React 와 직접 호환되지 않아 제거되었습니다 — 동작이 필요하면 useEffect 로 옮기세요.
export default function ${componentName}() {
  return (
    <>
${styleJsx}      <div className="vdna-root">
${bodyJsx}      </div>
    </>
  );
}
`;
  return { componentName, code };
}
