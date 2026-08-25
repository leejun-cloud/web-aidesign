"use client";

import Link from "next/link";
import { normalizeUrl } from "@/lib/design/url";
import { useState } from "react";
import type { EvaluationReport, Gap, Impact, SimilarityReport } from "@/lib/design/evaluate";
import { ScoreBar, TotalScore, metricLabel } from "./ScoreBar";

type Tab = "evaluate" | "compare";

interface CompareResult {
  ours: EvaluationReport;
  reference: EvaluationReport;
  similarity: SimilarityReport;
  gaps: Gap[];
}

const IMPACT_STYLE: Record<Impact, string> = {
  HIGH: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  LOW: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700";
const button =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";
const card = "rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";

export default function EvaluatePage() {
  const [tab, setTab] = useState<Tab>("evaluate");

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
        ← 처음으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">사이트 평가·비교</h1>

      <div className="mt-6 flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
        {(
          [
            ["evaluate", "사이트 평가"],
            ["compare", "두 사이트 비교"],
          ] as const
        ).map(([key, label]) => (
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

      <div className="mt-8">{tab === "evaluate" ? <EvaluateTab /> : <CompareTab />}</div>
    </main>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
      {label} — 실제 사이트를 캡처하고 분석하므로 몇 분 걸립니다.
    </p>
  );
}

function EvaluateTab() {
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);

  async function run() {
    const check = normalizeUrl(url);
    if (!check.ok) return setError(check.error ?? "URL 형식이 올바르지 않습니다");
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: check.url, projectId: projectId.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "평가 실패");
      setReport(json.report as EvaluationReport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          className={input}
          placeholder="https://oursite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className={button} disabled={!url.trim() || busy} onClick={run}>
          사이트 평가
        </button>
      </div>
      <label className="mt-3 block text-xs text-zinc-500 dark:text-zinc-400">
        프로젝트 ID (선택) — 넣으면 점수 이력이 누적되고, 개선안을 해당 Preview 수정으로 바로 연결합니다
        <input
          className={`${input} mt-1.5`}
          placeholder="예: mysite-ab12cd"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
      </label>
      {busy && <Pending label="평가 중" />}
      {error && <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {report && <ReportView report={report} projectId={projectId.trim()} />}
    </>
  );
}

function ReportView({ report, projectId }: { report: EvaluationReport; projectId: string }) {
  return (
    <div className="mt-8 space-y-6">
      <div className={card}>
        <TotalScore score={report.total} caption={report.url} />
        <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {Object.entries(report.breakdown).map(([k, v]) => (
            <ScoreBar key={k} label={metricLabel(k)} score={v as number} />
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">실측 항목</h2>
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-400">
            AI 판단이 아니라 브라우저 실측
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          측정 평균 {report.measuredScore}점
        </p>
        <ul className="mt-4 space-y-3">
          {report.measurements.map((m) => (
            <li key={m.key} className="text-xs">
              <ScoreBar label={m.label} score={m.score} />
              <p className="pl-[10.75rem] text-zinc-500 dark:text-zinc-400">
                {m.observed} · {m.note}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h2 className="text-sm font-medium">가장 먼저 개선할 것</h2>
        <ol className="mt-4 space-y-4">
          {report.improvements.map((imp, i) => (
            <li key={i} className="border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {String(i + 1).padStart(2, "0")} {imp.title}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${IMPACT_STYLE[imp.impact]}`}>
                  Impact {imp.impact}
                </span>
                {imp.sectionId && (
                  <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                    {imp.sectionId}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">문제 — {imp.problem}</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">해법 — {imp.fix}</p>
              {projectId && imp.sectionId ? (
                <a
                  href={`/project/${encodeURIComponent(projectId)}?select=${encodeURIComponent(
                    imp.sectionId,
                  )}&ask=${encodeURIComponent(imp.fix)}`}
                  className="mt-2 inline-block rounded-md border border-zinc-400 px-2.5 py-1 text-[11px] text-zinc-700 hover:border-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                >
                  Preview에서 수정
                </a>
              ) : (
                <button
                  disabled
                  title={
                    projectId
                      ? "이 개선안에는 대상 섹션이 지정되지 않았습니다"
                      : "프로젝트 ID 를 입력하면 해당 Preview 수정으로 연결됩니다"
                  }
                  className="mt-2 rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-400 dark:border-zinc-700"
                >
                  Preview에서 수정
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className={card}>
        <h2 className="text-sm font-medium">
          콘텐츠 구조 <span className="ml-1 tabular-nums text-zinc-500">{report.contentScore}</span>
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {report.contentIssues.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">평가 근거</summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {(
            [
              ["Visual Evaluation", report.visualNotes],
              ["UX Heuristic", report.uxNotes],
            ] as const
          ).map(([title, notes]) => (
            <div key={title}>
              <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function CompareTab() {
  const [ours, setOurs] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  async function run() {
    const oursCheck = normalizeUrl(ours);
    if (!oursCheck.ok) return setError(oursCheck.error ?? "현재 사이트 URL 형식이 올바르지 않습니다");
    const refCheck = normalizeUrl(ref);
    if (!refCheck.ok) return setError(refCheck.error ?? "비교 사이트 URL 형식이 올바르지 않습니다");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oursUrl: oursCheck.url, referenceUrl: refCheck.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "비교 실패");
      setResult(json as CompareResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          현재 사이트
          <input className={`${input} mt-1.5`} placeholder="https://ours.com" value={ours} onChange={(e) => setOurs(e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          비교 사이트
          <input className={`${input} mt-1.5`} placeholder="https://reference.com" value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
      </div>
      <button className={`${button} mt-3`} disabled={!ours.trim() || !ref.trim() || busy} onClick={run}>
        비교하기
      </button>

      {busy && <Pending label="두 사이트 비교 중" />}
      {error && <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {result && (
        <div className="mt-8 space-y-6">
          <div className={`${card} grid grid-cols-2 gap-6`}>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">OURS</p>
              <TotalScore score={result.ours.total} caption="현재" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">REFERENCE</p>
              <TotalScore score={result.reference.total} caption="비교" />
            </div>
          </div>

          <div className={card}>
            <h2 className="text-sm font-medium">항목별 대비</h2>
            <table className="mt-4 w-full text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="pb-2 text-left font-normal">항목</th>
                  <th className="pb-2 text-right font-normal">OURS</th>
                  <th className="pb-2 text-right font-normal">REF</th>
                  <th className="pb-2 text-right font-normal">차이</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(result.ours.breakdown).map((k) => {
                  const a = result.ours.breakdown[k as keyof typeof result.ours.breakdown];
                  const b = result.reference.breakdown[k as keyof typeof result.reference.breakdown];
                  const d = a - b;
                  return (
                    <tr key={k} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="py-1.5">{metricLabel(k)}</td>
                      <td className="py-1.5 text-right tabular-nums">{a}</td>
                      <td className="py-1.5 text-right tabular-nums">{b}</td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${
                          d < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {d > 0 ? `+${d}` : d}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={card}>
            <h2 className="text-sm font-medium">Visual Similarity</h2>
            <TotalScore score={result.similarity.overall} caption="Reference 와의 유사도" />
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              {Object.entries(result.similarity.axes).map(([k, v]) => (
                <ScoreBar key={k} label={k} score={v as number} />
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-sm font-medium">가장 큰 차이</h2>
            <ul className="mt-3 space-y-1.5 text-xs">
              {result.gaps.slice(0, 6).map((g) => (
                <li key={g.axis} className="flex justify-between tabular-nums">
                  <span className="text-zinc-600 dark:text-zinc-400">{metricLabel(g.axis)}</span>
                  <span className={g.delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                    {g.delta > 0 ? `+${g.delta}` : g.delta}
                  </span>
                </li>
              ))}
            </ul>
            <button
              disabled
              title="디자인 확정 후 연결됩니다"
              className="mt-4 rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-400 dark:border-zinc-700"
            >
              Reference에 더 가깝게 개선
            </button>
          </div>
        </div>
      )}
    </>
  );
}
