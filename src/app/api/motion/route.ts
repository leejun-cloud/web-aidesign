import { NextResponse } from "next/server";
import { z } from "zod";
import { StructuralViolation, runMotionEdit } from "@/lib/design/editRun";
import { MotionSettings, findMotion } from "@/lib/design/motion";
import { customMotionsAsExtra } from "@/lib/design/motionLibrary";
import { SectionEditRequest } from "@/lib/design/sectionEdit";

export const maxDuration = 300;

const Body = z.object({
  request: SectionEditRequest.omit({ instruction: true }).extend({
    instruction: z.string().default("Motion 적용"),
  }),
  settings: MotionSettings,
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다", issues: parsed.error.issues.slice(0, 8) },
      { status: 400 },
    );
  }
  // 내장 12종 + 외부에서 추출한 커스텀 Motion Template 을 함께 조회한다
  const extraMotions = await customMotionsAsExtra();
  if (!findMotion(parsed.data.settings.templateId, extraMotions)) {
    return NextResponse.json({ error: "알 수 없는 Motion 템플릿입니다" }, { status: 400 });
  }
  try {
    const r = await runMotionEdit(parsed.data.request, parsed.data.settings, { extraMotions });
    return NextResponse.json({
      version: r.version,
      label: r.label,
      changed: r.changed,
      reverted: r.reverted,
      audit: { sections: r.sections, tokens: r.tokens },
    });
  } catch (e) {
    const status = e instanceof StructuralViolation ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
