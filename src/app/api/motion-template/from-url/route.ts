import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { captureUrl } from "@/lib/design/capture";
import { extractMotionDna } from "@/lib/design/motionDna";
import { saveCustomMotionTemplate } from "@/lib/design/motionLibrary";
import { normalizeUrl } from "@/lib/design/url";
import { WORKSPACE } from "@/lib/store";

export const maxDuration = 300;

/**
 * 같은 URL 로 진행 중인 요청을 공유한다 (template/from-url 에서 겪은 것과 같은 사고 방지 —
 * 클라이언트가 타임아웃으로 끊겨도 서버는 계속 처리하므로, 재시도가 중복 추출을 만든다).
 */
const inflight = new Map<string, Promise<{ status: number; body: unknown }>>();

/** PRD §43 원칙을 모션에 적용 — 외부 모션 쇼케이스 사이트에서 특성만 추출한다 (복제가 아니다) */
export async function POST(req: Request) {
  const body0 = (await req.json()) as { url?: string; name?: string };
  if (!body0.url) return NextResponse.json({ error: "url 필요" }, { status: 400 });
  const check0 = normalizeUrl(body0.url);
  if (!check0.ok) return NextResponse.json({ error: check0.error }, { status: 400 });

  const key = check0.url!;
  const existing = inflight.get(key);
  if (existing) {
    const { status, body } = await existing;
    return NextResponse.json(body, { status });
  }

  const task = handle(check0.url!, body0.name).finally(() => inflight.delete(key));
  inflight.set(key, task);
  const { status, body } = await task;
  return NextResponse.json(body, { status });
}

async function handle(url: string, rawName?: string): Promise<{ status: number; body: unknown }> {
  const name = rawName?.trim() || new URL(url).hostname;
  const staging = path.join(WORKSPACE, ".staging", `motion-${Date.now()}`);
  await fs.mkdir(staging, { recursive: true });

  try {
    // 스크롤 위치를 바꿔가며 여러 장 찍는다 — 정지 화면이지만 위치 차이로 모션 방향/구성을 추정할 단서가 늘어난다
    const shots: string[] = [];
    const top = path.join(staging, "top.png");
    await captureUrl(url, top, "desktop", { fullPage: false });
    shots.push(top);

    const mid = path.join(staging, "mid.png");
    try {
      await captureUrl(url, mid, "desktop", { fullPage: true });
      shots.push(mid);
    } catch {
      // fullPage 캡처가 무겁게 실패해도 top 스크린샷만으로 계속 진행한다
    }

    const motionDna = await extractMotionDna({ url, shots });
    const template = await saveCustomMotionTemplate({ name, sourceUrl: url, motionDna });

    return {
      status: 200,
      body: {
        template,
        notice: "외부 사이트의 모션 특성만 추출했습니다 — 실제 코드나 애셋을 복제하지 않습니다.",
      },
    };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message } };
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
