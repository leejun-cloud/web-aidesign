import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { runAgentJson } from "@/lib/ai/cli";
import { captureHtml } from "@/lib/design/capture";
import { REQUIRED_DESIGN_SECTIONS } from "@/lib/design/designMd";
import type { MotionSettings } from "@/lib/design/motion";
import {
  DesignTemplate,
  PhotoDna,
  REFERENCE_TEMPLATE_GUARDRAIL,
  TEMPLATE_FILES,
  auditTemplateFiles,
} from "@/lib/design/template";
import { COPYRIGHT_GUARD } from "@/lib/design/visualDna";
import { templatesDir } from "@/lib/store";
import {
  LEVEL_PRESETS,
  PHOTO_PRESETS,
  type DesignBrief,
  type SimilarityLevel,
  type VisualDna,
} from "@/lib/types";

/** Template 메타 원본 — TEMPLATE_FILES 외에 목록 화면용으로 함께 저장한다 */
export const TEMPLATE_META_FILE = "template.json";

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "template"
  );
}

export interface SaveTemplateArgs {
  name: string;
  /** 승인 HTML 또는 새로 생성한 Preview HTML — 원본 사이트 마크업이면 안 된다 */
  html: string;
  visualDna: VisualDna;
  photoDna: PhotoDna;
  origin: "mine" | "reference";
  sourceUrl?: string;
  motion?: MotionSettings[];
  designMd?: string;
  defaultLevel?: SimilarityLevel;
  /** 테스트/검증용 — 스크린샷 캡처를 건너뛸 때 쓰는 더미 PNG 생성기 */
  shotWriter?: (file: string, viewport: "desktop" | "mobile") => Promise<void>;
}

/**
 * DESIGN.md 를 AI 없이도 최소 요건으로 채운다 (AI 로 쓴 문서가 있으면 그걸 쓴다).
 * tokens.ts(→jsdom)를 함수 안에서 동적으로 불러온다 — 최상단에서 정적 import 하면
 * jsdom 의 ESM 서브 의존성 로딩 문제가 이 파일을 쓰는 모든 곳(예: /templates 목록)에 번진다.
 */
export async function fallbackDesignMd(args: { name: string; visualDna: VisualDna; html: string }): Promise<string> {
  const { extractTokens } = await import("@/lib/design/tokens");
  const d = args.visualDna;
  const body: Record<string, string> = {
    "Design Direction": `${args.name} — 분위기: ${d.mood.join(", ")}. hero 구조: ${d.layout.heroStructure}`,
    "Color System": `background ${d.color.background} / surface ${d.color.surface} / primary ${d.color.primary} / secondary ${d.color.secondary} / accent ${d.color.accent} / text ${d.color.text}. 채도 ${d.color.saturation}, 색온도 ${d.color.temperature}`,
    Typography: `${d.typography.fontPersonality}. 스케일 ${d.typography.headingScale}, 굵기 ${d.typography.weight}, 행간 ${d.typography.lineHeight}, 자간 ${d.typography.letterSpacing}. 위계: ${d.typography.hierarchy}`,
    Spacing: `섹션 간격 ${d.spacing.sectionGap}, 컨테이너 패딩 ${d.spacing.containerPadding}, 카드 패딩 ${d.spacing.cardPadding}, 콘텐츠 간격 ${d.spacing.contentGap}, hero 여백 ${d.spacing.heroWhitespace}`,
    Layout: `컨테이너 ${d.layout.containerWidth}, 정렬 ${d.layout.contentAlignment}, 이미지 배치 ${d.layout.imagePlacement}`,
    Grid: `${d.layout.grid}. 섹션 순서: ${d.layout.sectionOrder.join(" → ")}`,
    Photography: `구도 ${d.photography.composition}, 조명 ${d.photography.lighting}, 그레이딩 ${d.photography.colorGrading}, 화각 ${d.photography.cameraAngle}, 심도 ${d.photography.depthOfField}, 비율 ${d.photography.imageRatio}`,
    Components: `테두리 ${d.components.border}, 라운드 ${d.components.radius}, 그림자 ${d.components.shadow}`,
    Navigation: d.components.navigation || `헤더: ${d.layout.header}`,
    Buttons: d.components.buttons,
    Forms: d.components.forms,
    Cards: d.components.cards,
    Motion: `fade ${d.motion.fade} / reveal ${d.motion.reveal} / scroll ${d.motion.scroll} / hover ${d.motion.hover} / transition ${d.motion.transition}`,
    Responsive: `브레이크포인트: ${extractTokens(args.html).breakpoints.join(", ") || "390 / 834 / 1440 기준"}`,
    Do: [
      "- preview.html 의 수치를 그대로 사용한다",
      "- 색·간격·타이포는 design-tokens.css 의 변수로만 참조한다",
      "- 섹션의 data-vdna-id 와 순서를 유지한다",
      "- 반응형은 위 브레이크포인트를 그대로 쓴다",
    ].join("\n"),
    "Don't": [
      "- 이 문서만 보고 새로 디자인하지 않는다",
      "- 토큰을 우회한 하드코딩 색상을 쓰지 않는다",
      "- 섹션을 합치거나 쪼개지 않는다",
      "- 임의로 값을 '개선'하지 않는다",
    ].join("\n"),
  };

  return [
    `# ${args.name} — DESIGN.md`,
    "",
    "> 자료 우선순위: preview.html(= approved-preview.html 에 상응) > preview-desktop.png > preview-mobile.png > design-tokens.css > DESIGN.md",
    "> 이 문서만 보고 새로 디자인하지 마라. 수치가 어긋나면 preview.html 이 맞다.",
    "",
    ...REQUIRED_DESIGN_SECTIONS.map((s) => `## ${s}\n${body[s] ?? "(preview.html 참조)"}\n`),
  ].join("\n");
}

