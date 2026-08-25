import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/design/templateStore";

export async function GET() {
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
