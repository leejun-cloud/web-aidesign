import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "vdna-step45-"));
process.env.VDNA_WORKSPACE = workspace;

// store.ts 는 import 시점에 WORKSPACE 를 고정하므로 env 를 먼저 세팅한 뒤 로드한다
const { ACTION_LABELS, actionInstruction } = await import("@/lib/design/editActions");
const { carveSection, designMdFeedback, restoreVersion, runSectionEdit } =
  await import(
  "@/lib/design/editRun",
);
const { SectionEditRequest } = await import("@/lib/design/sectionEdit");
const { changedSections, extractSection } = await import("@/lib/design/sections");
const store = await import("@/lib/store");

const BASE = `<!doctype html><html><head><style>:root{--color-bg:#ffffff;--color-text:#111111;--color-primary:#2563eb;--color-surface:#f4f4f5;--color-accent:#f59e0b;--space-1:8px;--space-2:16px;--radius:12px}</style></head><body>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="hero"><h1>Old headline</h1><a href="#">CTA1</a><a href="#">CTA2</a></section>
<section data-vdna-id="trust"><p>trust logos</p></section>
<section data-vdna-id="features"><h2>Features</h2></section>
<section data-vdna-id="cta"><h2>Start</h2></section>
<footer data-vdna-id="footer">footer</footer>
</body></html>`;

const PROJECT = "p-step45";

