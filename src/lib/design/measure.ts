import type { SiteFacts } from "@/lib/design/capture";

/**
 * PRD §31 — 평가는 세 갈래로 나눈다.
 * 이 파일은 그중 **측정 가능한 항목**만 다룬다. AI 취향이 개입하지 않는다.
 */
export interface Measurement {
  key: string;
  label: string;
  score: number; // 0~100
  observed: string;
  note: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** h1 이 정확히 1개이고 레벨이 2단 이상 건너뛰지 않아야 한다 */
export function headingStructure(facts: SiteFacts): Measurement {
  const h1 = facts.headings.filter((h) => h.level === 1).length;
  let skips = 0;
  for (let i = 1; i < facts.headings.length; i++) {
    if (facts.headings[i].level - facts.headings[i - 1].level > 1) skips++;
  }
  const score = clamp(100 - Math.abs(h1 - 1) * 35 - skips * 8);
  return {
    key: "headingStructure",
    label: "Heading 구조",
    score,
    observed: `h1 ${h1}개, 레벨 점프 ${skips}회`,
    note: h1 === 1 ? "h1 단일 — 정상" : `h1 이 ${h1}개다. 페이지당 1개여야 한다`,
  };
}

/** CTA 가 지나치게 분산되면 전환이 흐려진다 (PRD §67) */
export function ctaFocus(facts: SiteFacts): Measurement {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const distinct = new Set(facts.ctaTexts.map(norm).filter(Boolean));
  const n = distinct.size;
  const score = n === 0 ? 20 : n <= 6 ? 100 : clamp(100 - (n - 6) * 6);
  return {
    key: "ctaFocus",
    label: "CTA 집중도",
    score,
    observed: `서로 다른 CTA 문구 ${n}종`,
    note: n > 6 ? "CTA 문구가 분산돼 있다. 주요 행동 하나로 수렴시켜라" : "CTA 가 정리돼 있다",
  };
}

/** alt 누락은 접근성 실측 항목이다 */
export function imageAccessibility(facts: SiteFacts): Measurement {
  const total = facts.imageCount;
  const missing = facts.missingAlt;
  const score = total === 0 ? 100 : clamp(100 - (missing / total) * 100);
  return {
    key: "imageAccessibility",
    label: "이미지 대체텍스트",
    score,
    observed: `이미지 ${total}개 중 alt 누락 ${missing}개`,
    note: missing > 0 ? `${missing}개 이미지에 alt 가 없다` : "alt 가 모두 채워져 있다",
  };
}

/** 원본 2400px 초과 이미지는 전송 낭비다 */
export function imageWeight(facts: SiteFacts): Measurement {
  const score = facts.imageCount === 0 ? 100 : clamp(100 - facts.oversizedImages * 12);
  return {
    key: "imageWeight",
    label: "이미지 용량",
    score,
    observed: `2400px 초과 원본 ${facts.oversizedImages}개`,
    note: facts.oversizedImages > 0 ? "과대 원본 이미지를 리사이즈하라" : "이미지 크기가 과하지 않다",
  };
}

export function loadSpeed(facts: SiteFacts): Measurement {
  const s = facts.loadMs;
  const score = s <= 1500 ? 100 : s >= 8000 ? 25 : clamp(100 - ((s - 1500) / 6500) * 75);
  return {
    key: "loadSpeed",
    label: "로드 속도",
    score,
    observed: `networkidle 까지 ${s}ms`,
    note: s > 4000 ? "초기 로드가 느리다" : "로드 속도 양호",
  };
}

/** 상단 메뉴 개수 — PRD §66 은 5개 이하 정리를 예로 든다 */
export function navSimplicity(facts: SiteFacts): Measurement {
  const n = new Set(facts.navLinks.map((l) => l.text.trim()).filter(Boolean)).size;
  const score = n === 0 ? 30 : n <= 6 ? 100 : clamp(100 - (n - 6) * 7);
  return {
    key: "navSimplicity",
    label: "Navigation 단순성",
    score,
    observed: `상단 메뉴 ${n}개`,
    note: n > 6 ? "메뉴가 많다. 상위 5개 내외로 묶어라" : "메뉴 수가 적정하다",
  };
}

export function measureSite(facts: SiteFacts): { measurements: Measurement[]; score: number } {
  const measurements = [
    headingStructure(facts),
    navSimplicity(facts),
    ctaFocus(facts),
    imageAccessibility(facts),
    imageWeight(facts),
    loadSpeed(facts),
  ];
  const score = Math.round(measurements.reduce((a, m) => a + m.score, 0) / measurements.length);
  return { measurements, score };
}
