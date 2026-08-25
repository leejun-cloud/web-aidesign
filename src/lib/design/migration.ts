import { z } from "zod";
import { RewriteLevel } from "@/lib/types";

/**
 * PRD §25 — 기존 메뉴 Before / After 재구성안.
 * 깊이는 2단까지만 허용한다. 재귀(z.lazy) 대신 명시적 2단으로 선언하는 이유는
 * JSON Schema 로 변환할 때 $ref 없이 평평하게 나와 모델이 구조를 덜 틀리기 때문이다.
 */
export const MenuLeaf = z.object({ label: z.string().min(1) });

export const MenuNode = z.object({
  label: z.string().min(1),
  children: z.array(MenuLeaf).optional(),
});
export type MenuNode = z.infer<typeof MenuNode>;

export const MenuProposal = z.object({
  before: z.array(z.string()).min(1),
  after: z.array(MenuNode).min(1),
  rationale: z.array(z.string()).min(1),
});
export type MenuProposal = z.infer<typeof MenuProposal>;

/** PRD §26 — 콘텐츠 처리 구분 */
export const MigrationAction = z.enum(["KEEP", "MOVE", "MERGE", "REWRITE", "REMOVE"]);
export type MigrationAction = z.infer<typeof MigrationAction>;

export const MigrationItem = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  action: MigrationAction,
  reason: z.string().min(2),
});
export type MigrationItem = z.infer<typeof MigrationItem>;

export const MigrationMap = z.object({
  items: z.array(MigrationItem).min(1),
  rewriteLevel: RewriteLevel,
});
export type MigrationMap = z.infer<typeof MigrationMap>;

/** 최상위 메뉴가 몇 개인지 — PRD §66 은 5개 이하 정리를 목표로 든다 */
export const topLevelCount = (p: MenuProposal) => p.after.length;

/** 재구성안이 기존 메뉴를 조용히 버리지 않았는지 확인한다 */
export function droppedMenus(p: MenuProposal): string[] {
  const flat = new Set<string>();
  const walk = (nodes: MenuNode[]) => {
    for (const n of nodes) {
      flat.add(n.label.trim());
      for (const c of n.children ?? []) flat.add(c.label.trim());
    }
  };
  walk(p.after);
  const normalized = [...flat].map((l) => l.replace(/\s+/g, ""));
  return p.before.filter((b) => {
    const key = b.replace(/\s+/g, "");
    return !normalized.some((l) => l.includes(key) || key.includes(l));
  });
}

export interface MigrationAudit {
  ok: boolean;
  /** 재구성안에서 사라졌는데 migration map 에도 REMOVE/MERGE 로 기록되지 않은 항목 */
  unaccounted: string[];
  counts: Record<MigrationAction, number>;
}

/** 메뉴에서 사라진 항목은 반드시 Migration Map 에 설명이 있어야 한다 */
export function auditMigration(menu: MenuProposal, map: MigrationMap): MigrationAudit {
  const counts = { KEEP: 0, MOVE: 0, MERGE: 0, REWRITE: 0, REMOVE: 0 } as Record<MigrationAction, number>;
  for (const item of map.items) counts[item.action]++;

  const explained = new Set(map.items.map((i) => i.from.replace(/\s+/g, "")));
  const unaccounted = droppedMenus(menu).filter((label) => {
    const key = label.replace(/\s+/g, "");
    return ![...explained].some((e) => e.includes(key) || key.includes(e));
  });

  return { ok: unaccounted.length === 0, unaccounted, counts };
}

/** PRD §27 — AI 는 확인되지 않은 내용이나 성과를 임의로 추가하지 않는다 */
export const REWRITE_GUARDRAIL = `## 콘텐츠 재작성 금지 사항
- 원문에 없는 수치, 연혁, 수상, 인증, 파트너, 성과를 만들어내지 않는다.
- 확인할 수 없는 주장을 단정형으로 쓰지 않는다.
- 고유명사와 사실관계는 원문 그대로 보존한다.
- 표현을 다듬는 것과 내용을 추가하는 것은 다르다. 후자는 하지 않는다.`;

export const REWRITE_INSTRUCTION: Record<RewriteLevel, string> = {
  keep: "기존 문구를 최대한 그대로 유지한다. 오탈자와 명백한 비문만 손본다.",
  clarify: "의미는 그대로 두고 문장을 짧고 읽기 쉽게 다듬는다. 정보를 더하거나 빼지 않는다.",
  rewrite: "구조와 문장을 적극적으로 재작성한다. 단, 원문에 있는 사실만 사용한다.",
};
