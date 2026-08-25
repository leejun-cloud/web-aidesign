import { describe, expect, it } from "vitest";
import { COPYRIGHT_GUARD, buildVisualDnaPrompt } from "@/lib/design/visualDna";
import { LEVEL_PRESETS, VisualDna, type Reference } from "@/lib/types";

const fullDna = {
  mood: ["clean", "confident"],
  layout: {
    heroStructure: "좌측 텍스트 + 우측 제품 목업",
    grid: "12컬럼",
    containerWidth: "1200px",
    sectionOrder: ["hero", "features", "cta"],
    contentAlignment: "좌측 정렬",
    imagePlacement: "우측 절반",
    header: "고정 투명 헤더",
  },
  typography: {
    fontPersonality: "기하학적 산세리프",
    headingScale: "1.333 모듈러",
    weight: "600/400",
    lineHeight: "1.5",
    letterSpacing: "-0.02em",
    hierarchy: "3단",
  },
  color: {
    background: "#FFFFFF",
    surface: "#F6F9FC",
    primary: "#635BFF",
    secondary: "#0A2540",
    accent: "#00D4FF",
    text: "#425466",
    saturation: "중간",
    temperature: "쿨",
  },
  photography: {
    composition: "중앙",
    lighting: "부드러운 확산광",
    colorGrading: "쿨톤",
    cameraAngle: "아이레벨",
    depthOfField: "얕음",
    humanPose: "자연스러운 작업 중",
    environment: "실내 오피스",
    texture: "매끄러움",
    imageRatio: "16:9",
  },
  components: {
    buttons: "라운드 필",
    cards: "약한 그림자 카드",
    forms: "밑줄 인풋",
    navigation: "수평 메뉴",
    border: "1px #E6EBF1",
    radius: "8px",
    shadow: "0 2px 8px rgba(0,0,0,.06)",
  },
  spacing: {
    sectionGap: "120px",
    containerPadding: "24px",
    cardPadding: "32px",
    contentGap: "16px",
    heroWhitespace: "넉넉함",
  },
  motion: {
    fade: "200ms ease-out",
    reveal: "스크롤 진입 시 상승",
    scroll: "부드러운 패럴랙스",
    hover: "1.02 확대",
    transition: "150ms ease",
  },
};

const refA: Reference = { id: "a", kind: "url", value: "https://a.example", desktopShot: "/tmp/a-d.png" };
const refB: Reference = { id: "b", kind: "url", value: "https://b.example", desktopShot: "/tmp/b-d.png" };

describe("VisualDna 스키마", () => {
  it("완전한 객체를 통과시킨다", () => {
    expect(VisualDna.parse(fullDna).color.primary).toBe("#635BFF");
  });

  it("빈 mood 배열을 거부한다", () => {
    expect(VisualDna.safeParse({ ...fullDna, mood: [] }).success).toBe(false);
  });

  it("필드 누락을 거부한다", () => {
    const { radius: _radius, ...components } = fullDna.components;
    expect(VisualDna.safeParse({ ...fullDna, components }).success).toBe(false);
  });

  it("섹션 하나가 통째로 없으면 거부한다", () => {
    const { motion: _motion, ...rest } = fullDna;
    expect(VisualDna.safeParse(rest).success).toBe(false);
  });
});

describe("buildVisualDnaPrompt", () => {
  const opts = { advanced: LEVEL_PRESETS.similar };

  it("저작권 금지 문구를 항상 포함한다", () => {
    for (const refs of [[refA], [refA, refB]]) {
      expect(buildVisualDnaPrompt(refs, opts)).toContain(COPYRIGHT_GUARD);
    }
  });

  it("Design Analyzer 역할과 7개 분석 축을 지시한다", () => {
    const p = buildVisualDnaPrompt([refA], opts);
    for (const axis of ["Layout", "Photography", "Typography", "Color", "Components", "Spacing", "Motion"]) {
      expect(p).toContain(axis);
    }
    expect(p).toContain("Design Analyzer");
    expect(p).toContain("heroStructure");
    expect(p).toContain("colorGrading");
  });

  it("color 는 실제 hex 로 채우라고 명시한다", () => {
    expect(buildVisualDnaPrompt([refA], opts)).toContain("#RRGGBB");
  });

  it("advanced 7축 점수를 프롬프트에 싣고 100% 복제를 금지한다", () => {
    const p = buildVisualDnaPrompt([refA], { advanced: LEVEL_PRESETS.feel });
    expect(p).toContain("layout: 30 / 90");
    expect(p).toContain("photography: 35 / 90");
    expect(p).toContain("motion: 25 / 90");
    expect(p).toContain("100% 복제 금지");
  });

  it("a-structure-b-style 은 축 배분을 명시한다", () => {
    const p = buildVisualDnaPrompt([refA, refB], { ...opts, blend: "a-structure-b-style" });
    expect(p).toContain("layout / spacing / components 는 A");
    expect(p).toContain("photography / color / typography / motion 은 B");
  });

  it("a-lead / b-lead 는 주도 쪽을 지정한다", () => {
    expect(buildVisualDnaPrompt([refA, refB], { ...opts, blend: "a-lead" })).toContain(
      "Reference A 를 주도(lead)로",
    );
    expect(buildVisualDnaPrompt([refA, refB], { ...opts, blend: "b-lead" })).toContain(
      "Reference B 를 주도(lead)로",
    );
  });

  it("Reference 1개면 조합 모드 문구가 없다", () => {
    expect(buildVisualDnaPrompt([refA], opts)).not.toContain("조합 모드");
  });

  it("스크린샷 경로와 브랜드 브리프를 담는다", () => {
    const p = buildVisualDnaPrompt([refA], { ...opts, brandBrief: "친환경 아웃도어 브랜드" });
    expect(p).toContain("/tmp/a-d.png");
    expect(p).toContain("친환경 아웃도어 브랜드");
  });
});
