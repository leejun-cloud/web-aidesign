import { describe, expect, it } from "vitest";
import { carveJson } from "@/lib/ai/cli";
import {
  AdvancedSimilarity,
  LEVEL_LABELS,
  LEVEL_ORDER,
  LEVEL_PRESETS,
  PHOTO_PRESETS,
  SimilarityLevel,
} from "@/lib/types";
import { auditSections, changedSections, extractSection, replaceSection } from "@/lib/design/sections";

const html = `<!doctype html><html><body>
<header data-vdna-id="header"><nav>menu</nav></header>
<section data-vdna-id="hero"><h1>Old hero</h1></section>
<section data-vdna-id="services"><h2>Services</h2></section>
<footer data-vdna-id="footer">f</footer>
</body></html>`;

describe("carveJson", () => {
  it("코드펜스와 잡설을 걷어낸다", () => {
    expect(JSON.parse(carveJson('설명입니다\n```json\n{"a":1}\n```\n끝'))).toEqual({ a: 1 });
  });
  it("문자열 안의 중괄호에 속지 않는다", () => {
    expect(JSON.parse(carveJson('{"a":"}{","b":[1,2]}'))).toEqual({ a: "}{", b: [1, 2] });
  });
  it("JSON 이 없으면 던진다", () => {
    expect(() => carveJson("no json here")).toThrow();
  });
});

describe("유사도 프리셋", () => {
  it("모든 레벨이 0~90 범위를 지킨다 (100% 복제 금지)", () => {
    for (const preset of Object.values(LEVEL_PRESETS)) {
      expect(AdvancedSimilarity.safeParse(preset).success).toBe(true);
    }
    for (const preset of Object.values(PHOTO_PRESETS)) {
      expect(Math.max(...Object.values(preset))).toBeLessThanOrEqual(90);
    }
  });
  it("5단계 전체가 단조 증가한다", () => {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    const levels = LEVEL_ORDER.map((l) => sum(LEVEL_PRESETS[l]));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
    const photo = LEVEL_ORDER.map((l) => sum(PHOTO_PRESETS[l]));
    for (let i = 1; i < photo.length; i++) {
      expect(photo[i]).toBeGreaterThan(photo[i - 1]);
    }
  });

  it("5단계가 모두 정의되고 라벨·설명을 갖는다", () => {
    expect(LEVEL_ORDER).toHaveLength(5);
    for (const level of LEVEL_ORDER) {
      expect(SimilarityLevel.safeParse(level).success).toBe(true);
      expect(LEVEL_PRESETS[level]).toBeDefined();
      expect(PHOTO_PRESETS[level]).toBeDefined();
      expect(LEVEL_LABELS[level].label.length).toBeGreaterThan(1);
      expect(LEVEL_LABELS[level].hint.length).toBeGreaterThan(5);
    }
    expect(new Set(LEVEL_ORDER.map((l) => LEVEL_LABELS[l].label)).size).toBe(5);
  });

  it("어떤 레벨도 90 을 넘지 않는다 (100% 복제 금지)", () => {
    for (const level of LEVEL_ORDER) {
      expect(Math.max(...Object.values(LEVEL_PRESETS[level]))).toBeLessThanOrEqual(90);
      expect(Math.max(...Object.values(PHOTO_PRESETS[level]))).toBeLessThanOrEqual(90);
    }
  });
});

describe("섹션 무결성", () => {
  it("정상 HTML 을 통과시킨다", () => {
    expect(auditSections(html).ok).toBe(true);
  });
  it("중복 섹션 id 를 잡는다", () => {
    const dup = html.replace('data-vdna-id="services"', 'data-vdna-id="hero"');
    expect(auditSections(dup).duplicates).toContain("hero");
  });
  it("표준 목록에 없는 id 를 잡는다", () => {
    const bad = html.replace('data-vdna-id="services"', 'data-vdna-id="whatever"');
    expect(auditSections(bad).unknown).toEqual(["whatever"]);
  });
  it("필수 섹션 누락을 잡는다", () => {
    const noHero = html.replace('data-vdna-id="hero"', 'data-vdna-id="story"');
    expect(auditSections(noHero).missingRequired).toEqual(["hero"]);
  });
});

describe("섹션 Lock", () => {
  it("선택 섹션만 바뀌고 나머지는 그대로다", () => {
    const next = replaceSection(html, "hero", '<section data-vdna-id="hero"><h1>New hero</h1></section>');
    expect(changedSections(html, next)).toEqual(["hero"]);
    expect(extractSection(next, "hero")).toContain("New hero");
    expect(extractSection(next, "services")).toBe(extractSection(html, "services"));
  });
  it("교체본에 id 가 빠져도 강제로 붙인다", () => {
    const next = replaceSection(html, "hero", "<section><h1>New</h1></section>");
    expect(changedSections(html, next)).toEqual(["hero"]);
  });
  it("없는 섹션 교체는 던진다", () => {
    expect(() => replaceSection(html, "nope", "<section></section>")).toThrow();
  });
});
