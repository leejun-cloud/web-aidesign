"use client";

import { STAGE_LABELS, type NoteStage } from "@/lib/design/notes";

/**
 * 단계별 자유 입력. 폼으로 담을 수 없는 제약과 맥락을 받는 자리다.
 * 어느 화면에서도 같은 모양으로 보이도록 한 곳에 둔다.
 */
export function NoteField({
  stage,
  value,
  onChange,
  rows = 3,
}: {
  stage: NoteStage;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  const { label, placeholder } = STAGE_LABELS[stage];
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">선택 — 남기면 AI 가 먼저 따릅니다</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={4000}
        className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700"
      />
      {value.length > 3600 && (
        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
          {4000 - value.length}자 남았습니다
        </span>
      )}
    </label>
  );
}
