import { describe, expect, it } from "vitest";
import { SectionEditRequest, allowedFor, buildSectionEditPrompt, enforceLock } from "@/lib/design/sectionEdit";
import { extractSection } from "@/lib/design/sections";

const base = `<!doctype html><html><head><style>:root{--bg:#000}</style></head><body>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="hero"><h1>Old</h1><a>CTA1</a><a>CTA2</a></section>
<section data-vdna-id="services"><h2>Services</h2></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;

const req = SectionEditRequest.parse({
  projectId: "p1",
  sectionId: "hero",
  instruction: "CTA 버튼을 하나만 남겨줘",
});

describe("섹션 수정 프롬프트 (PRD §16~§19, §65)", () => {
  it("Lock 표를 만들어 대상만 EDIT 로 표시한다", () => {
    const p = buildSectionEditPrompt({
      req,
      sectionHtml: extractSection(base, "hero"),
      allSectionIds: ["header", "hero", "services", "footer"],
    });
    expect(p).toMatch(/hero\s+EDIT/);
    expect(p).toMatch(/services\s+LOCK/);
    expect(p).toMatch(/footer\s+LOCK/);
  });
  it("전역 선택자 금지와 스코프 규칙을 명시한다", () => {
    const p = buildSectionEditPrompt({ req, sectionHtml: "<section></section>", allSectionIds: ["hero"] });
    expect(p).toContain("전역 선택자");
    expect(p).toContain('[data-vdna-id="hero"]');
  });
  it("섹션 하나만 출력하도록 요구한다", () => {
    const p = buildSectionEditPrompt({ req, sectionHtml: "<section></section>", allSectionIds: ["hero"] });
    expect(p).toContain("수정된 섹션 요소 하나만");
    expect(p).toContain("페이지 전체나");
  });
  it("첨부 이미지 역할별로 지시문이 달라진다 (PRD §19)", () => {
    const mk = (imageRole: string) =>
      buildSectionEditPrompt({
        req: SectionEditRequest.parse({ ...req, images: ["/tmp/a.png"], imageRole }),
        sectionHtml: "<section></section>",
        allSectionIds: ["hero"],
      });
    expect(mk("layout")).toContain("레이아웃**만 참고");
    expect(mk("photo")).toContain("사진**만 참고");
    expect(mk("typography")).toContain("Typography** 만 참고");
    expect(mk("overall")).toContain("전체 스타일**");
  });
  it("이미지가 없으면 첨부 블록을 넣지 않는다", () => {
    const p = buildSectionEditPrompt({ req, sectionHtml: "<section></section>", allSectionIds: ["hero"] });
    expect(p).not.toContain("첨부 참고 이미지");
  });
  it("기본 imageRole 은 전체 스타일이다", () => {
    expect(SectionEditRequest.parse({ projectId: "p", sectionId: "hero", instruction: "x" }).imageRole).toBe("overall");
  });
  it("기본 scope 는 선택 영역만이다", () => {
    expect(SectionEditRequest.parse({ projectId: "p", sectionId: "hero", instruction: "x" }).scope).toBe("selected-only");
  });
  it("표준 목록에 없는 섹션 id 는 거부한다", () => {
    expect(SectionEditRequest.safeParse({ projectId: "p", sectionId: "whatever", instruction: "x" }).success).toBe(false);
  });
});

describe("Lock 강제 — 프롬프트를 믿지 않는다 (PRD §17)", () => {
  it("허용 섹션만 바뀐 결과는 그대로 통과시킨다", () => {
    const after = base.replace("<h1>Old</h1>", "<h1>New</h1>");
    const r = enforceLock(base, after, ["hero"]);
    expect(r.changed).toEqual(["hero"]);
    expect(r.reverted).toEqual([]);
    expect(r.html).toContain("New");
  });

  it("AI 가 다른 섹션을 건드리면 그 섹션만 되돌린다", () => {
    const after = base
      .replace("<h1>Old</h1>", "<h1>New</h1>")
      .replace("<h2>Services</h2>", "<h2>침범됨</h2>")
      .replace("<footer data-vdna-id=\"footer\">f</footer>", '<footer data-vdna-id="footer">침범됨</footer>');
    const r = enforceLock(base, after, ["hero"]);
    expect(r.reverted.sort()).toEqual(["footer", "services"]);
    expect(r.changed).toEqual(["hero"]);
    expect(extractSection(r.html, "services")).toBe(extractSection(base, "services"));
    expect(extractSection(r.html, "footer")).toBe(extractSection(base, "footer"));
    expect(r.html).toContain("New");
  });

  it("섹션을 지워버리면 구조 위반으로 전체를 되돌린다", () => {
    const after = base.replace('<section data-vdna-id="services"><h2>Services</h2></section>', "");
    const r = enforceLock(base, after, ["hero"]);
    expect(r.structuralViolation).toBe(true);
    expect(r.html).toBe(base);
  });

  it("섹션을 새로 추가해도 구조 위반이다", () => {
    const after = base.replace("</body>", '<section data-vdna-id="cta">new</section></body>');
    expect(enforceLock(base, after, ["hero"]).structuralViolation).toBe(true);
  });

  it("섹션 순서를 뒤바꾸면 구조 위반이다", () => {
    const after = `<!doctype html><html><body>
