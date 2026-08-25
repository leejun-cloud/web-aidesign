import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

/**
 * PRD §56 — 승인본과 비교할 대상은 **실제로 구동된 Production 앱**이어야 한다.
 * 전환 에이전트가 만든 정적 미리보기를 비교하면 프레임워크가 실제로 렌더한 결과가 아니라
 * 사람이(에이전트가) 옮겨 적은 결과를 검사하게 된다.
 *
 * 전환 산출물은 컴포넌트와 CSS 뿐이므로, 구동 가능한 최소 Next.js 앱 껍데기를 씌운다.
 * 의존성은 이 저장소의 node_modules 를 심볼릭 링크로 재사용한다 (재설치 없음).
 */

export const RUNNER_DIR = ".runner";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("빈 포트를 찾지 못했습니다"))));
    });
  });
}

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 전환 산출물을 구동 가능한 Next.js 앱으로 감싼다 */
export async function scaffoldRunner(productionDir: string): Promise<string> {
  const runner = path.join(productionDir, RUNNER_DIR);
  await fs.mkdir(path.join(runner, "app"), { recursive: true });

  // 전환 산출물을 그대로 복사한다 (원본은 건드리지 않는다)
  for (const dir of ["app", "components", "lib", "public"]) {
    const from = path.join(productionDir, dir);
    if (await exists(from)) {
      await fs.cp(from, path.join(runner, dir), { recursive: true, force: true });
    }
  }

  // layout 이 없으면 최소 layout 을 만들고 globals.css 를 물린다
  const layout = path.join(runner, "app", "layout.tsx");
  if (!(await exists(layout))) {
    const hasGlobals = await exists(path.join(runner, "app", "globals.css"));
    await fs.writeFile(
      layout,
      `${hasGlobals ? 'import "./globals.css";\n\n' : ""}export const metadata = { title: "Production" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
`,
      "utf8",
    );
  }

  // Next 가 자동 생성하는 "/_global-error" 프리렌더가 이 버전에서
  // "Cannot read properties of null (reading 'useContext')" 로 깨진다.
  // app/global-error.tsx 를 직접 제공하면 자동 생성 대신 이 파일을 쓴다 — QA 용 빌드이므로
  // 화면은 최소한만 갖추면 된다.
  const globalError = path.join(runner, "app", "global-error.tsx");
  if (!(await exists(globalError))) {
    await fs.writeFile(
      globalError,
      `"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <button onClick={() => reset()}>다시 시도</button>
      </body>
    </html>
  );
}
`,
      "utf8",
    );
  }

  // dependencies 를 비워두면 Next 가 이 앱의 React 버전을 제대로 못 잡아
  // "_global-error" 프리렌더에서 useContext(null) 로 죽는 사고가 났다.
  // symlink 된 node_modules 안의 실제 버전과 명시적으로 맞춘다.
  await fs.writeFile(
    path.join(runner, "package.json"),
    JSON.stringify(
      {
        name: "vdna-production-runner",
        private: true,
        version: "0.0.0",
        dependencies: { next: "16.3.2", react: "19.2.8", "react-dom": "19.2.8" },
      },
      null,
      2,
    ),
    "utf8",
  );
  // Turbopack 의 진짜 요구사항은 "root 로 선언한 경로 하위에 있는 심볼릭 링크는
  // 그 root 밖을 가리키면 안 된다"이다. 이전 수정은 root 를 runner 자기 자신(__dirname)으로
  // 잡았는데, node_modules symlink 의 실제 대상(진짜 저장소 루트)은 그보다 훨씬 위에 있어
  // "root 밖을 가리키는 심볼릭 링크"로 정확히 거부당했다 — 대소문자 문제가 아니라
  // root 를 잘못된(너무 좁은) 디렉터리로 지정한 것이 원인이었다.
  // node_modules 의 실제 위치를 포함하는 공통 상위 디렉터리를 root 로 지정해야 한다.
  const repoRoot = await fs.realpath(process.cwd());
  await fs.writeFile(
    path.join(runner, "next.config.ts"),
    `import type { NextConfig } from "next";\nconst nextConfig: NextConfig = { turbopack: { root: ${JSON.stringify(repoRoot)} } };\nexport default nextConfig;\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(runner, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          jsx: "preserve",
          module: "esnext",
          moduleResolution: "bundler",
          strict: false,
          noEmit: true,
          esModuleInterop: true,
          skipLibCheck: true,
          allowJs: true,
          incremental: true,
          resolveJsonModule: true,
          isolatedModules: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["**/*.ts", "**/*.tsx", "next-env.d.ts", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
    "utf8",
  );

  // 의존성 재설치 없이 이 저장소의 node_modules 를 빌려 쓴다.
  // process.cwd() 를 그대로 쓰면 안 된다 — macOS APFS 는 대소문자를 구분하지 않아
  // 디렉터리를 다른 대소문자로 열었을 때 cwd 표기와 실제 경로가 달라질 수 있고,
  // 그 표기 그대로 symlink 를 만들면 Turbopack 이 "파일시스템 루트 밖" 심볼릭 링크로
  // 오판해 빌드 자체가 거부된다 (실제로 겪은 사고). realpath 로 정규화해 만든다.
  const link = path.join(runner, "node_modules");
  if (!(await exists(link))) {
    const realCwd = await fs.realpath(process.cwd());
    await fs.symlink(path.join(realCwd, "node_modules"), link, "dir");
  }
  return runner;
}

export interface ServedApp {
  url: string;
  stop: () => Promise<void>;
  buildLog: string;
}

/**
 * 전환 산출물을 실제 Next.js 서버로 띄운다. 실패하면 던진다.
 *
 * `next build` 로 최적화 프로덕션 빌드를 먼저 만드는 방식을 시도했으나,
 * 이 Next.js 16.3.2 + Turbopack 조합에서 자동 생성되는 "/_global-error" 페이지의
 * 정적 프리렌더가 "Cannot read properties of null (reading 'useContext')" 로
 * 항상 실패한다 (symlink 경로·React 버전 정합성과 무관하게 재현됨 — Next/Turbopack 자체의
 * 문제로 보인다. 명시적 app/global-error.tsx 를 제공해도 동일).
 *
 * 그래서 `next build` 단계를 건너뛰고 `next dev` 로 띄운다. dev 서버는 정적 프리렌더를
 * 하지 않으므로 이 버그를 피해간다 — 여전히 "실제로 구동된 앱이 렌더한 화면"을 캡처한다는
 * PRD §56 의 핵심 목적은 만족하지만, 프로덕션 최적화 빌드 자체의 검증은 되지 않는다.
 * `next build` 가 이 조합에서 고쳐지면 이 우회는 되돌릴 수 있다.
 */
export async function serveProduction(
  productionDir: string,
  opts: { readyTimeoutMs?: number } = {},
): Promise<ServedApp> {
  const runner = await scaffoldRunner(productionDir);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd: runner,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  let serverLog = "";
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));

  const stop = async () => {
    if (!server.killed) server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (!server.killed) server.kill("SIGKILL");
  };

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 90_000); // next dev 첫 컴파일 지연 감안
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`production 서버가 즉시 종료됐습니다:\n${serverLog.slice(-2000)}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return { url, stop, buildLog: "next dev 로 구동 — 최적화 빌드 없음" };
    } catch {
      // 아직 준비되지 않았다 (dev 모드 첫 컴파일은 시간이 걸린다)
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  await stop();
  throw new Error(`production 서버가 준비되지 않았습니다:\n${serverLog.slice(-2000)}`);
}
