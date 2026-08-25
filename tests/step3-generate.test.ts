import { GENERATION_RULES } from "@/lib/design/rules";
import { describe, expect, it } from "vitest";
import { auditFeedback, buildGeneratePrompt, carveHtml, tokenFeedback } from "@/lib/design/generate";
import { auditSections } from "@/lib/design/sections";
import { COPYRIGHT_GUARD } from "@/lib/design/visualDna";
import { LEVEL_PRESETS, PHOTO_PRESETS, SECTION_IDS, type DesignBrief, type VisualDna } from "@/lib/types";

const dna: VisualDna = {
  mood: ["minimal", "technical"],
  layout: {
    heroStructure: "left-aligned headline with right gradient mesh",
    grid: "12 column",
    containerWidth: "1080px",
    sectionOrder: ["header", "hero", "logoStrip", "featureBento", "footer"],
    contentAlignment: "left",
    imagePlacement: "right half",
    header: "sticky transparent",
  },
  typography: {
    fontPersonality: "geometric sans",
    headingScale: "1.333",
    weight: "600",
    lineHeight: "1.15",
    letterSpacing: "-0.02em",
    hierarchy: "h1 > h2 > body",
  },
  color: {
    background: "#0C0C0F",
    surface: "#17171A",
    primary: "#FFFFFF",
    secondary: "#8B8B92",
    accent: "#5E6AD2",
    text: "#F2F2F3",
    saturation: "mostly desaturated",
    temperature: "cool",
  },
  photography: {
    composition: "centered",
    lighting: "soft",
    colorGrading: "cool",
    cameraAngle: "eye level",
    depthOfField: "shallow",
    humanPose: "candid",
    environment: "studio",
    texture: "smooth",
    imageRatio: "16:9",
  },
  components: {
    buttons: "pill",
    cards: "bordered",
    forms: "underline",
    navigation: "inline",
    border: "1px hairline",
    radius: "12px",
    shadow: "none",
  },
  spacing: {
    sectionGap: "120px",
    containerPadding: "24px",
    cardPadding: "32px",
    contentGap: "16px",
    heroWhitespace: "generous",
  },
  motion: {
    fade: "200ms",
    reveal: "on scroll",
    scroll: "smooth",
    hover: "lift",
    transition: "ease-out",
  },
};

const brief: DesignBrief = {
  projectId: "p1",
  mode: "create",
  references: [{ id: "ref-a", kind: "url", value: "https://stripe.com" }],
  level: "similar",
  advanced: LEVEL_PRESETS.similar,
  photo: PHOTO_PRESETS.similar,
  brandBrief: "B2B 결제 인프라 스타트업",
};

describe("buildGeneratePrompt", () => {
  const prompt = buildGeneratePrompt({ brief, visualDna: dna });

  it("Design Generator 역할을 선언한다", () => {
    expect(prompt).toContain("Design Generator");
  });

  it("Visual DNA 전체와 hex 값을 CSS 변수로 실어 보낸다", () => {
    expect(prompt).toContain("## Visual DNA (이 스펙대로 CSS 를 작성한다)");
    for (const hex of Object.values(dna.color).filter((v) => v.startsWith("#"))) {
      expect(prompt).toContain(hex);
    }
    expect(prompt).toContain("--color-accent: #5E6AD2");
  });

  it("sectionOrder 를 섹션 순서의 정본으로 지시한다", () => {
    for (const s of dna.layout.sectionOrder) expect(prompt).toContain(s);
    expect(prompt).toContain("정본");
  });

  it("GENERATION_RULES 의 data-vdna-id 규칙과 허용 id 목록을 포함한다", () => {
    expect(prompt).toContain('data-vdna-id="..."');
    expect(prompt).toContain(SECTION_IDS.join(", "));
    expect(prompt).toContain("단일 HTML 파일 하나");
  });

  it("COPYRIGHT_GUARD 문구를 포함한다", () => {
    expect(prompt).toContain(COPYRIGHT_GUARD);
  });

  it("advanced 점수를 축별 강도 지시문으로 변환해 넣는다", () => {
    expect(prompt).toContain("## 축별 참고 강도");
    // 프리셋 숫자를 하드코딩하지 않는다 — 레벨 정의가 바뀌면 테스트도 함께 따라가야 한다
    const advanced = brief.advanced;
    for (const [axis, score] of Object.entries(advanced)) {
      expect(prompt).toContain(`${axis}: ${score}/90`);
    }
    expect(prompt).toMatch(/→ (강하게 참고|적극 참고|분위기만 참고|거의 참고하지 않음)/);
  });

  it("레벨이 올라가면 프롬프트의 참고 강도도 올라간다", () => {
    const low = buildGeneratePrompt({
      brief: { ...brief, level: "hint", advanced: LEVEL_PRESETS.hint },
      visualDna: dna,
    });
    const high = buildGeneratePrompt({
      brief: { ...brief, level: "very", advanced: LEVEL_PRESETS.very },
      visualDna: dna,
    });
    expect(low).toContain("layout: 15/90");
    expect(high).toContain("layout: 90/90 → 강하게 참고");
  });

  it("brandBrief 를 콘텐츠 방향으로 넣는다", () => {
    expect(prompt).toContain("B2B 결제 인프라 스타트업");
  });

  it("세 뷰포트와 가로 스크롤 금지를 명시한다", () => {
    expect(prompt).toContain("390");
    expect(prompt).toContain("834");
    expect(prompt).toContain("1440");
    expect(prompt).toContain("가로 스크롤 금지");
  });

  it("feedback 없으면 재시도 문구가 없다", () => {
    expect(prompt).not.toContain("직전 시도가 검증을 통과하지 못했다");
  });
});