<section data-vdna-id="hero"><h1>Old</h1></section>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="services"><h2>Services</h2></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;
    expect(enforceLock(base, after, ["hero"]).structuralViolation).toBe(true);
  });

  it("관련 영역 허용 모드에서는 열어준 섹션까지 통과한다", () => {
    const r2 = SectionEditRequest.parse({ ...req, scope: "allow-related" });
    const allowed = allowedFor(r2, ["header"]);
    expect(allowed).toEqual(["hero", "header"]);
    const after = base
      .replace("<h1>Old</h1>", "<h1>New</h1>")
      .replace("<nav>menu</nav>", "<nav>menu2</nav>");
    const r = enforceLock(base, after, allowed);
    expect(r.reverted).toEqual([]);
    expect(r.changed.sort()).toEqual(["header", "hero"]);
  });

  it("선택 영역만 모드는 관련 섹션을 열어주지 않는다", () => {
    expect(allowedFor(req, ["header"])).toEqual(["hero"]);
  });

  it("아무것도 바뀌지 않았으면 changed 가 비어 있다", () => {
    const r = enforceLock(base, base, ["hero"]);
    expect(r.changed).toEqual([]);
    expect(r.reverted).toEqual([]);
  });
});

// --- 회귀 테스트: 스코프 선택자를 섹션으로 오인하던 버그 ---
describe("스코프 선택자 오인 방지 (실측에서 발견된 버그)", () => {
  const scoped = `<!doctype html><html><head><style>
[data-vdna-id="hero"] .title{font-size:3rem}
[data-vdna-id="hero"] img{opacity:0}
</style></head><body>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="hero"><h1 class="title">Old</h1><img alt="x"/></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;

  it("style 안의 [data-vdna-id=...] 는 섹션으로 세지 않는다", () => {
    const after = scoped.replace("<h1 class=\"title\">Old</h1>", '<h1 class="title">New</h1>');
    const r = enforceLock(scoped, after, ["hero"]);
    expect(r.structuralViolation).toBe(false);
    expect(r.changed).toEqual(["hero"]);
  });

  it("섹션 안에 스코프 style/script 를 추가해도 구조 위반이 아니다", () => {
    const after = scoped.replace(
      '<section data-vdna-id="hero">',
      '<section data-vdna-id="hero"><style>[data-vdna-id="hero"] img{transform:scale(1.02)}</style>',
    );
    const r = enforceLock(scoped, after, ["hero"]);
    expect(r.structuralViolation).toBe(false);
    expect(r.changed).toEqual(["hero"]);
  });

  it("스코프 선택자가 있어도 실제 섹션 삭제는 여전히 잡는다", () => {
    const after = scoped.replace('<footer data-vdna-id="footer">f</footer>', "");
    expect(enforceLock(scoped, after, ["hero"]).structuralViolation).toBe(true);
  });
});
