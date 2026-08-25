import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 실제로 있었던 사고: 확정(approveDesign) 처리 도중 클라이언트 연결이 끊기면
 * 스크린샷·HTML·토큰 파일은 새로 쓰였는데 DESIGN.md 생성과 approvedAt 갱신은
 * 건너뛰어져, design/ 이 "이전도 아니고 새것도 아닌" 애매한 상태로 남았다.
 * 이제 스테이징 디렉터리에 전부 완성한 뒤 한 번의 rename 으로 교체하므로,
 * 중간에 실패하면 이전 확정본이 그대로 남아야 한다.
 */

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "vdna-approve-atomic-"));
process.env.VDNA_WORKSPACE = workspace;

vi.mock("@/lib/design/capture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/design/capture")>();
  return {
    ...actual,
    captureHtml: vi.fn(actual.captureHtml),
  };
});

const capture = await import("@/lib/design/capture");
const { approveDesign } = await import("@/lib/design/editRun");
const store = await import("@/lib/store");

const HTML_V1 = `<!doctype html><html><head><style>:root{--color-bg:#fff;--color-text:#111;--color-primary:#06c;--space-1:8px}</style></head><body>
<header data-vdna-id="header">h</header>
<section data-vdna-id="hero"><h1>V1</h1></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;

const HTML_V2 = HTML_V1.replace("V1", "V2");

const PROJECT = "p-approve-atomic";
const okAgent = async () =>
  [
    "## Design Direction\n충분히 긴 설명.",
    "## Color System\n충분히 긴 설명.",
    "## Typography\n충분히 긴 설명.",
    "## Spacing\n충분히 긴 설명.",
    "## Layout\n충분히 긴 설명.",
    "## Grid\n충분히 긴 설명.",
    "## Photography\n충분히 긴 설명.",
    "## Components\n충분히 긴 설명.",
    "## Navigation\n충분히 긴 설명.",
    "## Buttons\n충분히 긴 설명.",
    "## Forms\n충분히 긴 설명.",
    "## Cards\n충분히 긴 설명.",
    "## Motion\n충분히 긴 설명.",
    "## Responsive\n충분히 긴 설명.",
    "## Do\n- 이렇게 하라\n- 이렇게 하라\n- 이렇게 하라\n- 이렇게 하라",
    "## Don't\n- 이렇게 하지 마라\n- 이렇게 하지 마라\n- 이렇게 하지 마라\n- 이렇게 하지 마라",
  ].join("\n\n");

beforeAll(async () => {
  await store.ensureProject(PROJECT);
  await store.writeMeta(PROJECT, { projectId: PROJECT, name: "atomic", createdAt: new Date().toISOString(), versions: [] });
  await store.saveVersion(PROJECT, HTML_V1, "Initial");
});
afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("확정(approveDesign) 원자성", () => {
  it("정상 흐름은 6개 파일을 만들고 스테이징 디렉터리를 남기지 않는다", async () => {
    // audit.ok 는 스크린샷 크기·토큰 개수 등 콘텐츠 품질까지 보는데,
    // 이 테스트의 관심사는 원자성(파일이 실제로 옮겨졌는가)이지 콘텐츠 품질이 아니다.
    // 품질 감사 자체는 tests/approve.test.ts 가 이미 커버한다.
    const result = await approveDesign(PROJECT, { agent: okAgent });
    expect(result.audit.missingFiles).toEqual([]);
    expect(result.audit.sections.ok).toBe(true);

    const dir = store.paths(PROJECT).design;
    const entries = await fs.readdir(dir);
    expect(entries.filter((e) => e.startsWith(".staging-"))).toEqual([]);
    for (const f of ["approved-preview.html", "approved-desktop.png", "approved-mobile.png", "design-tokens.css", "visual-dna.json", "DESIGN.md"]) {
      expect(entries).toContain(f);
    }

    const meta = await store.readMeta(PROJECT);
    expect(meta.approvedAt).toBeDefined();
  });

  it("중간에 실패하면 이전 확정본이 그대로 남고 project.json 도 갱신되지 않는다", async () => {
    const before = await fs.readFile(path.join(store.paths(PROJECT).design, "approved-preview.html"), "utf8");
    const beforeMeta = await store.readMeta(PROJECT);

    await store.saveVersion(PROJECT, HTML_V2, "v2");

    const mockedCapture = vi.mocked(capture.captureHtml);
    mockedCapture.mockRejectedValueOnce(new Error("캡처 강제 실패 (테스트)"));

    await expect(approveDesign(PROJECT, { agent: okAgent })).rejects.toThrow("캡처 강제 실패");
    mockedCapture.mockRestore();

    const dir = store.paths(PROJECT).design;
    const entries = await fs.readdir(dir);
    // 실패한 시도의 스테이징 디렉터리는 지워지고, 실 design/ 은 V1 그대로다
    expect(entries.filter((e) => e.startsWith(".staging-"))).toEqual([]);
    expect(entries.filter((e) => e.includes(".prev-"))).toEqual([]);

    const after = await fs.readFile(path.join(dir, "approved-preview.html"), "utf8");
    expect(after).toBe(before);
    expect(after).toContain("V1");
    expect(after).not.toContain("V2");

    const afterMeta = await store.readMeta(PROJECT);
    expect(afterMeta.approvedAt).toBe(beforeMeta.approvedAt);
  });

  it("실패 후 재시도하면 정상적으로 새 버전으로 확정된다", async () => {
    const result = await approveDesign(PROJECT, { agent: okAgent });
    expect(result.audit.missingFiles).toEqual([]);
    const html = await fs.readFile(path.join(store.paths(PROJECT).design, "approved-preview.html"), "utf8");
    expect(html).toContain("V2");
  });
});
