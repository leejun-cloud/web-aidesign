import { MenuProposal, droppedMenus, topLevelCount } from "@/lib/design/migration";

/** 메뉴 트리를 2단 들여쓰기 텍스트로 */
export function menuTreeText(nodes: MenuProposal["after"], depth = 0): string {
  return nodes
    .flatMap((n) => [
      `${"  ".repeat(depth)}- ${n.label}`,
      ...(n.children?.length ? [menuTreeText(n.children as MenuProposal["after"], depth + 1)] : []),
    ])
    .join("\n");
}

/** UI 경고 배지 계산 — 재구성안에서 조용히 사라진 기존 메뉴 (PRD §25) */
export function menuWarning(menu: MenuProposal): {
  topLevel: number;
  tooManyTopLevel: boolean;
  dropped: string[];
  warn: boolean;
} {
  const dropped = droppedMenus(menu);
  const topLevel = topLevelCount(menu);
  return { topLevel, tooManyTopLevel: topLevel > 7, dropped, warn: dropped.length > 0 };
}
