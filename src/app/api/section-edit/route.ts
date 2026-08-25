import { NextResponse } from "next/server";
import { StructuralViolation, runSectionEdit } from "@/lib/design/editRun";
import { SectionEditRequest } from "@/lib/design/sectionEdit";

export const maxDuration = 300;

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = SectionEditRequest.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다", issues: parsed.error.issues.slice(0, 8) },
      { status: 400 },
    );
  }
  try {
    const r = await runSectionEdit(parsed.data);
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
