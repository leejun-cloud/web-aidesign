import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeExistingSite } from "@/lib/design/improve";
import { Note } from "@/lib/design/notes";
import { createProject, patchMeta, readMeta, type ProjectMeta } from "@/lib/store";
import { RewriteLevel } from "@/lib/types";
import { ImproveState } from "@/app/improve/logic";

export const maxDuration = 300;

type ImproveMeta = ProjectMeta & { improve?: unknown };

async function saveState(projectId: string, improve: unknown) {
  await patchMeta(projectId, { improve } as Partial<ProjectMeta>);
}

/** 새로고침 복구용 — 저장된 분석/승인 상태를 돌려준다 */
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  try {
    const meta = (await readMeta(projectId)) as ImproveMeta;
    const parsed = ImproveState.safeParse(meta.improve);
    return NextResponse.json({ projectId, improve: parsed.success ? parsed.data : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      rewriteLevel?: string;
      notes?: unknown;
      projectId?: string;
      approve?: "menu" | "migration";
    };

    // 승인 게이트 저장 (PRD §25)
    if (body.approve) {
      if (!body.projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
      const meta = (await readMeta(body.projectId)) as ImproveMeta;
      const parsed = ImproveState.safeParse(meta.improve);
      if (!parsed.success) {
        return NextResponse.json({ error: "저장된 분석 결과가 없습니다" }, { status: 400 });
      }
      const next: ImproveState = {
        ...parsed.data,
        ...(body.approve === "menu" ? { menuApproved: true } : { migrationApproved: true }),
      };
      await saveState(body.projectId, next);
      return NextResponse.json({ projectId: body.projectId, improve: next });
    }

    if (!body.url) return NextResponse.json({ error: "개선할 사이트 URL 이 필요합니다" }, { status: 400 });
    const level = RewriteLevel.safeParse(body.rewriteLevel ?? "clarify");
    if (!level.success) return NextResponse.json({ error: "rewriteLevel 이 올바르지 않습니다" }, { status: 400 });

    const projectId = body.projectId || (await createProject("improve"));
    // 사용자가 남긴 자유 요청을 분석 프롬프트에 실어 보낸다
    const notes = z.array(Note).max(20).safeParse(body.notes ?? []);
    const result = await analyzeExistingSite(body.url, level.data, {
      notes: notes.success ? notes.data : [],
    });

    const state: ImproveState = {
      url: body.url,
      rewriteLevel: level.data,
      facts: result.facts,
      analysis: result.analysis,
      menu: result.menu,
      migration: result.migration,
      migrationAudit: result.migrationAudit,
      menuApproved: false,
      migrationApproved: false,
    };
    await saveState(projectId, state);

    return NextResponse.json({ projectId, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
