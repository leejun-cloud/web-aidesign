import { describe, expect, it } from "vitest";
import { buildBrief } from "@/lib/design/brief";
import { DesignBrief, LEVEL_PRESETS, PHOTO_PRESETS, type Reference } from "@/lib/types";

const tmplRef: Reference = { id: "A", kind: "template", value: "warm-nonprofit-ab12cd" };

describe("Template 로 새 프로젝트 시작 (PRD §42, §44)", () => {
  it("template Reference 하나로 brief 가 조립된다", () => {
    const brief = buildBrief({
      projectId: "p1",
      mode: "create",
      references: [tmplRef],
      level: "similar",
      advanced: LEVEL_PRESETS.similar,
      photo: PHOTO_PRESETS.similar,
    });
    expect(brief.references[0].kind).toBe("template");
    expect(brief.references[0].value).toBe("warm-nonprofit-ab12cd");
    expect(brief.blend).toBeUndefined();
  });

  it("Template 과 URL 을 함께 쓰면 조합 모드가 필요하다", () => {
    const args = {
      projectId: "p1",
      mode: "create" as const,
      references: [tmplRef, { id: "B", kind: "url" as const, value: "https://example.com" }],
      level: "similar" as const,
      advanced: LEVEL_PRESETS.similar,
      photo: PHOTO_PRESETS.similar,
    };
    expect(() => buildBrief(args)).toThrow();
    expect(buildBrief({ ...args, blend: "a-structure-b-style" }).blend).toBe("a-structure-b-style");
  });

  it("Template 재사용도 유사도 상한 90 을 넘지 못한다", () => {
    const brief = buildBrief({
      projectId: "p1",
      mode: "create",
      references: [tmplRef],
      level: "very",
      advanced: { ...LEVEL_PRESETS.very, layout: 100 },
      photo: PHOTO_PRESETS.very,
    });
    expect(brief.advanced.layout).toBe(90);
    expect(Math.max(...Object.values(brief.advanced))).toBeLessThanOrEqual(90);
  });

  it("kind 는 url / screenshot / template 셋뿐이다", () => {
    const base = {
      projectId: "p1", mode: "create", level: "similar",
      advanced: LEVEL_PRESETS.similar, photo: PHOTO_PRESETS.similar,
    };
    expect(DesignBrief.safeParse({ ...base, references: [tmplRef] }).success).toBe(true);
    expect(
      DesignBrief.safeParse({ ...base, references: [{ id: "A", kind: "figma", value: "x" }] }).success,
    ).toBe(false);
  });
});
