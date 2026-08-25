import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { saveTemplate } from "@/lib/design/templateStore";
import { latestVersion, paths, readMeta } from "@/lib/store";
import { PhotoDna } from "@/lib/design/template";
import { VisualDna } from "@/lib/types";

export const maxDuration = 300;

/** PRD §42 — 확정된 디자인을 내 Template 으로 저장한다 */
export async function POST(req: Request) {
  try {
    const { projectId, name } = (await req.json()) as { projectId?: string; name?: string };
    if (!projectId || !name) return NextResponse.json({ error: "projectId, name 필요" }, { status: 400 });

    const p = paths(projectId);
    const approved = path.join(p.design, "approved-preview.html");
    let html: string;
    try {
      html = await fs.readFile(approved, "utf8");
    } catch {
      html = (await latestVersion(projectId)).html;
    }

    const meta = await readMeta(projectId);
    const visualDna = VisualDna.parse(meta.visualDna);
    // 확정 산출물에 photo-dna.json 이 있으면 쓰고, 없으면 Visual DNA 의 photography 축에서 만든다
    let photoDna: PhotoDna;
    try {
      photoDna = PhotoDna.parse(JSON.parse(await fs.readFile(path.join(p.design, "photo-dna.json"), "utf8")));
    } catch {
      photoDna = PhotoDna.parse({
        name: `${name} Photo`,
        traits: [visualDna.photography.composition, visualDna.photography.texture, visualDna.photography.imageRatio],
        lighting: visualDna.photography.lighting,
        grading: visualDna.photography.colorGrading,
        subject: visualDna.photography.humanPose || visualDna.photography.environment,
        depthOfField: visualDna.photography.depthOfField,
      });
    }

    let designMd: string | undefined;
    try {
      designMd = await fs.readFile(path.join(p.design, "DESIGN.md"), "utf8");
    } catch {
      designMd = undefined;
    }

    const template = await saveTemplate({ name, html, visualDna, photoDna, origin: "mine", designMd });
    return NextResponse.json({ template });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
