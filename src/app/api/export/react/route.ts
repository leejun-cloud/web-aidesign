import { NextResponse } from "next/server";
import { htmlToReactComponent } from "@/lib/design/reactExport";
import { latestVersion, readVersion } from "@/lib/store";

/** 승인 여부와 무관하게 특정 버전(or 최신)의 HTML을 React 컴포넌트(.tsx)로 내려받는다 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId");
  const versionParam = params.get("version");
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  try {
    const { html } = versionParam
      ? await readVersion(projectId, Number(versionParam))
      : await latestVersion(projectId);
    const { code, componentName } = htmlToReactComponent(html);
    return new NextResponse(code, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${componentName}.tsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
