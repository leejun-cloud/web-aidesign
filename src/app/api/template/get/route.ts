import { NextResponse } from "next/server";
import { readTemplate } from "@/lib/design/templateStore";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  try {
    return NextResponse.json({ template: await readTemplate(id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
