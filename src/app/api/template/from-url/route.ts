import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { captureUrl } from "@/lib/design/capture";
import { normalizeUrl } from "@/lib/design/url";
import { generatePreview } from "@/lib/design/generate";
import { analyzeReference } from "@/lib/design/visualDna";
import { buildReferenceTemplateBrief, extractPhotoDna, saveTemplate } from "@/lib/design/templateStore";
import { templatesDir } from "@/lib/store";
import { LEVEL_PRESETS, SimilarityLevel } from "@/lib/types";

export const maxDuration = 300;

/**
 * 같은 (url, level) 로 진행 중인 요청을 공유한다.
 *
 * 실제로 있었던 사고: 이 요청은 캡처·Visual DNA 분석·생성까지 수 분 걸리는데,
 * 클라이언트(curl/브라우저)가 자체 타임아웃으로 먼저 끊겨도 서버는 처리를 계속한다.
 * 사용자가 "끊긴 줄 알고" 같은 요청을 다시 보내면, 이전 요청도 여전히 돌고 있어
 * 완전히 같은 작업이 두 번 실행되어 템플릿이 중복 생성됐다.
 * 키가 같은 요청은 새로 시작하지 않고 이미 진행 중인 Promise 에 합류시킨다.
 */
const inflight = new Map<string, Promise<{ status: number; body: unknown }>>();

/** PRD §43 — 외부 사이트에서 디자인 특성만 추출해 Reference Template 을 만든다 (복제가 아니다) */
export async function POST(req: Request) {
  const body0 = (await req.json()) as { url?: string; name?: string; level?: string };
  if (!body0.url) return NextResponse.json({ error: "url 필요" }, { status: 400 });
  const urlCheck0 = normalizeUrl(body0.url);
  if (!urlCheck0.ok) return NextResponse.json({ error: urlCheck0.error }, { status: 400 });
  const dedupeKey = `${urlCheck0.url}|${body0.level ?? "similar"}`;

  const existing = inflight.get(dedupeKey);
  if (existing) {
    const { status, body } = await existing;
    return NextResponse.json(body, { status });
  }

  const task = handle(body0).finally(() => inflight.delete(dedupeKey));
  inflight.set(dedupeKey, task);
  const { status, body } = await task;
  return NextResponse.json(body, { status });
}

async function handle(body: { url?: string; name?: string; level?: string }): Promise<{ status: number; body: unknown }> {
  try {
    if (!body.url) return { status: 400, body: { error: "url 필요" } };
    const urlCheck = normalizeUrl(body.url);
    if (!urlCheck.ok) return { status: 400, body: { error: urlCheck.error } };
    const url = urlCheck.url!;
    const level = SimilarityLevel.parse(body.level ?? "similar");
    const name = body.name?.trim() || new URL(url).hostname;

    const stagingId = `staging-${nanoid(6)}`;
    const staging = path.join(templatesDir(), ".staging", stagingId);
    await fs.mkdir(staging, { recursive: true });

    // 1) 스크린샷 (fullPage 금지 — 후속 AI 분석이 타임아웃된다)
    const shots = [
      await captureUrl(url, path.join(staging, "ref-desktop.png"), "desktop", { fullPage: false }),
      await captureUrl(url, path.join(staging, "ref-mobile.png"), "mobile", { fullPage: false }),
    ];

    const brief = buildReferenceTemplateBrief({ projectId: stagingId, sourceUrl: url, level, shots });

    // 2) Visual DNA + 3) Photo DNA
    const visualDna = await analyzeReference(brief.references, {
      advanced: LEVEL_PRESETS[level],
      brandBrief: brief.brandBrief,
    });
    const photoDna = await extractPhotoDna(shots, { name: `${name} Photo`, sourceUrl: url });

    // 4) 원본 마크업이 아니라 새 Preview 를 생성한다
    const generated = await generatePreview({ brief, visualDna });

    const template = await saveTemplate({
      name,
      html: generated.html,
      visualDna,
      photoDna,
      origin: "reference",
      sourceUrl: url,
      defaultLevel: level,
    });

    // 원본 스크린샷은 Template 자산이 아니다 — 분석이 끝나면 버린다
    await fs.rm(staging, { recursive: true, force: true });

    return {
      status: 200,
      body: {
        template,
        sections: generated.audit.found,
        attempts: generated.attempts,
        notice: "외부 사이트의 디자인 특성만 추출했습니다 — 복제가 아닙니다.",
      },
    };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message } };
  }
}
