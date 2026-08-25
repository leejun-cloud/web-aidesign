import fs from "node:fs/promises";
import path from "node:path";
import { captureUrl } from "@/lib/design/capture";
import { ensureProject, WORKSPACE } from "@/lib/store";
import type { Reference } from "@/lib/types";

/** workspace 상대 경로든 절대 경로든 실제 파일 절대 경로로 정규화 */
export function resolveShotPath(p: string) {
  return path.isAbsolute(p) ? p : path.join(WORKSPACE, p);
}

/**
 * Reference 를 분석 가능한 상태로 만든다 (PRD §5).
 * kind=url  → desktop/mobile 스크린샷을 캡처해 desktopShot/mobileShot 을 채운다
 * kind=screenshot → 파일 존재만 검증하고 desktopShot 으로 사용
 */
export async function resolveReference(projectId: string, ref: Reference): Promise<Reference> {
  const p = await ensureProject(projectId);

  if (ref.kind === "url") {
    const desktop = path.join(p.reference, `${ref.id}-desktop.png`);
    const mobile = path.join(p.reference, `${ref.id}-mobile.png`);
    await captureUrl(ref.value, desktop, "desktop");
    await captureUrl(ref.value, mobile, "mobile");
    return { ...ref, desktopShot: desktop, mobileShot: mobile };
  }

  if (ref.kind === "screenshot") {
    const file = resolveShotPath(ref.value);
    await fs.access(file);
    return { ...ref, desktopShot: file };
  }

  // template: 스크린샷이 이미 붙어 있으면 검증만 한다
  if (ref.desktopShot) await fs.access(resolveShotPath(ref.desktopShot));
  return ref;
}

export function referenceShots(ref: Reference): string[] {
  return [ref.desktopShot, ref.mobileShot].filter((s): s is string => !!s).map(resolveShotPath);
}
