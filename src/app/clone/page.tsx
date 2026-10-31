"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700";
const button =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";

export default function ClonePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "복제 실패");
      router.push(`/project/${json.projectId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
        ← 처음으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">다른 곳 복제하기</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        URL 하나를 주면 구조·메뉴·문안까지 최대한 그대로 재현한 새 사이트를 만듭니다. 사람 승인 단계 없이
        자동으로 진행되며(유사도 &ldquo;매우 비슷하게&rdquo; + 재작성 강도 &ldquo;유지&rdquo;), 몇 분 걸립니다.
        <br />
        <b>/improve</b>(점진 개선)와 다르게, 이 모드는 원본 톤을 거의 바꾸지 않고 복제하는 데 집중합니다.
      </p>
      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
        로컬 Claude/Codex CLI와 Playwright가 필요한 기능입니다 — 배포 환경에서는 실행할 수 없습니다.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          className={input}
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className={button} disabled={!url.trim() || busy} onClick={run}>
          복제 시작
        </button>
      </div>

      {busy && (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          사이트를 분석하고 복제본을 생성하는 중 — 몇 분 걸립니다.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </main>
  );
}
