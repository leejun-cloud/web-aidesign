import fs from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Production Drift Score (PRD §56~§58) — 승인본과 Production 스크린샷을 실측 비교한다 */
export interface DriftResult {
  /** 0~100, 100 이 완전 일치 */
  fidelity: number;
  diffPixels: number;
  totalPixels: number;
  widthMismatch: boolean;
  heightDeltaPx: number;
  diffImagePath?: string;
}

async function readPng(file: string) {
  return PNG.sync.read(await fs.readFile(file));
}

/** 세로 길이가 다른 두 스크린샷도 비교 가능하도록 공통 높이로 자른다 */
export async function compareScreenshots(
  approvedPath: string,
  producedPath: string,
  diffOut?: string,
): Promise<DriftResult> {
  const a = await readPng(approvedPath);
  const b = await readPng(producedPath);

  const widthMismatch = a.width !== b.width;
  const heightDeltaPx = Math.abs(a.height - b.height);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);

  const crop = (src: PNG) => {
    if (src.width === width && src.height === height) return src;
    const out = new PNG({ width, height });
    PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const ca = crop(a);
  const cb = crop(b);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(ca.data, cb.data, diff.data, width, height, {
    threshold: 0.12,
    includeAA: true,
  });
  const totalPixels = width * height;

  if (diffOut) await fs.writeFile(diffOut, PNG.sync.write(diff));

  // 세로 길이 차이는 그 자체로 레이아웃 드리프트다
  const heightPenalty = Math.min(20, (heightDeltaPx / Math.max(a.height, 1)) * 100);
  const widthPenalty = widthMismatch ? 5 : 0;
  const fidelity = Math.max(
    0,
    Math.round(100 - (diffPixels / totalPixels) * 100 - heightPenalty - widthPenalty),
  );

  return {
    fidelity,
    diffPixels,
    totalPixels,
    widthMismatch,
    heightDeltaPx,
    diffImagePath: diffOut,
  };
}
