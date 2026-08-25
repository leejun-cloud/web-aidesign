import { JSDOM } from "jsdom";
import { SECTION_IDS, type SectionId } from "@/lib/types";

const SELECTOR = "[data-vdna-id]";

export function parseSections(html: string): string[] {
  const dom = new JSDOM(html);
  return [...dom.window.document.querySelectorAll(SELECTOR)].map(
    (el) => el.getAttribute("data-vdna-id") ?? "",
  );
}

export interface SectionAudit {
  ok: boolean;
  found: string[];
  duplicates: string[];
  unknown: string[];
  missingRequired: string[];
}

/** PRD §64 — 생성 HTML 의 섹션 식별자 무결성 검사 */
export function auditSections(html: string, required: SectionId[] = ["header", "hero", "footer"]): SectionAudit {
  const found = parseSections(html);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of found) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const known = new Set<string>(SECTION_IDS);
  const unknown = [...seen].filter((id) => !known.has(id));
  const missingRequired = required.filter((id) => !seen.has(id));
  return {
    ok: duplicates.length === 0 && unknown.length === 0 && missingRequired.length === 0 && found.every(Boolean),
    found,
    duplicates,
    unknown,
    missingRequired,
  };
}

export function extractSection(html: string, id: string): string {
  const dom = new JSDOM(html);
  const el = dom.window.document.querySelector(`[data-vdna-id="${id}"]`);
  if (!el) throw new Error(`섹션 없음: ${id}`);
  return el.outerHTML;
}

/** 선택 섹션만 교체 — 나머지 DOM 은 손대지 않는다 (PRD §17, §65) */
export function replaceSection(html: string, id: string, replacement: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const el = doc.querySelector(`[data-vdna-id="${id}"]`);
  if (!el) throw new Error(`섹션 없음: ${id}`);
  const frag = doc.createElement("div");
  frag.innerHTML = replacement.trim();
  const next = frag.firstElementChild;
  if (!next) throw new Error("교체할 요소를 파싱할 수 없습니다");
  if (next.getAttribute("data-vdna-id") !== id) next.setAttribute("data-vdna-id", id);
  el.replaceWith(next);
  return dom.serialize();
}

/** 비선택 섹션이 정말 그대로인지 확인 — Step 4 검증 게이트의 핵심 */
export function changedSections(before: string, after: string): string[] {
  const map = (html: string) => {
    const dom = new JSDOM(html);
    const m = new Map<string, string>();
    for (const el of dom.window.document.querySelectorAll(SELECTOR)) {
      m.set(el.getAttribute("data-vdna-id") ?? "", el.outerHTML);
    }
    return m;
  };
  const a = map(before);
  const b = map(after);
  const ids = new Set([...a.keys(), ...b.keys()]);
  return [...ids].filter((id) => a.get(id) !== b.get(id));
}
