import { NextResponse } from "next/server";
import { DesignBrief } from "@/lib/types";
import { createProject, ensureProject, patchMeta, readMeta, writeMeta } from "@/lib/store";

/**
 * 존재하지 않는 projectId 로 patchMeta 를 호출하면 project.json 이 없어 그대로 500 이 났다.
 * 다른 탭에서 만든 stale 한 id 재사용, workspace 초기화 후 재요청 등 실제로 일어날 수 있는 경로다.
 * 없으면 그 id 로 새로 부트스트랩한다.
 */
async function ensureMeta(projectId: string) {
  try {
    await readMeta(projectId);
  } catch {
    await ensureProject(projectId);
    await writeMeta(projectId, { projectId, name: projectId, createdAt: new Date().toISOString(), versions: [] });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const projectId =
    typeof body.projectId === "string" && body.projectId
      ? body.projectId
      : await createProject(typeof body.name === "string" ? body.name : "untitled");

  const parsed = DesignBrief.safeParse({ ...body, projectId });
  if (!parsed.success) {
    return NextResponse.json({ error: "brief 검증 실패", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureMeta(projectId);
  await patchMeta(projectId, { brief: parsed.data });
  return NextResponse.json({ projectId, brief: parsed.data });
}
