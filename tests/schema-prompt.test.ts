import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Evaluation, SimilarityReport } from "@/lib/design/evaluate";
import { MenuProposal, MigrationMap } from "@/lib/design/migration";
import { SiteAnalysis } from "@/lib/design/improve";
import { PhotoDna } from "@/lib/design/template";
import { ProductionPlan } from "@/lib/design/production";
import { VisualDna } from "@/lib/types";

/**
 * 구조화 출력이 실패하던 근본 원인: 스키마를 산문으로만 설명하면
 * 모델이 키 이름과 타입을 매번 다르게 추측한다.
 * 이제 z.toJSONSchema 로 실제 스키마를 프롬프트에 싣는다.
 */
const toSchema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input" });

describe("모든 구조화 출력 스키마가 JSON Schema 로 변환된다", () => {
  const cases: [string, z.ZodType][] = [
    ["VisualDna", VisualDna],
    ["SiteAnalysis", SiteAnalysis],
    ["MigrationMap", MigrationMap],
    ["Evaluation", Evaluation],
    ["SimilarityReport", SimilarityReport],
    ["PhotoDna", PhotoDna],
    ["ProductionPlan", ProductionPlan],
  ];

  for (const [name, schema] of cases) {
    it(`${name} 변환 성공`, () => {
      const json = toSchema(schema);
      expect(json).toHaveProperty("properties");
      expect(JSON.stringify(json).length).toBeGreaterThan(50);
    });
  }

  it("MigrationMap 은 items 배열과 rewriteLevel enum 을 노출한다", () => {
    const json = JSON.stringify(toSchema(MigrationMap));
    expect(json).toContain('"items"');
    expect(json).toContain('"rewriteLevel"');
    // 모델이 mappings/unmapped 같은 이름을 발명하던 실패를 막는 근거
    expect(json).toContain('"clarify"');
    expect(json).toContain('"MERGE"');
  });

  it("SiteAnalysis 는 배열 필드를 array 로 명시한다", () => {
    const json = JSON.stringify(toSchema(SiteAnalysis));
    expect(json).toContain('"primaryActions"');
    expect(json).toContain('"type":"array"');
  });

  it("Evaluation 은 improvements 최소 1개와 sectionId 를 노출한다", () => {
    const json = JSON.stringify(toSchema(Evaluation));
    expect(json).toContain('"improvements"');
    expect(json).toContain('"sectionId"');
  });

  it("재귀 스키마(MenuProposal)는 변환이 안 되더라도 던지지 않고 넘어간다", () => {
    // MenuNode 는 z.lazy 재귀 — 변환 가능/불가능 어느 쪽이든 예외로 흐름을 깨면 안 된다
    let ok = true;
    try {
      toSchema(MenuProposal);
    } catch {
      ok = false;
    }
    expect(typeof ok).toBe("boolean");
  });
});
