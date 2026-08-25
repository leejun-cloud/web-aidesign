import { describe, expect, it } from "vitest";
import { buildBrief, mergeAdvanced, presetFor } from "@/lib/design/brief";
import { LEVEL_PRESETS, PHOTO_PRESETS, type Axis, type Reference } from "@/lib/types";

const refA: Reference = { id: "a", kind: "url", value: "https://a.example.com" };
const refB: Reference = { id: "b", kind: "screenshot", value: "projects/p/reference/b.png" };

const base = {
  projectId: "p-1",
  mode: "create" as const,
  level: "similar" as const,
  advanced: LEVEL_PRESETS.similar,
  photo: PHOTO_PRESETS.similar,
};

describe("presetFor", () => {
  it("레벨별 프리셋이 그대로 반영된다", () => {
    for (const level of ["feel", "similar", "very"] as const) {
      const { advanced, photo } = presetFor(level);
      expect(advanced).toEqual(LEVEL_PRESETS[level]);
      expect(photo).toEqual(PHOTO_PRESETS[level]);
    }
  });
  it("프리셋 객체를 복사해서 준다 (원본 오염 금지)", () => {
    const { advanced } = presetFor("feel");
    advanced.layout = 7;
    expect(LEVEL_PRESETS.feel.layout).toBe(30);
  });
});

describe("mergeAdvanced", () => {
  it("dirty 축은 유지되고 non-dirty 축은 새 프리셋으로 바뀐다", () => {
    const current = { ...LEVEL_PRESETS.feel, layout: 65, motion: 10 };
    const dirty = new Set<Axis>(["layout", "motion"]);
    const next = mergeAdvanced("very", dirty, current);
    expect(next.layout).toBe(65);
    expect(next.motion).toBe(10);
    expect(next.color).toBe(LEVEL_PRESETS.very.color);
    expect(next.typography).toBe(LEVEL_PRESETS.very.typography);
  });
  it("dirty 가 없으면 전부 프리셋", () => {
    expect(mergeAdvanced("feel", new Set(), LEVEL_PRESETS.very)).toEqual(LEVEL_PRESETS.feel);
  });
  it("dirty 축의 범위 밖 값도 0~90 으로 clamp 된다", () => {
    const current = { ...LEVEL_PRESETS.feel, layout: 91, color: -5 };
    const next = mergeAdvanced("feel", new Set<Axis>(["layout", "color"]), current);
    expect(next.layout).toBe(90);
    expect(next.color).toBe(0);
  });
});

describe("buildBrief", () => {
  it("91 / -5 같은 값이 0~90 으로 clamp 된다", () => {
    const brief = buildBrief({
      ...base,
      references: [refA],
      advanced: { ...LEVEL_PRESETS.similar, layout: 91, color: -5 },
      photo: { ...PHOTO_PRESETS.similar, lighting: 1000, texture: -20 },
    });
    expect(brief.advanced.layout).toBe(90);
    expect(brief.advanced.color).toBe(0);
    expect(brief.photo.lighting).toBe(90);
    expect(brief.photo.texture).toBe(0);
  });

  it("reference 1개면 blend 없이 통과하고, blend 를 넣어도 버린다", () => {
    expect(buildBrief({ ...base, references: [refA] }).blend).toBeUndefined();
    expect(
      buildBrief({ ...base, references: [refA], blend: "a-lead" }).blend,
    ).toBeUndefined();
  });

  it("reference 2개면 blend 가 유지된다", () => {
    const brief = buildBrief({
      ...base,
      references: [refA, refB],
      blend: "a-structure-b-style",
    });
    expect(brief.blend).toBe("a-structure-b-style");
    expect(brief.references).toHaveLength(2);
  });

  it("reference 2개인데 blend 가 없으면 던진다", () => {
    expect(() => buildBrief({ ...base, references: [refA, refB] })).toThrow();
  });

  it("reference 3개면 던진다", () => {
    expect(() =>
      buildBrief({
        ...base,
        references: [refA, refB, { ...refA, id: "c" }],
        blend: "a-lead",
      }),
    ).toThrow();
  });

  it("빈 brandBrief 는 undefined 로 정리된다", () => {
    expect(buildBrief({ ...base, references: [refA], brandBrief: "   " }).brandBrief).toBeUndefined();
    expect(buildBrief({ ...base, references: [refA], brandBrief: "미니멀한 톤" }).brandBrief).toBe("미니멀한 톤");
  });
});
