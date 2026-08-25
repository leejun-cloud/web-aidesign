import { describe, expect, it } from "vitest";
import { MOTION_EXTRACTION_GUARDRAIL, MotionDna, buildMotionExtractionPrompt } from "@/lib/design/motionDna";
import { findMotion, motionInstruction, resolveMotion, type MotionTemplate } from "@/lib/design/motion";
import { toMotionTemplate, type CustomMotionTemplate } from "@/lib/design/motionLibrary";

describe("Motion DNA 추출 프롬프트 — 코드 복제가 아니라 특성만 뽑는다", () => {
  it("실제 코드/라이브러리 이름을 만들어내지 말라는 가드레일을 포함한다", () => {
    const p = buildMotionExtractionPrompt({ url: "https://motionsites.ai/showcase/x", shots: 2 });
    expect(p).toContain(MOTION_EXTRACTION_GUARDRAIL);
    expect(p).toContain("CSS 애니메이션 코드");
    expect(p).toContain("GSAP");
  });

  it("스크린샷이 한 장뿐이면 추정이라는 것을 인정하도록 지시한다", () => {
    const p = buildMotionExtractionPrompt({ url: "https://example.com", shots: 1 });
    expect(p).toContain("추정임을 서술에서 감추지 않는다");
  });

  it("여러 장이면 그 사실을 프롬프트에 반영하고 '한 장뿐' 조건부 문구는 안 붙인다", () => {
    const p = buildMotionExtractionPrompt({ url: "https://example.com", shots: 3 });
    expect(p).toContain("3장의 스크린샷");
    expect(p).not.toContain("스크린샷이 한 장뿐이라");
  });

  it("MotionDna 스키마는 필수 필드를 요구한다", () => {
    const bad = MotionDna.safeParse({ trigger: "scroll" });
    expect(bad.success).toBe(false);
    const good = MotionDna.safeParse({
      trigger: "scroll",
      timingFeel: "느리고 여유로운",
      choreography: "제목이 먼저, 이미지가 뒤이어",
      easingFeel: "부드러운 관성",
      targetElements: ["제목", "이미지"],
      intensity: "medium",
      mood: ["미니멀"],
      description: "스크롤에 따라 요소들이 순차적으로 부드럽게 나타난다.",
      suits: ["hero", "story"],
    });
    expect(good.success).toBe(true);
  });
});

const customRecord: CustomMotionTemplate = {
  id: "ext-motionsites-abc123",
  name: "Motionsites 쇼케이스",
  sourceUrl: "https://motionsites.ai/showcase/x",
  createdAt: "2026-08-25T00:00:00.000Z",
  motionDna: MotionDna.parse({
    trigger: "scroll",
    timingFeel: "느리고 드라마틱한",
    choreography: "배경이 먼저 이동하고 텍스트가 겹쳐 등장",
    easingFeel: "탄성 있는",
    targetElements: ["헤드라인", "배경 이미지"],
    intensity: "strong",
    mood: ["드라마틱", "몰입감"],
    description: "스크롤에 따라 배경과 텍스트가 서로 다른 속도로 겹쳐 움직이며 몰입감을 준다.",
    suits: ["hero"],
  }),
};

describe("추출된 Motion Template 을 내장 라이브러리와 같은 경로로 조회·적용한다", () => {
  it("toMotionTemplate 이 내장 MotionTemplate 과 같은 모양을 만든다", () => {
    const t = toMotionTemplate(customRecord);
    expect(t.id).toBe(customRecord.id);
    expect(t.description).toBe(customRecord.motionDna.description);
    expect(t.suits).toEqual(["hero"]);
  });

  it("findMotion 은 내장 목록에 없어도 extra 에서 찾는다", () => {
    const extra: MotionTemplate[] = [toMotionTemplate(customRecord)];
    expect(findMotion(customRecord.id, extra)?.name).toBe("Motionsites 쇼케이스");
    expect(findMotion("존재하지-않음", extra)).toBeUndefined();
  });

  it("extra 없이는 커스텀 id 를 못 찾는다 (내장 12종에 섞이지 않는다)", () => {
    expect(findMotion(customRecord.id)).toBeUndefined();
  });

  it("resolveMotion/motionInstruction 이 커스텀 항목을 실제로 지시문에 반영한다", () => {
    const extra = [toMotionTemplate(customRecord)];
    const r = resolveMotion({ templateId: customRecord.id, speed: "normal", intensity: "medium" }, extra);
    expect(r.template.name).toBe("Motionsites 쇼케이스");

    const instruction = motionInstruction("hero", { templateId: customRecord.id, speed: "normal", intensity: "medium" }, extra);
    expect(instruction).toContain("Motionsites 쇼케이스");
    expect(instruction).toContain("배경과 텍스트가 서로 다른 속도로 겹쳐");
    expect(instruction).toContain("다른 섹션");
  });

  it("커스텀 항목도 알 수 없는 id 로는 여전히 던진다", () => {
    expect(() => resolveMotion({ templateId: "없음", speed: "normal", intensity: "medium" }, [])).toThrow();
  });
});
