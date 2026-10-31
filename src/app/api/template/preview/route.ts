import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { templateFilePath } from "@/lib/design/templateStore";

/** preview.html / 썸네일 PNG 서빙 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const shot = params.get("shot");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  try {
    if (shot === "desktop" || shot === "mobile") {
      const png = await fs.readFile(await templateFilePath(id, `preview-${shot}.png`));
      return new NextResponse(new Uint8Array(png), {
        headers: { "content-type": "image/png", "cache-control": "no-store" },
      });
    }
    const html = await fs.readFile(await templateFilePath(id, "preview.html"), "utf8");
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
