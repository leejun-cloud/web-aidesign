/**
 * 사용자가 입력한 URL 을 브라우저 계층(browse/Playwright)에 넘기기 전에
 * 정규화·검증하는 단일 관문.
 *
 * 실제로 겪은 사고: "같이.com" 처럼 프로토콜 없는 한글 도메인을 그대로
 * `browse goto` 에 넘기면 "Invalid URL: 같이.com" 으로 크래시한다.
 * `https://` 를 붙이면 Node 의 URL 파서가 IDN 을 punycode 로 자동 인코딩해
 * 정상 동작한다 — 그 한 줄이 빠져 있었다.
 */
export interface UrlCheck {
  ok: boolean;
  /** 정규화된 URL (ok=true 일 때만) */
  url?: string;
  error?: string;
}

const PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

export function normalizeUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "URL을 입력해주세요" };

  // 프로토콜이 없으면 https 를 붙인다 — 사용자는 대부분 "example.com" 처럼 입력한다
  const withProtocol = PROTOCOL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: `올바른 URL이 아닙니다: ${trimmed}` };
  }

  // http(s) 외 스킴은 거부한다 — javascript:, file: 등이 브라우저 계층에 그대로 전달되지 않게 막는다
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "http 또는 https 주소만 입력할 수 있습니다" };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { ok: false, error: `도메인 형식이 아닙니다: ${trimmed}` };
  }

  return { ok: true, url: parsed.href };
}

/** UI 에서 자주 쓰는 형태 — 실패하면 던진다 */
export function requireUrl(input: string): string {
  const check = normalizeUrl(input);
  if (!check.ok) throw new Error(check.error);
  return check.url!;
}
