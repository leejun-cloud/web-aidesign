import { describe, expect, it } from "vitest";
import { REQUIRED_DESIGN_SECTIONS, auditDesignMd, designMdPrompt } from "@/lib/design/designMd";

const full = [
  "# DESIGN",
  "기준 우선순위: approved-preview.html > 스크린샷 > design-tokens.css > DESIGN.md",
  ...REQUIRED_DESIGN_SECTIONS.map((s) => `## ${s}\n${s} 에 대한 충분히 긴 구체적 설명 문장이다.`),
].join("\n\n");

describe("DESIGN.md 감사", () => {
  it("PRD §22 필수 16개 섹션을 모두 갖춘 문서는 통과한다", () => {
    const a = auditDesignMd(full);
    expect(a.ok).toBe(true);
    expect(a.missing).toEqual([]);
    expect(a.hasSourceOfTruth).toBe(true);
  });
  it("섹션이 빠지면 잡아낸다", () => {
    const a = auditDesignMd(full.replace("## Motion\n", "## 딴것\n"));
    expect(a.missing).toContain("Motion");
    expect(a.ok).toBe(false);
  });
  it("제목만 있는 빈 섹션을 잡아낸다", () => {
    const a = auditDesignMd(full.replace(/## Forms\n.+/, "## Forms\n"));
    expect(a.empty).toContain("Forms");
    expect(a.ok).toBe(false);
  });
  it("Don't 의 아포스트로피 변형을 같은 섹션으로 본다", () => {
    expect(auditDesignMd(full.replace("## Don't", "## Don’t")).missing).not.toContain("Don't");
  });
  it("승인 HTML 기준 명시가 없으면 표시한다", () => {
    expect(auditDesignMd(full.replace(/approved-preview\.html/g, "문서")).hasSourceOfTruth).toBe(false);
  });
});

describe("DESIGN.md 프롬프트", () => {
  it("재디자인 금지와 우선순위, 필수 섹션 전체를 실어보낸다", () => {
    const p = designMdPrompt({
      html: "<!doctype html><html></html>",
      tokens: { variables: { "--bg": "#000" }, fontFamilies: [], breakpoints: [] },
      visualDna: { mood: ["calm"] },
    });
    expect(p).toContain("새로 디자인하지 마라");
    expect(p).toContain("approved-preview.html");
    for (const s of REQUIRED_DESIGN_SECTIONS) expect(p).toContain(s);
  });
});
