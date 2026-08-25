import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "@/lib/store";
import { auditDesignMd } from "@/lib/design/designMd";
import { auditSections } from "@/lib/design/sections";
import { auditTokens } from "@/lib/design/tokens";

/** PRD §21 — 디자인 확정 시 /design 에 반드시 생성되는 산출물 */
export const APPROVED_FILES = [
  "approved-preview.html",
  "approved-desktop.png",
  "approved-mobile.png",
  "DESIGN.md",
  "design-tokens.css",
  "visual-dna.json",
] as const;
export type ApprovedFile = (typeof APPROVED_FILES)[number];

/** PRD §3.4 — 확정 이후 기준 우선순위. 이 순서가 곧 진실의 순서다. */
export const SOURCE_OF_TRUTH_ORDER: readonly string[] = [
  "approved-preview.html",
  "approved-desktop.png",
  "approved-mobile.png",
  "design-tokens.css",
  "DESIGN.md",
];

export interface ApprovalAudit {
  ok: boolean
  missingFiles: string[];
  emptyFiles: string[];
  sections: ReturnType<typeof auditSections>;
  tokens: ReturnType<typeof auditTokens>;
  designMd: ReturnType<typeof auditDesignMd>;
}

/**
 * 확정 산출물이 정말 쓸 수 있는 상태인지 검사한다.
 * 파일이 있다는 것만으로는 통과시키지 않는다 — 내용까지 본다.
 */
export async function auditApproval(projectId: string): Promise<ApprovalAudit> {
  const dir = paths(projectId).design;

  const missingFiles: string[] = [];
  const emptyFiles: string[] = [];
  for (const f of APPROVED_FILES) {
    try {
      const st = await fs.stat(path.join(dir, f));
      // 스크린샷은 20KB, 텍스트 산출물은 200B 미만이면 내용이 없는 것으로 본다
      const floor = f.endsWith(".png") ? 20_000 : 200;
      if (st.size < floor) emptyFiles.push(f);
    } catch {
      missingFiles.push(f);
    }
  }

  const read = async (f: string) => {
    try {
      return await fs.readFile(path.join(dir, f), "utf8");
    } catch {
      return "";
    }
  };
  const html = await read("approved-preview.html");
  const md = await read("DESIGN.md");

  const sections = auditSections(html);
  const tokens = auditTokens(html);
  const designMd = auditDesignMd(md);

  return {
    ok:
      missingFiles.length === 0 &&
      emptyFiles.length === 0 &&
      sections.ok &&
      tokens.ok &&
      designMd.ok,
    missingFiles,
    emptyFiles,
    sections,
    tokens,
    designMd,
  };
}

/** DESIGN.md 머리에 붙여 확정본의 기준 순서를 문서 자체에 못박는다 */
export function sourceOfTruthBlock(): string {
  return `> **기준 우선순위 (PRD §3.4)**
${SOURCE_OF_TRUTH_ORDER.map((f, i) => `> ${i + 1}. \`${f}\``).join("\n")}
>
> 이 문서만 보고 새로 디자인하지 마라. 수치가 어긋나면 \`approved-preview.html\` 이 맞다.
`;
}
