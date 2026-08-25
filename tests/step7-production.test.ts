import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PRODUCTION_DIRECTIVE, ProductionPlan, auditPlanCoverage } from "@/lib/design/production";

const workspace = path.join(os.tmpdir(), `vdna-step7p-${Date.now()}`);
process.env.VDNA_WORKSPACE = workspace;

const mocks = vi.hoisted(() => ({ runAgentJson: vi.fn(), captureHtml: vi.fn() }));
vi.mock("@/lib/ai/cli", async (orig) => ({ ...(await orig<object>()), runAgentJson: mocks.runAgentJson }));
vi.mock("@/lib/design/capture", async (orig) => ({ ...(await orig<object>()), captureHtml: mocks.captureHtml }));

const {
  buildProductionPlanPrompt,
  buildProductionCodePrompt,
  composeFromComponents,
  coverageFeedback,
  deriveBreakdown,
  planProduction,
  visualQa,
  QA_PREVIEW_FILE,
} = await import("@/lib/design/productionize");
const { paths } = await import("@/lib/store");

const SECTIONS = ["header", "hero", "features", "footer"];
const HTML = `<!doctype html><html><body>${SECTIONS.map((s) => `<section data-vdna-id="${s}">${s}</section>`).join("")}</body></html>`;

const plan = (ids: string[]) =>
  ProductionPlan.parse({
    framework: "nextjs",
    components: ids.map((id) => ({ file: `${id[0].toUpperCase()}${id.slice(1)}.tsx`, sectionId: id, props: [], notes: "" })),
    tokenStrategy: "design-tokens.css 그대로 import",
    responsiveStrategy: "승인 HTML 브레이크포인트 유지",
  });

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("계획 프롬프트 (PRD §54)", () => {
  it("PRODUCTION_DIRECTIVE 와 섹션 목록을 싣는다", () => {
    const p = buildProductionPlanPrompt({ html: HTML, sectionIds: SECTIONS, framework: "nextjs" });
    expect(p).toContain(PRODUCTION_DIRECTIVE);
    expect(p).toContain("header, hero, features, footer");
    expect(p).toContain("4개");
    expect(p).toContain("nextjs");
  });

  it("커버리지 되먹임에 누락·유령 섹션이 들어간다", () => {
    const audit = auditPlanCoverage(plan(["header", "hero", "aside"]), SECTIONS);
    const fb = coverageFeedback(audit);
    expect(fb).toContain("features");
    expect(fb).toContain("footer");
    expect(fb).toContain("aside");
  });

  it("planProduction 은 누락 섹션을 되먹여 재시도한다", async () => {
    const prompts: string[] = [];
    mocks.runAgentJson.mockImplementation(async (_schema: unknown, call: { prompt: string }) => {
      prompts.push(call.prompt);
      // 1회차는 features 를 빠뜨리고, 2회차는 전부 채운다
      return plan(prompts.length === 1 ? ["header", "hero", "footer"] : SECTIONS);
    });
    const result = await planProduction({ html: HTML, sectionIds: SECTIONS, framework: "nextjs" });
    expect(result.components).toHaveLength(4);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("컴포넌트로 매핑되지 않은 섹션: features");
  });
});

describe("코드 프롬프트 (PRD §54~§56)", () => {
  it("재디자인 금지와 QA 산출물을 요구한다", () => {
    const p = buildProductionCodePrompt({
      html: HTML,
      tokensCss: ":root{--color-primary:#0b5cff}",
      plan: plan(SECTIONS),
      outDir: "/tmp/out",
      feedback: "Fidelity 71",
    });
    expect(p).toContain("다시 디자인하지 말고 변환하라");
    expect(p).toContain(PRODUCTION_DIRECTIVE);
    expect(p).toContain("/tmp/out");
    expect(p).toContain(QA_PREVIEW_FILE);
    expect(p).toContain("--color-primary:#0b5cff");
    expect(p).toContain("Fidelity 71");
    expect(p).toContain("components/Hero.tsx");
  });
});

describe("Visual QA (PRD §56~§58)", () => {
  const png = (w: number, h: number, color: [number, number, number]) => {
    const img = new PNG({ width: w, height: h });
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = 255;
    }
    return PNG.sync.write(img);
  };

  it("fidelity 는 compareScreenshots 결과를 그대로 쓴다", async () => {
    const projectId = "qa-project";
    const p = paths(projectId);
    await fs.mkdir(p.production, { recursive: true });
    // production 산출물 대신 QA 전용 정적 페이지를 둔다
    await fs.writeFile(path.join(p.production, QA_PREVIEW_FILE), "<!doctype html><html><body></body></html>", "utf8");

    const approved = path.join(workspace, "approved.png");
    await fs.writeFile(approved, png(40, 40, [255, 0, 0]));

    // 실제 브라우저 대신 다른 색 PNG 를 산출물 스크린샷으로 쓴다
    mocks.captureHtml.mockImplementation(async (_html: string, outFile: string) => {
      await fs.mkdir(path.dirname(outFile), { recursive: true });
      await fs.writeFile(outFile, png(40, 40, [0, 0, 255]));
      return outFile;
    });

    const drift = await import("@/lib/design/drift");
    const result = await visualQa({ projectId, approvedShot: approved });
    const direct = await drift.compareScreenshots(approved, result.producedShot);

    expect(result.fidelity).toBe(direct.fidelity);
    expect(result.drift.diffPixels).toBe(40 * 40);
    expect(result.method).toBe("qa-preview");
    expect(result.attempts).toBe(1);
    // diff 이미지가 실제 파일로 남는다
    await fs.access(result.drift.diffImagePath!);
    expect(result.breakdown!.color).toBe(0);
  });

  it("동일 이미지면 100 점이고 항목별 점수도 만점이다", () => {
    const b = deriveBreakdown({ fidelity: 100, diffPixels: 0, totalPixels: 1000, widthMismatch: false, heightDeltaPx: 0 });
    expect(b.layout).toBe(100);
    expect(b.spacing).toBe(100);
  });

  it("qa-preview 가 없으면 컴포넌트 마크업을 합성한다", () => {
    const html = composeFromComponents(
      [{ name: "Hero.tsx", source: `export function Hero() {\n  return (\n    <section data-vdna-id="hero" className="hero">{title}</section>\n  );\n}` }],
      ".hero{color:red}",
    );
    expect(html).toContain('class="hero"');
    expect(html).toContain('data-vdna-id="hero"');
    expect(html).toContain(".hero{color:red}");
    expect(html).not.toContain("{title}");
  });
});