/** PRD §41, §52 — Template 디렉터리에 8개 파일을 모두 만든다 */
export async function saveTemplate(args: SaveTemplateArgs): Promise<DesignTemplate> {
  const id = `${slug(args.name)}-${nanoid(6)}`;
  const dir = path.join(templatesDir(), id);
  await fs.mkdir(dir, { recursive: true });

  const meta: DesignTemplate = DesignTemplate.parse({
    id,
    name: args.name,
    origin: args.origin,
    sourceUrl: args.sourceUrl,
    createdAt: new Date().toISOString(),
    visualDna: args.visualDna,
    photoDna: args.photoDna,
    motion: args.motion ?? [],
    defaultLevel: args.defaultLevel ?? "similar",
  });

  const write = (file: string, content: string) => fs.writeFile(path.join(dir, file), content, "utf8");

  const { extractTokens, renderTokensCss } = await import("@/lib/design/tokens");
  await write("preview.html", args.html);
  await write(
    "DESIGN.md",
    args.designMd ?? (await fallbackDesignMd({ name: args.name, visualDna: args.visualDna, html: args.html })),
  );
  await write("design-tokens.css", renderTokensCss(extractTokens(args.html)));
  await write("visual-dna.json", JSON.stringify(args.visualDna, null, 2));
  await write("photo-dna.json", JSON.stringify(args.photoDna, null, 2));
  await write("motion.json", JSON.stringify(meta.motion, null, 2));
  await write(TEMPLATE_META_FILE, JSON.stringify(meta, null, 2));

  // fullPage 는 4MB 를 넘어 후속 AI 분석이 타임아웃된다 — 뷰포트 크기로만 찍는다
  for (const vp of ["desktop", "mobile"] as const) {
    const file = path.join(dir, `preview-${vp}.png`);
    if (args.shotWriter) await args.shotWriter(file, vp);
    else await captureHtml(args.html, file, vp, { fullPage: false });
  }

  const audit = auditTemplateFiles(await fs.readdir(dir));
  if (!audit.ok) throw new Error(`Template 파일 누락: ${audit.missing.join(", ")}`);
  return meta;
}

/**
 * 미리 만들어 둔 Reference Template(디자인 가이드 샘플)을 담아두는 저장소.
 * workspace/ 는 .gitignore 대상이라 사용자 프로젝트 데이터는 배포에 포함되지 않지만,
 * 이 디렉터리는 git에 커밋되어 배포 환경(Vercel)에서도 템플릿 갤러리를 그대로 보여줄 수 있다.
 */
export const SEED_TEMPLATES_DIR = path.join(process.cwd(), "seed-templates");

async function findTemplateRoot(id: string): Promise<string> {
  for (const root of [templatesDir(), SEED_TEMPLATES_DIR]) {
    const dir = path.join(root, id);
    if (!dir.startsWith(root + path.sep)) continue; // 경로 탈출 방지
    try {
      await fs.access(dir);
      return dir;
    } catch {
      // 다음 저장소 확인
    }
  }
  throw new Error(`Template ${id} 를 찾을 수 없습니다`);
}

