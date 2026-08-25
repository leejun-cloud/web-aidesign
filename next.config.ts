import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 package-lock.json 을 집어 오지 않도록 프로젝트 루트를 고정한다
  turbopack: { root: __dirname },
};

export default nextConfig;
