/** Vercel 서버리스 환경인지 여부 — Vercel이 모든 빌드/런타임에 자동으로 심는 값 */
export const isServerless = !!process.env.VERCEL;

export class LocalOnlyError extends Error {
  constructor() {
    super(
      "이 기능은 로컬 Claude/Codex CLI와 브라우저 자동화가 필요해 배포 환경에서는 사용할 수 없습니다. " +
        "로컬에서 `npm run dev`로 실행해 주세요.",
    );
    this.name = "LocalOnlyError";
  }
}

/** AI(CLI 스폰) 또는 Playwright 가 필요한 작업 진입점에서 제일 먼저 호출한다 */
export function assertLocalEngine() {
  if (isServerless) throw new LocalOnlyError();
}
