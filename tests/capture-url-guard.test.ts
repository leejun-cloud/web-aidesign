import { describe, expect, it, vi } from "vitest";

/**
 * captureUrl / collectSiteFacts 는 브라우저를 실제로 띄우기 전에 URL 을 정규화·검증한다.
 *
 * 실제 사고: "같이.com" 처럼 프로토콜 없는 한글 도메인을 그대로 browse goto 에 넘기면
 * "Invalid URL: 같이.com" 으로 크래시했다. 이건 "거부해야 할 입력"이 아니라
 * "고쳐서 통과시켜야 할 입력"이다 — https:// 를 붙이면 정상 URL 이 된다.
 * 반면 빈 문자열이나 javascript: 스킴처럼 정말 잘못된 입력은 세션을 만들기도 전에 막아야 한다.
 */
vi.mock("@/lib/browser/browse", () => ({
  browseBin: vi.fn().mockResolvedValue(null),
  session: vi.fn(() => {
    throw new Error("세션이 생성되면 안 된다 — URL 검증이 더 먼저 실행돼야 한다");
  }),
  detectBlock: vi.fn(() => ({ blocked: false })),
  parseStatus: vi.fn(() => 200),
}));

import { BlockedSiteError, captureUrl, collectSiteFacts } from "@/lib/design/capture";
import { normalizeUrl } from "@/lib/design/url";

describe("URL 관문 — 정말 잘못된 입력만 막고, 고칠 수 있는 입력은 고쳐서 통과시킨다", () => {
  it("빈 문자열은 브라우저 세션 생성 전에 막는다", async () => {
    await expect(captureUrl("   ", "/tmp/never.png")).rejects.toBeInstanceOf(BlockedSiteError);
  });

  it("javascript: 스킴은 세션 생성 전에 막는다", async () => {
    await expect(captureUrl("javascript:alert(1)", "/tmp/never.png")).rejects.toBeInstanceOf(BlockedSiteError);
  });

  it("file: 스킴은 세션 생성 전에 막는다", async () => {
    await expect(collectSiteFacts("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedSiteError);
  });

  it("프로토콜 없는 한글 도메인(실제 사고 사례)은 거부가 아니라 정규화 대상이다", () => {
    // captureUrl 이 이 입력으로 세션까지 만들려 시도한다는 것 자체가
    // "거부하지 않고 고쳐서 통과시켰다"는 증거다 — 실제 네트워크 접근 여부는 별도 관심사.
    const check = normalizeUrl("같이.com");
    expect(check.ok).toBe(true);
    expect(check.url).toBe("https://xn--e49au23c.com/");
  });
});
