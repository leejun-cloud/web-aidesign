import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "vdna-motion-lib-"));
process.env.VDNA_WORKSPACE = workspace;

const { saveCustomMotionTemplate, listCustomMotionTemplates, toMotionTemplate, motionLibraryDir } =
  await import("@/lib/design/motionLibrary");
const { MotionDna } = await import("@/lib/design/motionDna");

const dna = MotionDna.parse({
  trigger: "hover",
  timingFeel: "짧고 경쾌한",
  choreography: "카드 전체가 동시에 반응",
  easingFeel: "탄성 있는",
  targetElements: ["카드"],
  intensity: "subtle",
  mood: ["경쾌함"],
  description: "호버 시 카드가 살짝 떠오르며 그림자가 짙어진다.",
  suits: ["services", "features"],
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("커스텀 Motion Template 저장/목록 (실제 파일시스템)", () => {
  it("저장하면 실제 파일이 생기고 원본 코드/애셋은 저장하지 않는다 — motion-dna.json 하나뿐", async () => {
    const saved = await saveCustomMotionTemplate({ name: "카드 호버 쇼케이스", sourceUrl: "https://motionsites.ai/x", motionDna: dna });
    const dir = path.join(motionLibraryDir(), saved.id);
    const files = await fs.readdir(dir);
    expect(files).toEqual(["motion-dna.json"]);
  });

  it("목록에서 최신순으로 조회된다", async () => {
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveCustomMotionTemplate({ name: "두 번째", sourceUrl: "https://motionsites.ai/y", motionDna: dna });
    const list = await listCustomMotionTemplates();
    expect(list[0].id).toBe(second.id);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("손상된 항목은 건너뛰고 나머지는 정상 반환한다", async () => {
    const brokenDir = path.join(motionLibraryDir(), "ext-broken");
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, "motion-dna.json"), "{ 이상한 json", "utf8");

    const list = await listCustomMotionTemplates();
    expect(list.find((t) => t.id === "ext-broken")).toBeUndefined();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("toMotionTemplate 변환은 내장 MotionTemplate 인터페이스와 호환된다", async () => {
    const saved = await saveCustomMotionTemplate({ name: "변환 테스트", sourceUrl: "https://x.com", motionDna: dna });
    const t = toMotionTemplate(saved);
    expect(t).toMatchObject({ id: saved.id, name: "변환 테스트", suits: ["services", "features"] });
    expect(t.no).toBe("EX");
  });
});
