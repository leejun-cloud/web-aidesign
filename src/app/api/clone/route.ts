import { NextResponse } from "next/server";
import { runClone } from "@/lib/design/clone";

export const maxDuration = 300;

/** PRD 밖 신규 기능 — URL 하나로 완전 복제 모드를 실행한다. 로컬 전용(assertLocalEngine 참조) */
export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string; brandBrief?: string };
  if (!body.url) return NextResponse.json({ error: "url 필요" }, { status: 400 });
  try {
    const result = await runClone(body.url, { brandBrief: body.brandBrief });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
