import { NextResponse } from "next/server";
import { MOTION_TEMPLATES } from "@/lib/design/motion";
import { listCustomMotionTemplates, toMotionTemplate } from "@/lib/design/motionLibrary";

/** 내장 12종 + 외부에서 추출한 커스텀 항목을 함께 반환한다 */
export async function GET() {
  try {
    const custom = await listCustomMotionTemplates();
    return NextResponse.json({
      builtin: MOTION_TEMPLATES,
      custom: custom.map((c) => ({ ...toMotionTemplate(c), sourceUrl: c.sourceUrl, createdAt: c.createdAt })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
