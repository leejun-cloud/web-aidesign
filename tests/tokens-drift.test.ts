import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { auditTokens, extractTokens, renderTokensCss } from "@/lib/design/tokens";
import { compareScreenshots } from "@/lib/design/drift";

const html = `<!doctype html><html><head><style>
:root{--bg:#0b0b0c;--surface:#141416;--primary:#1f6feb;--secondary:#8b949e;--accent:#f0883e;
--text:#e6edf3;--space-section:120px;--space-container:24px;--radius:14px;--font-body:ui-sans-serif,system-ui}
body{background:var(--bg);color:var(--text);font-family:var(--font-body)}
.badge{color:#ff00aa}
@media (min-width:834px){body{font-size:17px}}
@media (min-width:1440px){body{font-size:18px}}
</style></head><body><h1>x</h1></body></html>`;

describe("design token 추출", () => {
  it(":root 커스텀 프로퍼티를 전부 뽑는다", () => {
    const t = extractTokens(html);
    expect(t.variables["--bg"]).toBe("#0b0b0c");
    expect(t.variables["--space-section"]).toBe("120px");
    expect(Object.keys(t.variables).length).toBe(10);
  });
  it("브레이크포인트와 폰트 스택을 수집한다", () => {
    const t = extractTokens(html);
    expect(t.breakpoints).toEqual(["834px", "1440px"]);
    expect(t.fontFamilies.length).toBeGreaterThan(0);
  });
  it("CSS 를 렌더하면 유효한 :root 블록이 나온다", () => {
    const css = renderTokensCss(extractTokens(html));
    expect(css).toContain(":root {");
    expect(css).toContain("--primary: #1f6feb;");
  });
  it("토큰을 우회한 하드코딩 색상을 잡아낸다", () => {
    expect(auditTokens(html).hardcodedColors).toContain("#ff00aa");
  });
  it("토큰이 거의 없는 HTML 은 감사에 실패한다", () => {
    const bare = `<!doctype html><html><head><style>body{background:#fff;color:#111}</style></head><body></body></html>`;
    expect(auditTokens(bare).ok).toBe(false);
  });
});

const tmp = path.join(os.tmpdir(), "vdna-drift-test");
const png = (w: number, h: number, rgb: [number, number, number]) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = rgb[0]; p.data[i + 1] = rgb[1]; p.data[i + 2] = rgb[2]; p.data[i + 3] = 255;
  }
  return PNG.sync.write(p);
};

describe("Production Drift Score", () => {
  beforeAll(async () => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(path.join(tmp, "a.png"), png(200, 300, [10, 10, 10]));
    await fs.writeFile(path.join(tmp, "same.png"), png(200, 300, [10, 10, 10]));
    await fs.writeFile(path.join(tmp, "diff.png"), png(200, 300, [240, 20, 20]));
    await fs.writeFile(path.join(tmp, "taller.png"), png(200, 400, [10, 10, 10]));
    await fs.writeFile(path.join(tmp, "narrow.png"), png(160, 300, [10, 10, 10]));
  });

  it("동일 스크린샷은 100점", async () => {
    const r = await compareScreenshots(path.join(tmp, "a.png"), path.join(tmp, "same.png"));
    expect(r.fidelity).toBe(100);
    expect(r.diffPixels).toBe(0);
  });
  it("완전히 다른 색이면 크게 감점한다", async () => {
    const r = await compareScreenshots(path.join(tmp, "a.png"), path.join(tmp, "diff.png"));
    expect(r.fidelity).toBeLessThan(10);
  });
  it("세로 길이 차이를 드리프트로 잡는다", async () => {
    const r = await compareScreenshots(path.join(tmp, "a.png"), path.join(tmp, "taller.png"));
    expect(r.heightDeltaPx).toBe(100);
    expect(r.fidelity).toBeLessThan(100);
  });
  it("가로 폭 불일치를 표시한다", async () => {
    const r = await compareScreenshots(path.join(tmp, "a.png"), path.join(tmp, "narrow.png"));
    expect(r.widthMismatch).toBe(true);
  });
  it("diff 이미지를 파일로 남긴다", async () => {
    const out = path.join(tmp, "out-diff.png");
    await compareScreenshots(path.join(tmp, "a.png"), path.join(tmp, "diff.png"), out);
    expect((await fs.stat(out)).size).toBeGreaterThan(0);
  });
});
