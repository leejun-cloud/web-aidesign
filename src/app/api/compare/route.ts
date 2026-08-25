import { NextResponse } from "next/server";
import { compareSites } from "@/lib/design/audit";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { oursUrl, referenceUrl } = (await req.json()) as {
      oursUrl?: string;
      referenceUrl?: string;
    };
    if (!oursUrl || !referenceUrl) {
      return NextResponse.json({ error: "oursUrl, referenceUrl 모두 필요" }, { status: 400 });
    }
    const result = await compareSites(oursUrl, referenceUrl);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