async function listTemplateIds(root: string): Promise<string[]> {
  try {
    return await fs.readdir(root);
  } catch {
    return [];
  }
}

export async function listTemplates(): Promise<DesignTemplate[]> {
  const ids = new Set([...(await listTemplateIds(templatesDir())), ...(await listTemplateIds(SEED_TEMPLATES_DIR))]);
  const out: DesignTemplate[] = [];
  for (const id of ids) {
    try {
      out.push(await readTemplate(id));
    } catch {
      // 미완성 디렉터리는 목록에서 제외한다
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readTemplate(id: string): Promise<DesignTemplate> {
  const dir = await findTemplateRoot(id);
  const audit = auditTemplateFiles(await fs.readdir(dir));
  if (!audit.ok) throw new Error(`Template ${id} 파일 누락: ${audit.missing.join(", ")}`);
  const raw = await fs.readFile(path.join(dir, TEMPLATE_META_FILE), "utf8");
  return DesignTemplate.parse(JSON.parse(raw));
}

export function templateDir(id: string) {
  const dir = path.join(templatesDir(), id);
  // 경로 탈출 방지
  if (!dir.startsWith(templatesDir() + path.sep)) throw new Error("잘못된 template id");
  return dir;
}

export const templateFilePath = async (id: string, file: (typeof TEMPLATE_FILES)[number]) =>
  path.join(await findTemplateRoot(id), file);

/** PRD §50 — Reference 스크린샷에서 Photo DNA 만 따로 추출한다 */
export function buildPhotoDnaPrompt(shots: string[], opts: { name: string; sourceUrl?: string }): string {
  return [
    "당신은 Photography Director 다. 첨부된 웹사이트 스크린샷에 쓰인 **사진의 촬영 특성**만 추출해 구조화 JSON 으로 적는다.",
    `## 이름\n이 Photo DNA 의 name 은 "${opts.name}" 로 적는다.`,
    opts.sourceUrl ? `## 출처(기록용)\n${opts.sourceUrl}` : "",
    [
      "## 채울 항목",
      "- traits: 재현 가능한 촬영 특성 3개 이상 (예: '역광 실루엣', '얕은 심도 인물 클로즈업')",
      "- lighting: 광원의 방향·성질·대비",
      "- grading: 색보정 경향 (색온도, 채도, 대비, 필름 느낌 등)",
      "- subject: 피사체의 성격 (인물/제품/공간/추상)",
      "- depthOfField: 심도와 배경 처리",
    ].join("\n"),
    `## 대상 스크린샷\n${shots.map((s) => `- ${s}`).join("\n")}`,
    "사진에 담긴 특정 인물·로고·저작물을 묘사하거나 재현 대상으로 삼지 않는다. 촬영 방식만 기술한다.",
    COPYRIGHT_GUARD,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function extractPhotoDna(
  shots: string[],
  opts: { name: string; sourceUrl?: string; model?: string },
): Promise<PhotoDna> {
  if (!shots.length) throw new Error("Photo DNA 를 뽑을 스크린샷이 없습니다");
  return runAgentJson(PhotoDna, {
    prompt: buildPhotoDnaPrompt(shots, opts),
    images: shots,
    model: opts.model,
  });
}

/**
 * PRD §43 — 외부 사이트로 Template 을 만들 때 쓰는 생성 브리프.
 * brandBrief 에 REFERENCE_TEMPLATE_GUARDRAIL 을 실어 생성 프롬프트까지 전달한다.
 */
export function buildReferenceTemplateBrief(args: {
  projectId: string;
  sourceUrl: string;
  level: SimilarityLevel;
  shots: string[];
}): DesignBrief {
  return {
    projectId: args.projectId,
    mode: "create",
    references: [
      {
        id: "ref-a",
        kind: "url",
        value: args.sourceUrl,
        desktopShot: args.shots[0],
        mobileShot: args.shots[1],
      },
    ],
    level: args.level,
    advanced: LEVEL_PRESETS[args.level],
    photo: PHOTO_PRESETS[args.level],
    brandBrief: [
      "이 결과물은 재사용 가능한 Design Template 의 preview.html 이다. 특정 브랜드의 문안이 아니라 중립적인 예시 카피를 쓴다.",
      REFERENCE_TEMPLATE_GUARDRAIL,
    ].join("\n\n"),
  };
}
