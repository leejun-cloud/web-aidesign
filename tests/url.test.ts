import { describe, expect, it } from "vitest";
import { normalizeUrl, requireUrl } from "@/lib/design/url";

/**
 * 실제로 있었던 사고: 사용자가 "같이.com" 처럼 프로토콜 없는 한글 도메인을 입력하면
 * 그대로 browse goto 에 넘어가 "Invalid URL: 같이.com" 으로 크래시했다.
 * https:// 를 붙이면 Node 의 URL 파서가 IDN 을 punycode 로 자동 인코딩한다.
 */
describe("normalizeUrl", () => {
  it("프로토콜 없는 한글 도메인을 punycode https URL 로 정규화한다 (실제 사고 재현)", () => {
    const r = normalizeUrl("같이.com");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://xn--e49au23c.com/");
  });

  it("프로토콜 없는 일반 도메인도 https 를 붙인다", () => {
    expect(normalizeUrl("example.com")).toEqual({ ok: true, url: "https://example.com/" });
  });

  it("이미 프로토콜이 있으면 그대로 둔다", () => {
    expect(normalizeUrl("https://example.com").url).toBe("https://example.com/");
    expect(normalizeUrl("http://example.com").url).toBe("http://example.com/");
  });

  it("앞뒤 공백을 정리한다", () => {
    expect(normalizeUrl("  example.com  ").url).toBe("https://example.com/");
  });

  it("빈 입력을 거부한다", () => {
    const r = normalizeUrl("   ");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("입력해주세요");
  });

  it("도메인 형식이 아닌 입력을 거부한다", () => {
    expect(normalizeUrl("안녕하세요").ok).toBe(false);
    expect(normalizeUrl("그냥텍스트").ok).toBe(false);
  });

  it("localhost 는 점이 없어도 허용한다", () => {
    expect(normalizeUrl("localhost:3000").ok).toBe(true);
    expect(normalizeUrl("http://localhost:3000").ok).toBe(true);
  });

  it("http/https 이외의 스킴을 거부한다 (javascript:, file: 등)", () => {
    expect(normalizeUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeUrl("file:///etc/passwd").ok).toBe(false);
    expect(normalizeUrl("ftp://example.com").ok).toBe(false);
  });

  it("requireUrl 은 실패하면 던지고 성공하면 정규화된 문자열을 준다", () => {
    expect(requireUrl("example.com")).toBe("https://example.com/");
    expect(() => requireUrl("같이")).toThrow();
    expect(() => requireUrl("javascript:x")).toThrow();
  });
});
