import { NextResponse } from "next/server";
import { resolveReference } from "@/lib/design/reference";
import { analyzeReference } from "@/lib/design/visualDna";
import { patchMeta, readMeta } from "@/lib/store";
import { DesignBrief } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });

    const meta = await readMeta(projectId);
    const parsed = DesignBrief.safeParse(meta.brief);
    if (!parsed.success) {
      return NextResponse.json({ error: "저장된 brief 가 없거나 형식이 올바르지 않습니다" }, { status: 400 });
    }
    const brief = parsed.data;

    const references = [];
    for (const ref of brief.references) references.push(await resolveReference(projectId, ref));

    const visualDna = await analyzeReference(references, {
      advanced: brief.advanced,
      blend: brief.blend,
      brandBrief: brief.brandBrief,
    });

    await patchMeta(projectId, { visualDna, brief: { ...brief, references } });
    return NextResponse.json({ visualDna, references });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  try {
    const meta = await readMeta(projectId);
    if (!meta.visualDna) return NextResponse.json({ error: "아직 분석 결과가 없습니다" }, { status: 404 });
    return NextResponse.json({ visualDna: meta.visualDna });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
