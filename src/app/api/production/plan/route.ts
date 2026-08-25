import { NextResponse } from "next/server";
import { Framework } from "@/lib/design/production";
import { approvedOrLatest, planProduction, productionSectionIds } from "@/lib/design/productionize";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: string; framework?: string };
    if (!body.projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
    const framework = Framework.parse(body.framework ?? "nextjs");

    const { html } = await approvedOrLatest(body.projectId);
    const sectionIds = productionSectionIds(html);
    const plan = await planProduction({ html, sectionIds, framework });
    return NextResponse.json({ plan, sectionIds });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
