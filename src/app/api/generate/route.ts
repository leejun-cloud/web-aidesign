import path from "node:path";
import { NextResponse } from "next/server";
import { generatePreview, refinePreview } from "@/lib/design/generate";
import { referenceShots, resolveReference } from "@/lib/design/reference";
import { auditTokens } from "@/lib/design/tokens";
import { readTemplate } from "@/lib/design/templateStore";
import { analyzeReference } from "@/lib/design/visualDna";
import { patchMeta, paths, readMeta, saveVersion } from "@/lib/store";
import { DesignBrief, VisualDna } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { projectId, refine } = (await req.json()) as { projectId?: string; refine?: boolean };
    if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });

    const meta = await readMeta(projectId);
    const parsedBrief = DesignBrief.safeParse(meta.brief);
    if (!parsedBrief.success) {
      return NextResponse.json({ error: "저장된 brief 가 없거나 형식이 올바르지 않습니다" }, { status: 400 });
    }
    let brief = parsedBrief.data;

    // Visual DNA 가 없으면 지금 만든다
    let visualDna: VisualDna;
    const stored = VisualDna.safeParse(meta.visualDna);
    if (stored.success) {
      visualDna = stored.data;
    } else {
      // 저장된 Template 은 이미 Visual DNA 를 갖고 있다 — 다시 분석하지 않는다 (PRD §42)
      const template = brief.references.find((r) => r.kind === "template");
      if (template) {
        visualDna = (await readTemplate(template.value)).visualDna;
      } else {
        const references = [];
        for (const ref of brief.references) references.push(await resolveReference(projectId, ref));
        brief = { ...brief, references };
        visualDna = await analyzeReference(references, {
          advanced: brief.advanced,
          blend: brief.blend,
          brandBrief: brief.brandBrief,
        });
      }
      await patchMeta(projectId, { visualDna, brief });
    }

    let result = await generatePreview({ brief, visualDna });

    if (refine !== false) {
      const shots = brief.references.flatMap(referenceShots);
      result = await refinePreview({
        html: result.html,
        brief,
        visualDna,
        shots,
        outDir: path.join(paths(projectId).design, "refine"),
      });
    }

    const entry = await saveVersion(projectId, result.html, "Initial");
    return NextResponse.json({
      projectId,
      version: entry.version,
      audit: result.audit,
      tokenAudit: auditTokens(result.html),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
