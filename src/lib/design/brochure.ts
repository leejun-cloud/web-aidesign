import { assertLocalEngine } from "@/lib/env";

/** 승인 HTML을 인쇄용 PDF 브로슈어로 렌더링한다 — Playwright가 필요해 로컬 전용이다 */
export async function renderBrochurePdf(html: string): Promise<Buffer> {
  assertLocalEngine();
  // capture.ts 와 동일한 이유로 정적 import 를 피한다 (Vercel 서버리스 번들링 실패)
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      }),
    );
  } finally {
    await browser.close();
  }
}
