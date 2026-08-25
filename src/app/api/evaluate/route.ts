import { NextResponse } from "next/server";
import { evaluateSite } from "@/lib/design/audit";
import type { ScoreHistoryEntry } from "@/lib/design/evaluate";
import { patchMeta, readMeta } from "@/lib/store";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { url, projectId } = (await req.json()) as { url?: string; projectId?: string };
    if (!url) return NextResponse.json({ error: "url 필요" }, { status: 400 });

    const report = await evaluateSite(url);

    let history: ScoreHistoryEntry[] | undefined;
    if (projectId) {
      // PRD §34 — 재평가 이력은 누적한다. 덮어쓰지 않는다.
      const meta = await readMeta(projectId);
      const prev = (meta.scores ?? []) as ScoreHistoryEntry[];
      history = [...prev, { at: report.measuredAt, total: report.total, label: url }];
      await patchMeta(projectId, { scores: history });
    }

    return NextResponse.json({ report, history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  try {
    const meta = await readMeta(projectId);
    return NextResponse.json({ history: (meta.scores ?? []) as ScoreHistoryEntry[] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
