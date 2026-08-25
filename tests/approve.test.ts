import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REQUIRED_DESIGN_SECTIONS } from "@/lib/design/designMd";

const ws = path.join(os.tmpdir(), `vdna-approve-${process.pid}`);
process.env.VDNA_WORKSPACE = ws;

// store.ts 가 모듈 로드 시점에 WORKSPACE 를 굳히므로 env 설정 후 동적 import 한다
const { APPROVED_FILES, SOURCE_OF_TRUTH_ORDER, auditApproval, sourceOfTruthBlock } = await import(
  "@/lib/design/approve"
);
const { paths, ensureProject } = await import("@/lib/store");

const PROJECT = "approve-test";
const goodHtml = `<!doctype html><html><head><style>
:root{--bg:#0b0b0c;--surface:#141416;--primary:#1f6feb;--secondary:#8b949e;--accent:#f0883e;
--text:#e6edf3;--space-section:120px;--space-container:24px;--radius:14px}
body{background:var(--bg);color:var(--text)}
</style></head><body>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="hero"><h1>Hero</h1></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;

const goodMd = [
  sourceOfTruthBlock(),
  ...REQUIRED_DESIGN_SECTIONS.map((s) => `## ${s}\n${s} 에 대한 충분히 구체적인 설명 문장이다.`),
].join("\n\n");

const png = (kb: number) => Buffer.alloc(kb * 1024, 1);

// 실제 산출물 규모의 픽스처 — 껍데기 파일 검사를 의미 있게 만든다
const tokensCss = `/* design-tokens.css — approved-preview.html 에서 자동 추출
   손으로 고치지 말고 승인 HTML 을 고친 뒤 다시 추출하라. */
:root {
  --bg: #0b0b0c;
  --surface: #141416;
  --primary: #1f6feb;
  --secondary: #8b949e;
  --accent: #f0883e;
  --text: #e6edf3;
  --space-section: 120px;
  --space-container: 24px;
  --radius: 14px;
}
`;

const visualDnaFixture = {
  mood: ["premium", "calm", "human centered"],
  layout: { heroStructure: "large editorial hero", grid: "12 column", containerWidth: "1200px",
    sectionOrder: ["header", "hero", "trust", "services", "footer"], contentAlignment: "left",
    imagePlacement: "full bleed right", header: "transparent over hero" },
  typography: { fontPersonality: "geometric sans", headingScale: "clamp(2.5rem, 6vw, 5rem)",
    weight: "500/700", lineHeight: "1.1 / 1.6", letterSpacing: "-0.02em", hierarchy: "강한 대비" },
};

async function writeAll(overrides: Partial<Record<string, Buffer | string>> = {}) {
  await ensureProject(PROJECT);
  const dir = paths(PROJECT).design;
  const base: Record<string, Buffer | string> = {
    "approved-preview.html": goodHtml,
    "approved-desktop.png": png(80),
    "approved-mobile.png": png(40),
    "DESIGN.md": goodMd,
    "design-tokens.css": tokensCss,
    "visual-dna.json": JSON.stringify(visualDnaFixture, null, 2),
  };
  const files = { ...base, ...overrides };
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (content === undefined) continue;
    await fs.writeFile(path.join(dir, name), content as Buffer | string);
  }
  return dir;
}

beforeAll(async () => { await fs.mkdir(ws, { recursive: true }); });
afterAll(async () => { await fs.rm(ws, { recursive: true, force: true }); });

describe("디자인 확정 산출물 (PRD §21, §3.4)", () => {
  it("PRD §21 의 6개 파일을 요구한다", () => {
    expect(APPROVED_FILES).toHaveLength(6);
  });

  it("기준 우선순위는 승인 HTML 이 1순위, DESIGN.md 가 마지막이다", () => {
    expect(SOURCE_OF_TRUTH_ORDER[0]).toBe("approved-preview.html");
    expect(SOURCE_OF_TRUTH_ORDER.at(-1)).toBe("DESIGN.md");
    expect(sourceOfTruthBlock()).toContain("새로 디자인하지 마라");
  });

  it("온전한 산출물 세트는 통과한다", async () => {
    await writeAll();
    const a = await auditApproval(PROJECT);
    expect(a.missingFiles).toEqual([]);
    expect(a.emptyFiles).toEqual([]);
    expect(a.ok).toBe(true);
  });

  it("파일이 빠지면 잡아낸다", async () => {
    await writeAll({ "design-tokens.css": undefined });
    const a = await auditApproval(PROJECT);
    expect(a.missingFiles).toEqual(["design-tokens.css"]);
    expect(a.ok).toBe(false);
  });

  it("스크린샷이 껍데기면(20KB 미만) 통과시키지 않는다", async () => {
    await writeAll({ "approved-mobile.png": png(3) });
    const a = await auditApproval(PROJECT);
    expect(a.emptyFiles).toContain("approved-mobile.png");
    expect(a.ok).toBe(false);
  });

  it("파일은 다 있어도 DESIGN.md 섹션이 빠지면 통과시키지 않는다", async () => {
    await writeAll({ "DESIGN.md": goodMd.replace("## Motion", "## 잡담") });
    const a = await auditApproval(PROJECT);
    expect(a.missingFiles).toEqual([]);
    expect(a.designMd.missing).toContain("Motion");
    expect(a.ok).toBe(false);
  });

  it("승인 HTML 의 섹션 id 가 망가지면 통과시키지 않는다", async () => {
    await writeAll({ "approved-preview.html": goodHtml.replace('data-vdna-id="hero"', 'data-vdna-id="hero2"') });
    const a = await auditApproval(PROJECT);
    expect(a.sections.ok).toBe(false);
    expect(a.ok).toBe(false);
  });

  it("토큰이 없는 HTML 은 재현성이 없으므로 통과시키지 않는다", async () => {
    const bare = `<!doctype html><html><head><style>body{background:#fff}</style></head><body>
<header data-vdna-id="header">h</header><section data-vdna-id="hero"><h1>x</h1></section>
<footer data-vdna-id="footer">f</footer></body></html>`;
    await writeAll({ "approved-preview.html": bare });
    const a = await auditApproval(PROJECT);
    expect(a.tokens.ok).toBe(false);
    expect(a.ok).toBe(false);
  });
});
