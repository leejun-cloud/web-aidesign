import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * gstack `browse` 어댑터.
 *
 * 외부 사이트를 캡처·분석할 때 이걸 쓴다. Playwright 헤드리스는 Cloudflare 류 방어에
 * 막히고, 그때 **차단 페이지를 정상 페이지로 착각해 분석**해 버리는 것이 실제 사고였다.
 * browse 의 headed stealth 모드는 그 사이트들을 통과한다.
 *
 * 제약: browse 는 단일 데몬이고 `--headed` 는 데몬 시작 설정이다.
 * 설정이 다른 명령을 섞으면 거부하므로, 이 어댑터는 모드를 고정하고 호출을 직렬화한다.
 */

const BIN_CANDIDATES = [
  path.join(process.cwd(), ".claude/skills/gstack/browse/dist/browse"),
  path.join(os.homedir(), ".claude/skills/gstack/browse/dist/browse"),
];

let cachedBin: string | null | undefined;

export async function browseBin(): Promise<string | null> {
  if (cachedBin !== undefined) return cachedBin;
  for (const candidate of BIN_CANDIDATES) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      cachedBin = candidate;
      return candidate;
    } catch {
      // 다음 후보
    }
  }
  cachedBin = null;
  return null;
}

/** headed(stealth) 로 띄울지. 봇 방어를 통과해야 하므로 기본은 켜 둔다. */
const headed = () => process.env.VDNA_BROWSE_HEADED !== "0";

/** 데몬 하나에 상태가 얹히므로 명령을 직렬화한다 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

function exec(args: string[], timeoutMs: number, opts: { forceHeadless?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    void browseBin().then((bin) => {
      if (!bin) return reject(new Error("gstack browse 바이너리를 찾지 못했습니다"));
      const useHeaded = !opts.forceHeadless && headed();
      const full = useHeaded ? ["--headed", ...args] : args;
      const child = spawn(bin, full, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`browse 실행 실패: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const text = `${out}${err}`;
        // 데몬 설정 불일치는 재시작으로 풀린다
        if (/different config/.test(text)) {
          return reject(new DaemonConfigMismatch(text.trim()));
        }
        // headed(GUI) Chromium 부팅은 환경에 따라 실패하기 쉽다 —
        // 실제로 이 타임아웃 때문에 정상 사이트(linear.app) 캡처가 500 으로 막힌 사고가 있었다.
        // stealth 가 필요한 사이트는 드물므로, 부팅 실패 시 headless 로 내려가는 편이 안전하다.
        if (useHeaded && /Server failed to start|failed to start within/i.test(text)) {
          return reject(new HeadedBootFailure(text.trim()));
        }
        if (code !== 0) return reject(new Error(`browse ${args[0]} 실패 (exit ${code}): ${text.slice(0, 500)}`));
        resolve(out);
      });
    });
  });
}

class DaemonConfigMismatch extends Error {}
class HeadedBootFailure extends Error {}

/** 설정이 어긋난 데몬을 정리하고 한 번 다시 시도한다. headed 부팅 실패는 headless 로 내려간다. */
async function execResilient(args: string[], timeoutMs: number): Promise<string> {
  try {
    return await exec(args, timeoutMs);
  } catch (e) {
    if (e instanceof HeadedBootFailure) {
      await exec(["disconnect"], 30_000).catch(() => undefined);
      return exec(args, timeoutMs, { forceHeadless: true });
    }
    if (!(e instanceof DaemonConfigMismatch)) throw e;
    await exec(["disconnect"], 30_000).catch(() => undefined);
    return exec(args, timeoutMs);
  }
}

export interface BrowseSession {
  goto: (url: string) => Promise<string>;
  viewport: (w: number, h: number) => Promise<void>;
  screenshot: (out: string, opts?: { fullPage?: boolean }) => Promise<string>;
  js: <T>(expression: string) => Promise<T>;
}

/**
 * 하나의 논리적 세션. 내부적으로는 공유 데몬이므로 호출 전체를 직렬화한다.
 * 다른 Claude 세션도 같은 데몬을 쓸 수 있어, 여기서는 상태를 최소한으로만 만진다.
 */
export function session(): BrowseSession {
  const T = 3 * 60 * 1000;
  return {
    goto: (url) => serialize(() => execResilient(["goto", url], T)),
    viewport: (w, h) => serialize(() => execResilient(["viewport", `${w}x${h}`], 60_000)).then(() => undefined),
    screenshot: (out, opts) =>
      serialize(async () => {
        await fs.mkdir(path.dirname(out), { recursive: true });
        // browse 는 기본이 전체 페이지, --viewport 를 주면 보이는 영역만 찍는다
        const args = opts?.fullPage === false ? ["screenshot", "--viewport", out] : ["screenshot", out];
        await execResilient(args, T);
        return out;
      }),
    js: <T>(expression: string) =>
      serialize(async () => {
        const raw = await execResilient(["js", expression], T);
        return JSON.parse(raw.trim()) as T;
      }),
  };
}

/**
 * 봇 차단·오류 페이지를 정상 페이지로 착각하지 않기 위한 판별.
 * 이걸 거르지 않으면 차단 페이지를 분석해 엉뚱한 메뉴 개선안이 나온다 (실제로 겪었다).
 */
export interface BlockCheck {
  blocked: boolean;
  /** blocked: 봇 방어·오류 응답 / empty: 분석할 내용이 없는 페이지 */
  kind?: "blocked" | "empty";
  reason?: string;
}

const BLOCK_SIGNS = [
  /you have been blocked/i,
  /attention required/i,
  /access denied/i,
  /verify you are (a )?human/i,
  /checking your browser/i,
  /just a moment\.\.\./i,
  /enable javascript and cookies to continue/i,
  /request blocked/i,
  /ray id/i,
];

export function detectBlock(args: {
  status?: number;
  title: string;
  text: string;
  linkCount: number;
}): BlockCheck {
  const haystack = `${args.title}\n${args.text}`.slice(0, 4000);
  for (const sign of BLOCK_SIGNS) {
    if (sign.test(haystack)) {
      return { blocked: true, kind: "blocked", reason: `차단 문구 감지: ${sign.source}` };
    }
  }
  if (args.status && args.status >= 400) {
    return { blocked: true, kind: "blocked", reason: `HTTP ${args.status}` };
  }
  // 링크 3개 이하 + 본문 200자 미만이면 리디자인·평가의 입력으로 쓸 수 없다.
  // 차단일 수도, 원래 빈 페이지일 수도 있으므로 단정하지 않는다.
  if (args.linkCount <= 3 && args.text.trim().length < 200) {
    return {
      blocked: true,
      kind: "empty",
      reason: `분석할 내용이 부족합니다 (링크 ${args.linkCount}개, 본문 ${args.text.trim().length}자)`,
    };
  }
  return { blocked: false };
}

/** goto 출력에서 HTTP 상태를 뽑는다 — "Navigated to <url> (200)" */
export function parseStatus(gotoOutput: string): number | undefined {
  const m = gotoOutput.match(/\((\d{3})\)\s*$/m);
  return m ? Number(m[1]) : undefined;
}
