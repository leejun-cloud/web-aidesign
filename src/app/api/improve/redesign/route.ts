import { NextResponse } from "next/server";
import { generatePreview } from "@/lib/design/generate";
import { resolveReference } from "@/lib/design/reference";
import { auditTokens } from "@/lib/design/tokens";
import { analyzeReference } from "@/lib/design/visualDna";
import { patchMeta, readMeta, saveVersion, type ProjectMeta } from "@/lib/store";
import { DesignBrief, VisualDna } from "@/lib/types";
import { validateApproval, withApprovedStructure } from "@/app/improve/logic";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });

    const meta = (await readMeta(projectId)) as ProjectMeta & { improve?: unknown };

    // PRD §25 — 승인 없이는 Preview 에 반영하지 않는다
    const gate = validateApproval(meta.improve);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const parsedBrief = DesignBrief.safeParse(meta.brief);
    if (!parsedBrief.success) {
      return NextResponse.json({ error: "저장된 brief 가 없거나 형식이 올바르지 않습니다" }, { status: 400 });
    }
    let brief = parsedBrief.data;

    // Reference → Visual DNA
    let visualDna: VisualDna;
    const stored = VisualDna.safeParse(meta.visualDna);
    if (stored.success) {
      visualDna = stored.data;
    } else {
      const references = [];
      for (const ref of brief.references) references.push(await resolveReference(projectId, ref));
      brief = { ...brief, references };
      visualDna = await analyzeReference(references, {
        advanced: brief.advanced,
        blend: brief.blend,
        brandBrief: brief.brandBrief,
      });
      await patchMeta(projectId, { visualDna, brief });
    }

    // 승인된 메뉴 구조와 Migration Map 을 생성 프롬프트에 싣는다
    const result = await generatePreview({
      brief: withApprovedStructure(brief, gate.state),
      visualDna,
    });

    const entry = await saveVersion(projectId, result.html, "리디자인 v1");
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
