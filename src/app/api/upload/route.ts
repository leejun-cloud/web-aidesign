import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { WORKSPACE, createProject, ensureProject } from "@/lib/store";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "PNG, JPG, WebP 이미지만 올릴 수 있습니다" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 10MB 를 넘습니다" }, { status: 413 });
  }

  const given = form.get("projectId");
  const projectId =
    typeof given === "string" && given ? given : await createProject("untitled");
  const p = await ensureProject(projectId);
  const filename = `ref-${nanoid(8)}${ext}`;
  const abs = path.join(p.reference, filename);
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ projectId, path: path.relative(WORKSPACE, abs) });
}
