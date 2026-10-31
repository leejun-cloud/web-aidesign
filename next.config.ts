import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 package-lock.json 을 집어 오지 않도록 프로젝트 루트를 고정한다
  turbopack: { root: __dirname },
  // jsdom(→ html-encoding-sniffer → @exodus/bytes)의 ESM 서브 의존성을 번들러가
  // externalRequire 로 잘못 감싸 Vercel에서 ERR_REQUIRE_ESM 으로 죽는다 —
  // 번들링하지 않고 런타임에 node_modules 를 그대로 require 하게 해서 우회한다.
  serverExternalPackages: ["jsdom", "playwright", "playwright-core"],
  // seed-templates/ 는 런타임에 동적 경로(fs.readdir/readFile)로 읽어 트레이서가 자동으로
  // 잡아내지 못한다 — 명시하지 않으면 Vercel 배포에서 템플릿 갤러리가 404 난다.
  outputFileTracingIncludes: {
    "/api/template/*": ["./seed-templates/**/*"],
    "/templates": ["./seed-templates/**/*"],
  },
};

export default nextConfig;