describe("재생성 프롬프트 되먹임", () => {
  const bad = `<!doctype html><html><body>
    <header data-vdna-id="header">h</header>
    <section data-vdna-id="hero">a</section>
    <section data-vdna-id="hero">b</section>
    <section data-vdna-id="pricing">c</section>
  </body></html>`;

  it("audit 오류를 프롬프트에 실어 보낸다", () => {
    const audit = auditSections(bad);
    expect(audit.ok).toBe(false);
    const feedback = auditFeedback(audit);
    expect(feedback).toContain("중복된 data-vdna-id: hero");
    expect(feedback).toContain("허용되지 않는 data-vdna-id: pricing");
    expect(feedback).toContain("필수 섹션 누락: footer");

    const retry = buildGeneratePrompt({ brief, visualDna: dna, feedback });
    expect(retry).toContain("직전 시도가 검증을 통과하지 못했다");
    expect(retry).toContain("중복된 data-vdna-id: hero");
    expect(retry).toContain("허용되지 않는 data-vdna-id: pricing");
    expect(retry).toContain("필수 섹션 누락: footer");
  });
});

describe("carveHtml", () => {
  it("코드펜스와 잡설을 걷어낸다", () => {
    const raw = "여기 결과입니다\n```html\n<!doctype html><html><body>x</body></html>\n```\n끝";
    expect(carveHtml(raw)).toBe("<!doctype html><html><body>x</body></html>");
  });
  it("펜스 없는 응답도 처리한다", () => {
    expect(carveHtml("설명\n<!DOCTYPE html><html></html>\n뒷말")).toBe("<!DOCTYPE html><html></html>");
  });
  it("HTML 이 없으면 던진다", () => {
    expect(() => carveHtml("미안하지만 못 만들었어요")).toThrow();
  });
});

// --- 코디네이터 추가: 토큰 재현성 게이트 (PRD §79) ---
describe("토큰 재현성 게이트", () => {
  it("하드코딩 색상을 재생성 지시로 되먹인다", () => {
    const fb = tokenFeedback({ ok: false, variableCount: 25, hardcodedColors: ["#fff", "#514ae0"] });
    expect(fb).toContain("하드코딩 색상 2개");
    expect(fb).toContain("#514ae0");
    expect(fb).toContain("그라데이션 정지점");
  });
  it("토큰 수가 부족하면 그것도 지적한다", () => {
    const fb = tokenFeedback({ ok: false, variableCount: 3, hardcodedColors: [] });
    expect(fb).toContain("3개뿐이다");
  });
  it("통과한 감사에는 아무 지적도 하지 않는다", () => {
    expect(tokenFeedback({ ok: true, variableCount: 25, hardcodedColors: [] })).toBe("");
  });
  it("생성 규칙이 색상 리터럴을 :root 로 제한한다", () => {
    expect(GENERATION_RULES).toContain("색상 리터럴");
    expect(GENERATION_RULES).toContain("그라데이션 정지점");
  });
});
