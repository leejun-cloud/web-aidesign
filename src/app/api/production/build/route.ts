import { NextResponse } from "next/server";
import { z } from "zod";
import { Note } from "@/lib/design/notes";
import { ProductionPlan } from "@/lib/design/production";
import { approvedOrLatest, runProduction } from "@/lib/design/productionize";
import { extractTokens, renderTokensCss } from "@/lib/design/tokens";
import { backupFiles, checkWorkdir } from "@/lib/design/workdir";
import { paths } from "@/lib/store";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      plan?: unknown;
      /** 지정하면 우리 workspace 대신 이 로컬 프로젝트에 직접 쓴다 */
      workdir?: string;
      notes?: unknown;
      /** 경고(git 아님·커밋 안 된 변경)를 확인했음 */
      confirmed?: boolean;
    };
    if (!body.projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
    const plan = ProductionPlan.parse(body.plan);
    const notes = z.array(Note).max(20).safeParse(body.notes ?? []);

    let outDir = paths(body.projectId).production;
    let backup = "";

    if (body.workdir?.trim()) {
      const check = await checkWorkdir(body.workdir);
      if (!check.ok) {
        return NextResponse.json({ error: check.errors.join(" / "), check }, { status: 400 });
      }
      // 되돌리기 어려운 경고는 사용자가 한 번 확인해야 넘어간다
      if (check.warnings.length && !body.confirmed) {
        return NextResponse.json(
          { needsConfirm: true, check, error: "확인이 필요합니다: " + check.warnings.join(" / ") },
          { status: 409 },
        );
      }
      outDir = check.root;
      const willWrite = [
        "app/globals.css",
        "app/page.tsx",
        "qa-preview.html",
        ...plan.components.map((c) => `components/${c.file}`),
      ];
      backup = await backupFiles(check.root, willWrite, stamp());
    }

    const { html } = await approvedOrLatest(body.projectId);
    const result = await runProduction({
      html,
      tokensCss: renderTokensCss(extractTokens(html)),
      plan,
      outDir,
      notes: notes.success ? notes.data : [],
    });

    return NextResponse.json({ files: result.files, outDir, backup: backup || null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
