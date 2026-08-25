import { describe, expect, it } from "vitest";
import { MOTION_TEMPLATES, MotionSettings, motionInstruction, resolveMotion } from "@/lib/design/motion";

describe("Motion Library", () => {
  it("PRD §46 의 12종을 모두 제공한다", () => {
    expect(MOTION_TEMPLATES).toHaveLength(12);
    expect(new Set(MOTION_TEMPLATES.map((t) => t.id)).size).toBe(12);
    expect(MOTION_TEMPLATES.map((t) => t.no)).toEqual(
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
    );
  });
  it("speed/intensity 를 숫자로 번역한다", () => {
    const slow = resolveMotion({ templateId: "fade-up", speed: "slow", intensity: "strong" });
    const fast = resolveMotion({ templateId: "fade-up", speed: "fast", intensity: "subtle" });
    expect(slow.durationMs).toBeGreaterThan(fast.durationMs);
    expect(slow.distancePx).toBeGreaterThan(fast.distancePx);
  });
  it("기본값은 normal/medium 이다", () => {
    expect(MotionSettings.parse({ templateId: "fade-up" })).toEqual({
      templateId: "fade-up", speed: "normal", intensity: "medium",
    });
  });
  it("알 수 없는 템플릿은 던진다", () => {
    expect(() => resolveMotion({ templateId: "nope", speed: "normal", intensity: "medium" })).toThrow();
  });
  it("지시문은 대상 섹션만 수정하도록 못박고 reduced-motion 을 요구한다", () => {
    const s = motionInstruction("hero", { templateId: "image-reveal", speed: "normal", intensity: "medium" });
    expect(s).toContain("`hero`");
    expect(s).toContain("다른 섹션");
    expect(s).toContain("prefers-reduced-motion");
  });
});
