import { describe, expect, it } from "vitest";
import { detectBlock, parseStatus } from "@/lib/browser/browse";
import { browserMode } from "@/lib/design/capture";

/**
 * 실제로 있었던 사고: Cloudflare 차단 페이지를 정상 페이지로 착각해 분석하고
 * "고객지원 > Ray ID 확인" 같은 메뉴 개선안을 만들어냈다.
 * 그 입력을 파이프라인에 들여보내지 않는 것이 이 테스트의 목적이다.
 */
describe("차단 페이지 판별", () => {
  const healthy = {
    title: "Patagonia Outdoor Clothing & Gear",
    text: "Men's Women's Kids' Packs & Gear Sale ".repeat(20),
    linkCount: 40,
  };

  it("정상 사이트는 통과시킨다", () => {
    expect(detectBlock(healthy).blocked).toBe(false);
  });

  it("Cloudflare 차단 문구를 잡는다", () => {
    const r = detectBlock({ ...healthy, text: "Sorry, you have been blocked. Ray ID: 8f2c" });
    expect(r.blocked).toBe(true);
    expect(r.kind).toBe("blocked");
  });

  it("사람 확인 요구 페이지를 잡는다", () => {
    for (const text of [
      "Verify you are human",
      "Checking your browser before accessing",
      "Just a moment...",
      "Enable JavaScript and cookies to continue",
      "Attention Required! | Cloudflare",
    ]) {
      expect(detectBlock({ ...healthy, text }).blocked).toBe(true);
    }
  });

  it("4xx / 5xx 응답을 잡는다", () => {
    expect(detectBlock({ ...healthy, status: 404 }).kind).toBe("blocked");
    expect(detectBlock({ ...healthy, status: 503 }).kind).toBe("blocked");
    expect(detectBlock({ ...healthy, status: 200 }).blocked).toBe(false);
  });

  it("내용이 없는 페이지는 차단이 아니라 '분석 불가' 로 구분한다", () => {
    const r = detectBlock({ title: "Example Domain", text: "짧은 본문", linkCount: 1 });
    expect(r.blocked).toBe(true);
    expect(r.kind).toBe("empty");
  });

  it("링크가 적어도 본문이 충분하면 통과시킨다", () => {
    expect(detectBlock({ title: "글", text: "가".repeat(500), linkCount: 1 }).blocked).toBe(false);
  });
});

describe("goto 출력 파싱", () => {
  it("HTTP 상태를 뽑는다", () => {
    expect(parseStatus("Navigated to https://example.com (200)")).toBe(200);
    expect(parseStatus("Navigated to https://x.com (404)")).toBe(404);
  });
  it("상태가 없으면 undefined", () => {
    expect(parseStatus("Navigated")).toBeUndefined();
  });
});

describe("브라우저 모드 정책", () => {
  it("기본은 hybrid — 외부는 stealth, 내부는 Playwright", () => {
    delete process.env.VDNA_BROWSER;
    expect(browserMode()).toBe("hybrid");
  });
  it("환경변수로 강제할 수 있다", () => {
    process.env.VDNA_BROWSER = "browse";
    expect(browserMode()).toBe("browse");
    process.env.VDNA_BROWSER = "playwright";
    expect(browserMode()).toBe("playwright");
    process.env.VDNA_BROWSER = "헛소리";
    expect(browserMode()).toBe("hybrid");
    delete process.env.VDNA_BROWSER;
  });
});
