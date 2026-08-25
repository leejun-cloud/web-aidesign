"use client";

import { useState } from "react";
import type { WorkdirCheck } from "@/lib/design/workdir";

/**
 * 결과를 쓸 로컬 프로젝트 경로.
 * 비워 두면 우리 workspace 안에만 쓰고, 지정하면 사용자의 실제 코드베이스를 고친다 —
 * 되돌리기 어려운 작업이므로 확인 절차를 UI 에서 강제한다.
 */
export function WorkdirField({
  value,
  onChange,
  check,
  onCheck,
  confirmed,
  onConfirm,
}: {
  value: string;
  onChange: (v: string) => void;
  check: WorkdirCheck | null;
  onCheck: (c: WorkdirCheck | null) => void;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (!value.trim()) return onCheck(null);
    setBusy(true);
    try {
      const res = await fetch("/api/workdir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: value }),
      });
      onCheck((await res.json()) as WorkdirCheck);
      onConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-medium">결과를 쓸 위치</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        비워 두면 VisualDNA 작업 폴더 안에만 씁니다. 지금 운영하는 프로젝트를 직접 고치려면 그 폴더의
        절대 경로를 넣어주세요.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onCheck(null);
          }}
          placeholder="/Users/me/projects/mysite (비워 두면 작업 폴더)"
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={verify}
          disabled={!value.trim() || busy}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:opacity-40 dark:border-zinc-700"
        >
          {busy ? "확인 중" : "경로 확인"}
        </button>
      </div>

      {check && (
        <div className="mt-4 space-y-2 text-xs">
          {check.errors.map((e) => (
            <p key={e} className="text-rose-600 dark:text-rose-400">✗ {e}</p>
          ))}

          {check.ok && (
            <>
              <p className="text-emerald-600 dark:text-emerald-400">
                ✓ {check.root}
                {check.isGitRepo ? " · git 저장소" : ""}
              </p>
              {check.sample.length > 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  안에 있는 것: {check.sample.join(", ")}
                </p>
              )}
              {check.warnings.map((w) => (
                <p key={w} className="text-amber-600 dark:text-amber-400">! {w}</p>
              ))}
              {check.warnings.length > 0 && (
                <label className="mt-2 flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => onConfirm(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    위 경고를 확인했고 이 폴더의 파일이 바뀌어도 괜찮습니다. 덮어쓰는 파일은{" "}
                    <code className="font-mono">.vdna-backup/</code> 에 사본을 남깁니다.
                  </span>
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