beforeAll(async () => {
  await store.ensureProject(PROJECT);
  await store.writeMeta(PROJECT, {
    projectId: PROJECT,
    name: "step45",
    createdAt: new Date().toISOString(),
    versions: [],
  });
  await store.saveVersion(PROJECT, BASE, "Initial");
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("섹션 수정 응답 파싱 (carveSection)", () => {
  it("코드펜스와 앞머리 설명을 걷어내고 섹션 요소만 뽑는다", () => {
    const raw = `수정했습니다. 제목을 키우고 CTA 를 하나로 줄였습니다.

\`\`\`html
<section data-vdna-id="hero"><h1>New headline</h1><a href="#">CTA1</a></section>
\`\`\`

추가 설명입니다.`;
    const out = carveSection(raw, "hero");
    expect(out.startsWith("<section")).toBe(true);
    expect(out).toContain("New headline");
    expect(out).not.toContain("수정했습니다");
    expect(out).not.toContain("추가 설명");
  });

  it("펜스 없이 설명이 앞에 붙어도 뽑아낸다", () => {
    const out = carveSection(
      '이렇게 바꿨습니다:\n<section data-vdna-id="hero"><h1>Bare</h1></section>',
      "hero",
    );
    expect(out).toBe('<section data-vdna-id="hero"><h1>Bare</h1></section>');
  });

  it("전체 페이지를 돌려줘도 대상 섹션만 뽑는다", () => {
    const out = carveSection(BASE.replace("Old headline", "Whole page"), "hero");
    expect(out).toContain("Whole page");
    expect(out).not.toContain("<header");
    expect(out).not.toContain("footer");
  });

  it("섹션이 없으면 오류를 던진다", () => {
    expect(() => carveSection("아무 것도 못 했습니다", "hero")).toThrow(/찾지 못했/);
  });
});

describe("API 경로에서 enforceLock 이 실제로 걸린다", () => {
  it("비선택 섹션을 건드린 응답은 그 섹션이 원본으로 복원된다", async () => {
    const before = (await store.latestVersion(PROJECT)).html;
    // AI 가 hero 뿐 아니라 footer·features 까지 바꿔서 페이지 전체를 돌려준 상황
    const evil = before
      .replace("<h1>Old headline</h1>", "<h1>Bigger headline</h1>")
      .replace('<footer data-vdna-id="footer">footer</footer>', '<footer data-vdna-id="footer">침범</footer>')
      .replace("<h2>Features</h2>", "<h2>침범</h2>");

    const r = await runSectionEdit(
      SectionEditRequest.parse({ projectId: PROJECT, sectionId: "hero", instruction: "제목을 크게" }),
      { agent: async () => "```html\n" + evil + "\n```" },
    );

    expect(r.changed).toEqual(["hero"]);
    expect(r.reverted.sort()).toEqual(["features", "footer"]);
    const after = (await store.readVersion(PROJECT, r.version)).html;
    expect(changedSections(before, after)).toEqual(["hero"]);
    expect(extractSection(after, "footer")).toBe(extractSection(before, "footer"));
    expect(extractSection(after, "features")).toBe(extractSection(before, "features"));
    expect(extractSection(after, "hero")).toContain("Bigger headline");
  });

  it("scope=allow-related 면 관련 섹션 변경도 허용한다", async () => {
    const before = (await store.latestVersion(PROJECT)).html;
    const evil = before.replace("trust logos", "관련 변경").replace(/Bigger headline/, "또 수정");
    const r = await runSectionEdit(
      SectionEditRequest.parse({
        projectId: PROJECT,
        sectionId: "hero",
        instruction: "관련 영역도",
        scope: "allow-related",
      }),
      { agent: async () => evil },
    );
    expect(r.reverted).toEqual([]);
    expect(r.changed.sort()).toEqual(["hero", "trust"]);
  });

  it("섹션을 삭제한 응답은 구조 위반으로 거부한다", async () => {
    const before = (await store.latestVersion(PROJECT)).html;
    const broken = before.replace('<footer data-vdna-id="footer">footer</footer>', "<footer>footer</footer>");
    await expect(
      runSectionEdit(
        SectionEditRequest.parse({ projectId: PROJECT, sectionId: "hero", instruction: "x" }),
        { agent: async () => broken },
      ),
    ).rejects.toThrow(/섹션 구조/);
  });
});

describe("스코프 선택자가 섞인 응답 처리", () => {
  it("모션 응답처럼 선택자가 여러 번 나와도 실제 섹션은 하나로 센다", async () => {
    const before = (await store.latestVersion(PROJECT)).html;
    const motionSection =
      '<section data-vdna-id="hero"><style>[data-vdna-id="hero"]{opacity:1}' +
      '@media (prefers-reduced-motion: reduce){[data-vdna-id="hero"]{transition:none}}</style>' +
      '<h1>Motion</h1></section>';
    const r = await runSectionEdit(
      SectionEditRequest.parse({ projectId: PROJECT, sectionId: "hero", instruction: "모션" }),
      { agent: async () => "```html\n" + motionSection + "\n```" },
    );
    expect(r.changed).toEqual(["hero"]);
    const after = (await store.readVersion(PROJECT, r.version)).html;
    expect(after).toContain("prefers-reduced-motion");
    expect(before).not.toContain("prefers-reduced-motion");
  });
});

describe("하단 액션 프리셋 (PRD §14)", () => {
  it("Motion 을 포함해 5개 프리셋이 있다", () => {
    expect(ACTION_LABELS).toHaveLength(5);
    expect(ACTION_LABELS).toContain("Motion");
  });
  it("각 프리셋은 서로 다른 instruction 을 만든다", () => {
    const set = new Set(ACTION_LABELS.map((a) => actionInstruction(a)));
    expect(set.size).toBe(ACTION_LABELS.length);
    for (const i of set) expect(i.length).toBeGreaterThan(20);
  });
  it("'더 비슷하게' 와 '조금 다르게' 는 반대 방향을 지시한다", () => {
    expect(actionInstruction("더 비슷하게")).toContain("더 가깝게");
    expect(actionInstruction("조금 다르게")).toContain("한 발 떨어");
  });
});

describe("복구는 이력을 지우지 않는다 (PRD §20)", () => {
  it("v1 복구는 새 버전으로 쌓이고 내용은 v1 과 같다", async () => {
    const beforeList = (await store.readMeta(PROJECT)).versions.map((v) => v.version);
    const r = await restoreVersion(PROJECT, 1);
    const afterList = (await store.readMeta(PROJECT)).versions.map((v) => v.version);

    expect(afterList).toEqual([...beforeList, r.version]);
    expect(r.label).toBe("v1 복구");
    expect((await store.readVersion(PROJECT, r.version)).html).toBe(
      (await store.readVersion(PROJECT, 1)).html,
    );
    // 기존 버전 파일이 살아 있다
    for (const v of beforeList) {
      expect((await store.readVersion(PROJECT, v)).html.length).toBeGreaterThan(0);
    }
  });
});

describe("DESIGN.md 재생성 되먹임", () => {
  it("빠진 섹션과 빈 섹션 이름을 문자열에 담는다", () => {
    const fb = designMdFeedback({
      ok: false,
      missing: ["Motion", "Responsive"],
      empty: ["Grid"],
      hasSourceOfTruth: false,
    });
    expect(fb).toContain("Motion");
    expect(fb).toContain("Responsive");
    expect(fb).toContain("Grid");
    expect(fb).toContain("approved-preview.html");
  });
  it("문제가 없으면 원인 불명으로 남긴다", () => {
    expect(designMdFeedback({ ok: true, missing: [], empty: [], hasSourceOfTruth: true })).toContain(
      "원인 불명",
    );
  });
});
