"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DesignTemplate } from "@/lib/design/template";
import { LEVEL_LABELS, LEVEL_ORDER, type SimilarityLevel } from "@/lib/types";
import { MotionTemplates } from "./MotionDemos";

type Tab = "mine" | "reference" | "motion" | "photo";

const TABS: [Tab, string][] = [
  ["mine", "My Templates"],
  ["reference", "Reference Templates"],
  ["motion", "Motion Templates"],
  ["photo", "Photo Styles"],
];

const LEVELS: [SimilarityLevel, string, string][] = LEVEL_ORDER.map((v) => [
  v,
  LEVEL_LABELS[v].label,
  LEVEL_LABELS[v].hint,
]);

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700";
const button =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";
const card = "rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";

export function TemplatesView({ templates }: { templates: DesignTemplate[] }) {
  const [tab, setTab] = useState<Tab>("mine");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const load = () => startTransition(() => router.refresh());

  const mine = templates.filter((t) => t.origin === "mine");
  const refs = templates.filter((t) => t.origin === "reference");

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
        ← 처음으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">디자인 템플릿</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        저장해 둔 디자인에서 출발하거나, 마음에 드는 외부 사이트의 디자인 특성으로 새 템플릿을 만듭니다.
      </p>

      <div className="mt-6 flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              tab === key ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "mine" && (
          <TemplateGrid
            list={mine}
            empty="확정한 디자인을 저장하면 여기에 쌓입니다. 프로젝트에서 [ 이 디자인으로 확정 ] 후 Template 으로 저장하세요."
          />
        )}
        {tab === "reference" && (
          <>
            <FromUrl onDone={load} />
            <div className="mt-8">
              <TemplateGrid list={refs} empty="아직 만든 Reference Template 이 없습니다." />
            </div>
          </>
        )}
        {tab === "motion" && <MotionTemplates />}
        {tab === "photo" && <PhotoStyles list={templates} />}
      </div>

      <section className="mt-14 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-medium">본격적으로 사이트 제작</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          확정된 디자인을 실제 Next.js 컴포넌트로 전환하고, 승인본과 픽셀 비교해 Design Fidelity 를 확인합니다.
        </p>
        <ProductionLink />
      </section>
    </main>
  );
}

function ProductionLink() {
  const [projectId, setProjectId] = useState("");
  return (
    <div className="mt-4 flex gap-2">
      <input
        className={input}
        placeholder="프로젝트 ID (예: verify-step3)"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      />
      <Link
        href={projectId.trim() ? `/production/${encodeURIComponent(projectId.trim())}` : "#"}
        aria-disabled={!projectId.trim()}
        className={`${button} whitespace-nowrap ${projectId.trim() ? "" : "pointer-events-none opacity-40"}`}
      >
        본격적으로 사이트 제작
      </Link>
    </div>
  );
}

function TemplateGrid({ list, empty }: { list: DesignTemplate[]; empty: string }) {
  if (!list.length) return <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
    </div>
  );
}

function TemplateCard({ template: t }: { template: DesignTemplate }) {
  return (
    <div className={card}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/template/preview?id=${encodeURIComponent(t.id)}&shot=desktop`}
        alt={`${t.name} 데스크톱 썸네일`}
        className="h-40 w-full rounded-lg border border-zinc-200 object-cover object-top dark:border-zinc-800"
      />
      <div className="mt-3 flex items-center gap-2">
        <span className="truncate text-sm font-medium">{t.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            t.origin === "mine"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {t.origin === "mine" ? "내 디자인" : "Reference"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        {new Date(t.createdAt).toLocaleDateString("ko-KR")} · 기본 유사도 {t.defaultLevel}
      </p>
      <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{t.visualDna.mood.join(", ")}</p>
      {t.origin === "reference" && (
        <p className="mt-2 rounded-md bg-zinc-100 p-2 text-[11px] leading-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          외부 사이트의 디자인 특성만 추출 — 복제 아님
          {t.sourceUrl ? <span className="block truncate text-zinc-400">출처: {t.sourceUrl}</span> : null}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Link href={`/create?template=${encodeURIComponent(t.id)}`} className="text-xs underline underline-offset-4">
          이 템플릿으로 새 프로젝트
        </Link>
        <a
          href={`/api/template/preview?id=${encodeURIComponent(t.id)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
        >
          미리보기
        </a>
      </div>
    </div>
  );
}

function FromUrl({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<SimilarityLevel>("similar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/template/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, name, level }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Template 만들기 실패");
      setDone(json.template?.name ?? "완료");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <h2 className="text-sm font-medium">+ 외부 사이트로 Template 만들기</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        원본의 HTML·이미지·문안을 저장하지 않습니다. 재현 가능한 디자인 특성만 추출해 <b>새 Preview 를 생성</b>합니다.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_12rem]">
        <input className={input} placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className={input} placeholder="템플릿 이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {LEVELS.map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => setLevel(key)}
            className={`rounded-lg border p-3 text-left text-xs ${
              level === key
                ? "border-zinc-900 dark:border-white"
                : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
            }`}
          >
            <span className="block font-medium">{label}</span>
            <span className="mt-1 block leading-5">{hint}</span>
          </button>
        ))}
      </div>
      <button className={`${button} mt-4`} disabled={!url.trim() || busy} onClick={run}>
        Template 만들기
      </button>
      {busy && (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          사이트를 캡처하고 디자인 특성을 추출한 뒤 새 Preview 를 생성합니다 — 몇 분 걸립니다.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {done && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">「{done}」 Template 을 만들었습니다.</p>}
    </div>
  );
}

function PhotoStyles({ list }: { list: DesignTemplate[] }) {
  if (!list.length)
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        저장된 Photo Style 이 없습니다. Template 을 만들면 그 사진 특성(Photo DNA)이 여기에 함께 쌓입니다.
      </p>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {list.map((t) => (
        <div key={t.id} className={card}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t.photoDna.name}</span>
            <span className="text-[11px] text-zinc-400">{t.name}</span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {t.photoDna.traits.map((tr) => (
              <li key={tr} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {tr}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <div>조명: {t.photoDna.lighting}</div>
            <div>그레이딩: {t.photoDna.grading}</div>
            <div>피사체: {t.photoDna.subject}</div>
            <div>심도: {t.photoDna.depthOfField}</div>
          </dl>
        </div>
      ))}
    </div>
  );
}
