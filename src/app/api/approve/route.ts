import { NextResponse } from "next/server";
import { approveDesign } from "@/lib/design/editRun";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
    const r = await approveDesign(projectId);
    // 감사 미달도 200 으로 돌려주고 무엇이 미달인지 UI 에 보여준다
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
