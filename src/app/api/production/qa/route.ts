import { NextResponse } from "next/server";
import { ProductionPlan } from "@/lib/design/production";
import { approvedOrLatest, approvedShot, visualQa } from "@/lib/design/productionize";
import { extractTokens, renderTokensCss } from "@/lib/design/tokens";
import { paths } from "@/lib/store";

export const maxDuration = 300;

/** PRD §56~§58 — Fidelity 측정 + 90 미만이면 자동 수정 루프 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: string; plan?: unknown; autoCorrect?: boolean };
    if (!body.projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });

    const { html } = await approvedOrLatest(body.projectId);
    const shot = await approvedShot(body.projectId, html, "desktop");
    const plan = body.autoCorrect && body.plan ? ProductionPlan.parse(body.plan) : null;

    const result = await visualQa({
      projectId: body.projectId,
      approvedShot: shot,
      correct: plan
        ? { html, tokensCss: renderTokensCss(extractTokens(html)), plan, outDir: paths(body.projectId).production }
        : undefined,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
