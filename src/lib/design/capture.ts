import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { browseBin, detectBlock, parseStatus, session } from "@/lib/browser/browse";
import { normalizeUrl } from "@/lib/design/url";
import { assertLocalEngine } from "@/lib/env";

/**
 * 브라우저 선택 정책 (VDNA_BROWSER)
 * - hybrid(기본): 외부 URL 은 gstack browse(headed stealth), 내부 HTML 은 Playwright
 * - browse      : 전부 browse. 단일 데몬이라 직렬화되고 창이 보인다
 * - playwright  : 전부 Playwright. 봇 방어 사이트는 실패한다
 *
 * 외부 사이트에서 stealth 가 필요한 이유는 속도가 아니라 정확성이다 —
 * 차단 페이지를 정상 페이지로 착각해 분석하면 결과물 전체가 무의미해진다.
 */
export type BrowserMode = "hybrid" | "browse" | "playwright";

export const browserMode = (): BrowserMode => {
  const v = process.env.VDNA_BROWSER;
  return v === "browse" || v === "playwright" ? v : "hybrid";
};

/** 외부 URL 을 browse 로 다룰지 (React Hook 이 아니다 — use 로 시작하지 않게 이름을 고름) */
async function shouldUseBrowse(): Promise<boolean> {
  const mode = browserMode();
  if (mode === "playwright") return false;
  return (await browseBin()) !== null;
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

interface ShotOpts {
  fullPage?: boolean;
  timeoutMs?: number;
}

async function shoot(
  target: { url?: string; html?: string },
  outFile: string,
  viewport: ViewportName,
  opts: ShotOpts = {},
) {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  return withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: VIEWPORTS[viewport] });
    page.setDefaultTimeout(opts.timeoutMs ?? 45_000);
    if (target.url) await page.goto(target.url, { waitUntil: "networkidle" });
    else await page.setContent(target.html ?? "", { waitUntil: "networkidle" });
    // reveal 계열 스크롤 애니메이션이 끝난 화면을 찍는다
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: outFile, fullPage: opts.fullPage ?? true });
    await page.close();
    return outFile;
  });
}

/** 차단 페이지를 그대로 분석하지 않기 위해 캡처 단계에서 걸러낸다 */
export class BlockedSiteError extends Error {
  constructor(
    readonly url: string,
    reason: string,
    readonly kind: "blocked" | "empty" = "blocked",
  ) {
    super(
      kind === "blocked"
        ? `사이트 접근이 차단됐습니다 (${url}): ${reason}. 봇 방어를 통과하지 못했습니다.`
        : `분석할 수 없는 페이지입니다 (${url}): ${reason}.`,
    );
    this.name = "BlockedSiteError";
  }
}

/**
 * 외부 URL 캡처. hybrid/browse 모드에서는 gstack browse(headed stealth) 를 쓴다.
 * 캡처 직후 차단 여부를 판별해, 차단 페이지를 정상 산출물로 흘려보내지 않는다.
 */
export async function captureUrl(
  rawUrl: string,
  outFile: string,
  viewport: ViewportName = "desktop",
  opts?: ShotOpts,
): Promise<string> {
  assertLocalEngine();
  const urlCheck = normalizeUrl(rawUrl);
  if (!urlCheck.ok) throw new BlockedSiteError(rawUrl, urlCheck.error ?? "잘못된 URL", "empty");
  const url = urlCheck.url!;

  if (!(await shouldUseBrowse())) return shoot({ url }, outFile, viewport, opts);

  const b = session();
  const vp = VIEWPORTS[viewport];
  await b.viewport(vp.width, vp.height);
  const gotoOut = await b.goto(url);

  const probe = await b.js<{ title: string; text: string; linkCount: number }>(
    'JSON.stringify({title:document.title,text:(document.body?document.body.innerText:"").slice(0,3000),linkCount:document.querySelectorAll("a").length})',
  );
  const check = detectBlock({ status: parseStatus(gotoOut), ...probe });
  if (check.blocked) throw new BlockedSiteError(url, check.reason ?? "원인 불명", check.kind);

  return b.screenshot(outFile, { fullPage: opts?.fullPage ?? true });
}

export const captureHtml = (html: string, outFile: string, viewport: ViewportName = "desktop", opts?: ShotOpts) => {
  assertLocalEngine();
  return shoot({ html }, outFile, viewport, opts);
};

/** URL 에서 구조 분석용 원자료를 뽑는다 (PRD §24, §31 측정 가능 항목) */
export interface SiteFacts {
  url: string;
  title: string;
  navLinks: { text: string; href: string }[];
  headings: { level: number; text: string }[];
  ctaTexts: string[];
  imageCount: number;
  oversizedImages: number;
  textSample: string;
  fonts: string[];
  colors: string[];
  missingAlt: number;
  loadMs: number;
}

/**
 * 페이지 안에서 실행할 수집 스크립트.
 * browse(js) 와 Playwright(evaluate) 양쪽에서 같은 코드를 쓰기 위해 문자열로 둔다.
 * (tsx 로 실행할 때 esbuild 가 함수 본문에 __name 래퍼를 남겨 깨지는 문제도 함께 피한다)
 */
