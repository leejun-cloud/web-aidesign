import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { WORKSPACE } from "@/lib/store";
import { MotionDna } from "@/lib/design/motionDna";
import type { MotionTemplate } from "@/lib/design/motion";

/**
 * 외부 사이트에서 추출한 Motion Template 저장소.
 * 내장 12종(motion.ts 의 MOTION_TEMPLATES)과 나란히 쓰이는 재사용 자산 라이브러리다 —
 * PRD §51 의 Photo DNA Library 와 같은 성격.
 */
export const CustomMotionTemplate = z.object({
  id: z.string(),
  name: z.string().min(1),
  sourceUrl: z.string(),
  createdAt: z.string(),
  motionDna: MotionDna,
});
export type CustomMotionTemplate = z.infer<typeof CustomMotionTemplate>;

export const motionLibraryDir = () => path.join(WORKSPACE, "motion-templates");

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function saveCustomMotionTemplate(args: {
  name: string;
  sourceUrl: string;
  motionDna: MotionDna;
}): Promise<CustomMotionTemplate> {
  const id = `ext-${args.name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "motion"}-${nanoid(6)}`;
  const dir = path.join(motionLibraryDir(), id);
  await fs.mkdir(dir, { recursive: true });
  const record: CustomMotionTemplate = {
    id,
    name: args.name,
    sourceUrl: args.sourceUrl,
    createdAt: new Date().toISOString(),
    motionDna: args.motionDna,
  };
  await fs.writeFile(path.join(dir, "motion-dna.json"), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function listCustomMotionTemplates(): Promise<CustomMotionTemplate[]> {
  const dir = motionLibraryDir();
  if (!(await exists(dir))) return [];
  const ids = await fs.readdir(dir);
  const out: CustomMotionTemplate[] = [];
  for (const id of ids) {
    try {
      const raw = await fs.readFile(path.join(dir, id, "motion-dna.json"), "utf8");
      const parsed = CustomMotionTemplate.safeParse(JSON.parse(raw));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // 손상된 항목은 건너뛴다
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 커스텀 항목을 내장 MotionTemplate 과 같은 모양으로 바꿔, 같은 조회/적용 경로를 타게 한다 */
export function toMotionTemplate(t: CustomMotionTemplate): MotionTemplate {
  return {
    id: t.id,
    no: "EX",
    name: t.name,
    description: t.motionDna.description,
    suits: t.motionDna.suits,
  };
}

/** motion.ts 의 findMotion/resolveMotion/motionInstruction 에 넘길 extra 목록 */
export async function customMotionsAsExtra(): Promise<MotionTemplate[]> {
  return (await listCustomMotionTemplates()).map(toMotionTemplate);
}
