import { NextResponse } from "next/server";
import { checkWorkdir } from "@/lib/design/workdir";

/** 작업 디렉터리를 쓰기 전에 미리 점검한다 (존재·권한·git 상태) */
export async function POST(req: Request) {
  const { path } = (await req.json()) as { path?: string };
  if (!path) return NextResponse.json({ error: "path 필요" }, { status: 400 });
  return NextResponse.json(await checkWorkdir(path));
}