export const FACTS_SCRIPT = `(function(){
  var txt = function (el) { return (el.textContent || "").replace(/\\s+/g, " ").trim(); };
  var nav = document.querySelector("header nav, nav, header") || document.body;
  var navLinks = Array.prototype.slice.call(nav.querySelectorAll("a")).map(function (a) {
    return { text: txt(a), href: a.href };
  }).filter(function (l) { return l.text; }).slice(0, 40);
  var headings = Array.prototype.slice.call(document.querySelectorAll("h1,h2,h3,h4")).map(function (h) {
    return { level: Number(h.tagName[1]), text: txt(h) };
  }).filter(function (h) { return h.text; }).slice(0, 80);
  var ctaTexts = Array.prototype.slice.call(document.querySelectorAll("a,button")).map(txt)
    .filter(function (t) { return t && t.length <= 30; }).slice(0, 60);
  var imgs = Array.prototype.slice.call(document.querySelectorAll("img"));
  var styles = Array.prototype.slice.call(document.querySelectorAll("body *")).slice(0, 400)
    .map(function (el) { return getComputedStyle(el); });
  var uniq = function (arr) { return arr.filter(function (v, i, a) { return a.indexOf(v) === i; }); };
  return {
    title: document.title,
    navLinks: navLinks,
    headings: headings,
    ctaTexts: ctaTexts,
    imageCount: imgs.length,
    oversizedImages: imgs.filter(function (i) { return i.naturalWidth > 2400; }).length,
    missingAlt: imgs.filter(function (i) { return !i.getAttribute("alt"); }).length,
    textSample: (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 6000),
    fonts: uniq(styles.map(function (s) { return s.fontFamily; })).slice(0, 12),
    colors: uniq(styles.map(function (s) { return s.color; }).concat(styles.map(function (s) { return s.backgroundColor; }))).slice(0, 24)
  };
})()`;

type PageFacts = Omit<SiteFacts, "url" | "loadMs">;

/** 외부 사이트에서 구조 분석용 원자료를 수집한다. 차단 페이지면 던진다. */
export async function collectSiteFacts(rawUrl: string): Promise<SiteFacts> {
  assertLocalEngine();
  const urlCheck = normalizeUrl(rawUrl);
  if (!urlCheck.ok) throw new BlockedSiteError(rawUrl, urlCheck.error ?? "잘못된 URL", "empty");
  const url = urlCheck.url!;

  if (await shouldUseBrowse()) {
    const b = session();
    await b.viewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    const started = Date.now();
    const gotoOut = await b.goto(url);
    const loadMs = Date.now() - started;
    const facts = await b.js<PageFacts>(`JSON.stringify(${FACTS_SCRIPT})`);
    const check = detectBlock({
      status: parseStatus(gotoOut),
      title: facts.title,
      text: facts.textSample,
      linkCount: facts.navLinks.length,
    });
    if (check.blocked) throw new BlockedSiteError(url, check.reason ?? "원인 불명", check.kind);
    return { url, loadMs, ...facts };
  }
  return collectSiteFactsWithPlaywright(url);
}

async function collectSiteFactsWithPlaywright(url: string): Promise<SiteFacts> {
  return withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const started = Date.now();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const loadMs = Date.now() - started;
    const facts = await page.evaluate(() => {
      const txt = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const nav = document.querySelector("header nav, nav, header") ?? document.body;
      const navLinks = [...nav.querySelectorAll("a")]
        .map((a) => ({ text: txt(a), href: (a as HTMLAnchorElement).href }))
        .filter((l) => l.text)
        .slice(0, 40);
      const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
        .map((h) => ({ level: Number(h.tagName[1]), text: txt(h) }))
        .filter((h) => h.text)
        .slice(0, 80);
      const ctaTexts = [...document.querySelectorAll("a,button")]
        .map(txt)
        .filter((t) => t && t.length <= 30)
        .slice(0, 60);
      const imgs = [...document.querySelectorAll("img")];
      const styles = [...document.querySelectorAll("body *")].slice(0, 400).map((el) => getComputedStyle(el));
      return {
        title: document.title,
        navLinks,
        headings,
        ctaTexts,
        imageCount: imgs.length,
        oversizedImages: imgs.filter((i) => i.naturalWidth > 2400).length,
        missingAlt: imgs.filter((i) => !i.getAttribute("alt")).length,
        textSample: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 6000),
        fonts: [...new Set(styles.map((s) => s.fontFamily))].slice(0, 12),
        colors: [...new Set(styles.map((s) => s.color).concat(styles.map((s) => s.backgroundColor)))].slice(0, 24),
      };
    });
    await page.close();
    const check = detectBlock({
      title: facts.title,
      text: facts.textSample,
      linkCount: facts.navLinks.length,
    });
    if (check.blocked) throw new BlockedSiteError(url, check.reason ?? "원인 불명", check.kind);
    return { url, loadMs, ...facts };
  });
}
