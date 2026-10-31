import { NextResponse } from "next/server";
import { renderBrochurePdf } from "@/lib/design/brochure";
import { latestVersion, readVersion } from "@/lib/store";

export const maxDuration = 300;

/** 승인 여부와 무관하게 특정 버전(or 최신)의 HTML을 인쇄용 PDF 브로슈어로 내려받는다 — 로컬 전용 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId");
  const versionParam = params.get("version");
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  try {
    const { html } = versionParam
      ? await readVersion(projectId, Number(versionParam))
      : await latestVersion(projectId);
    const pdf = await renderBrochurePdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${projectId}-brochure.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
