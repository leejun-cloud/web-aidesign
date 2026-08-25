import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PhotoDna } from "@/lib/design/template";
import type { VisualDna as VisualDnaType } from "@/lib/types";

// store 의 WORKSPACE 는 모듈 로드 시점에 굳는다 — 정적 import 보다 먼저 임시 workspace 로 바꾸고 동적 import 한다
const workspace = path.join(os.tmpdir(), `vdna-step7-${Date.now()}`);
process.env.VDNA_WORKSPACE = workspace;

const { buildGeneratePrompt } = await import("@/lib/design/generate");
const { REFERENCE_TEMPLATE_GUARDRAIL, TEMPLATE_FILES } = await import("@/lib/design/template");
const { VisualDna } = await import("@/lib/types");
const { saveTemplate, listTemplates, readTemplate, buildPhotoDnaPrompt, buildReferenceTemplateBrief } =
  await import("@/lib/design/templateStore");

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>:root{--color-background:#ffffff;--color-surface:#f6f7f9;--color-primary:#0b5cff;--color-secondary:#1a2b4c;--color-accent:#ff6b35;--color-text:#0f1115;--space-section:96px;--radius-md:12px}@media (min-width:834px){body{font-size:17px}}</style></head><body><section data-vdna-id="header">h</section><section data-vdna-id="hero">hero</section><section data-vdna-id="footer">f</section></body></html>`;

const dna = (): VisualDnaType =>
  VisualDna.parse({
    mood: ["신뢰감있는", "정갈한"],
    layout: { heroStructure: "좌측 텍스트 + 우측 이미지", grid: "12칼럼", containerWidth: "1200px", sectionOrder: ["header", "hero", "footer"], contentAlignment: "왼쪽", imagePlacement: "우측", header: "고정 헤더" },
    typography: { fontPersonality: "기하학적 산세리프", headingScale: "1.25 비율", weight: "600", lineHeight: "1.5", letterSpacing: "-0.01em", hierarchy: "3단" },
    color: { background: "#ffffff", surface: "#f6f7f9", primary: "#0b5cff", secondary: "#1a2b4c", accent: "#ff6b35", text: "#0f1115", saturation: "중간", temperature: "차가움" },
    photography: { composition: "중앙 구도", lighting: "부드러운 확산광", colorGrading: "저채도 쿨톤", cameraAngle: "아이레벨", depthOfField: "얕음", humanPose: "자연스러운 업무 동작", environment: "밝은 오피스", texture: "매끈함", imageRatio: "16:9" },
    components: { buttons: "라운드 8px 솔리드", cards: "얇은 테두리", forms: "라인 입력", navigation: "수평 메뉴", border: "1px #e5e7eb", radius: "8~12px", shadow: "약한 그림자" },
    spacing: { sectionGap: "96px", containerPadding: "24px", cardPadding: "20px", contentGap: "16px", heroWhitespace: "넉넉함" },
    motion: { fade: "짧은 페이드", reveal: "아래에서 위", scroll: "스크롤 등장", hover: "미세 상승", transition: "200ms" },
  });

const photo = (): PhotoDna => ({
  name: "Cool Office",
  traits: ["확산광 인물", "저채도 쿨톤", "얕은 심도"],
  lighting: "부드러운 확산광",
  grading: "저채도 쿨톤",
  subject: "업무 중 인물",
  depthOfField: "얕음",
});

const shotWriter = (bytes = 30_000) => async (file: string) => {
  // PNG 시그니처 + 패딩 — 캡처 없이 파일 크기만 검증하는 더미
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await fs.writeFile(file, Buffer.concat([head, Buffer.alloc(bytes)]));
};

beforeAll(async () => {
  await fs.mkdir(workspace, { recursive: true });
});
afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("saveTemplate (PRD §41, §42)", () => {
  it("TEMPLATE_FILES 8개를 모두 만든다", async () => {
    const t = await saveTemplate({
      name: "내 랜딩 A",
      html: HTML,
      visualDna: dna(),
      photoDna: photo(),
      origin: "mine",
      shotWriter: shotWriter(),
    });
    const dir = path.join(workspace, "templates", t.id);
    const files = await fs.readdir(dir);
    for (const f of TEMPLATE_FILES) expect(files).toContain(f);

    const tokens = await fs.readFile(path.join(dir, "design-tokens.css"), "utf8");
    expect((tokens.match(/--[a-z-]+:/g) ?? []).length).toBeGreaterThanOrEqual(8);
    // preview.html 은 넘긴 HTML 그대로다
    expect(await fs.readFile(path.join(dir, "preview.html"), "utf8")).toBe(HTML);
    // 목록/단건 조회가 동작한다
    expect((await listTemplates()).some((x) => x.id === t.id)).toBe(true);
    expect((await readTemplate(t.id)).name).toBe("내 랜딩 A");
  });

  it("파일이 하나라도 빠지면 던진다", async () => {
    // 스크린샷을 쓰지 않는 writer → preview-desktop.png 등이 없다
    await expect(
      saveTemplate({
        name: "깨진 템플릿",
        html: HTML,
        visualDna: dna(),
        photoDna: photo(),
        origin: "mine",
        shotWriter: async () => {},
      }),
    ).rejects.toThrow(/preview-desktop\.png/);
  });

  it("origin=reference 는 sourceUrl 을 기록한다", async () => {
    const t = await saveTemplate({
      name: "Reference B",
      html: HTML,
      visualDna: dna(),
      photoDna: photo(),
      origin: "reference",
      sourceUrl: "https://example.com",
      defaultLevel: "very",
      shotWriter: shotWriter(),
    });
    const saved = await readTemplate(t.id);
    expect(saved.origin).toBe("reference");
    expect(saved.sourceUrl).toBe("https://example.com");
    expect(saved.defaultLevel).toBe("very");
  });

  it("DESIGN.md 는 승인본이 진실임을 명시한다", async () => {
    const t = await saveTemplate({
      name: "문서 확인",
      html: HTML,
      visualDna: dna(),
      photoDna: photo(),
      origin: "mine",
      shotWriter: shotWriter(),
    });
    const md = await fs.readFile(path.join(workspace, "templates", t.id, "DESIGN.md"), "utf8");
    expect(md).toContain("preview.html");
    expect(md).toContain("## Color System");
  });
});

describe("from-url 프롬프트 (PRD §43, §50)", () => {
  it("생성 프롬프트에 복제 금지 가드레일이 실린다", () => {
    const brief = buildReferenceTemplateBrief({
      projectId: "staging-1",
      sourceUrl: "https://example.com",
      level: "similar",
      shots: ["/tmp/d.png", "/tmp/m.png"],
    });
    expect(brief.brandBrief).toContain(REFERENCE_TEMPLATE_GUARDRAIL);
    const prompt = buildGeneratePrompt({ brief, visualDna: dna() });
    expect(prompt).toContain("원본 사이트의 HTML, CSS, 이미지, 텍스트, 로고를 저장하거나 복제하지 않는다");
    expect(prompt).toContain("새로 생성한 디자인");
  });

  it("Photo DNA 프롬프트는 저작권 경계와 항목을 싣는다", () => {
    const p = buildPhotoDnaPrompt(["/tmp/d.png"], { name: "Cool Office", sourceUrl: "https://example.com" });
    expect(p).toContain("Cool Office");
    expect(p).toContain("depthOfField");
    expect(p).toContain("저작권 경계");
    expect(p).toContain("/tmp/d.png");
  });
});
