import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreVersion } from "@/lib/design/editRun";

const Body = z.object({ projectId: z.string().min(1), version: z.number().int().positive() });

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "projectId 와 version 이 필요합니다" }, { status: 400 });
  try {
    return NextResponse.json(await restoreVersion(parsed.data.projectId, parsed.data.version));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
