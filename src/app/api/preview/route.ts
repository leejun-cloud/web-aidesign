import { latestVersion, readVersion } from "@/lib/store";

/** iframe 소스용 — 저장된 버전 HTML 을 그대로 서빙 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const version = url.searchParams.get("version");
  if (!projectId) return new Response("projectId 필요", { status: 400 });
  try {
    const { html } = version ? await readVersion(projectId, Number(version)) : await latestVersion(projectId);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
