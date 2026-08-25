"use client";

import Link from "next/link";
import { use, useState } from "react";
import { NoteField } from "../../NoteField";
import { WorkdirField } from "../WorkdirField";
import type { WorkdirCheck } from "@/lib/design/workdir";
import { ScoreBar, TotalScore } from "@/app/evaluate/ScoreBar";
import type { FidelityBreakdown, Framework, ProductionPlan } from "@/lib/design/production";
import { FIDELITY_TARGET } from "@/lib/design/production";

const FRAMEWORKS: [Framework, string][] = [
  ["nextjs", "Next.js + TypeScript + Tailwind"],
  ["react", "React + TypeScript"],
  ["html", "정적 HTML + CSS"],
  ["vue", "Vue 3 + TypeScript"],
  ["nuxt", "Nuxt 3"],
  ["astro", "Astro"],
];

/** PRD §53 — Coding Agent 에게 넘기는 입력 자료 6종 */
const INPUTS: [string, string][] = [
  ["approved-preview.html", "유일한 진실. 모든 수치의 출처"],
  ["approved-desktop.png", "1440 승인 스크린샷 — Fidelity 비교 기준"],
  ["approved-mobile.png", "390 승인 스크린샷"],
  ["design-tokens.css", "색·간격·타이포 토큰. 값을 재해석하지 않는다"],
  ["DESIGN.md", "규칙 문서. 이것만 보고 새로 디자인하지 않는다"],
  ["visual-dna.json", "디자인 특성 원본"],
];

const BREAKDOWN_LABELS: Record<keyof FidelityBreakdown, string> = {
  layout: "Layout",
  typography: "Typography",
  spacing: "Spacing",
  images: "Images",
  components: "Components",
  color: "Color",
};

interface QaResult {
  fidelity: number;
  breakdown?: FidelityBreakdown;
  drift: { diffPixels: number; totalPixels: number; widthMismatch: boolean; heightDeltaPx: number; diffImagePath?: string };
  method: "qa-preview" | "composed-components";
  attempts: number;
  producedShot: string;
  history: { attempt: number; fidelity: number; method: string }[];
}

const button =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";
const card = "rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";

export default function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [framework, setFramework] = useState<Framework>("nextjs");
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [files, setFiles] = useState<string[] | null>(null);
  const [qa, setQa] = useState<QaResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workdir, setWorkdir] = useState("");
  const [wdCheck, setWdCheck] = useState<WorkdirCheck | null>(null);
  const [wdConfirmed, setWdConfirmed] = useState(false);
  const [outDir, setOutDir] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [productionNote, setProductionNote] = useState("");

  // 경로를 넣었다면 확인을 통과해야 전환할 수 있다
  const workdirBlocked =
    workdir.trim().length > 0 &&
    (!wdCheck || !wdCheck.ok || (wdCheck.warnings.length > 0 && !wdConfirmed));

  async function call<T>(url: string, body: unknown, label: string): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${label} 실패`);
      return json as T;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/templates" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
        ← 템플릿으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">본격적으로 사이트 제작</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        프로젝트 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{id}</code> 의 승인 디자인을 실제
        컴포넌트로 전환합니다. 다시 디자인하지 않고 <b>변환</b>합니다.
      </p>

      <section className={`${card} mt-8`}>
        <h2 className="text-sm font-medium">1. 입력 자료</h2>
        <ul className="mt-3 space-y-1.5">
          {INPUTS.map(([file, why]) => (
            <li key={file} className="flex gap-2 text-xs">
              <span className="text-zinc-400">·</span>
              <span className="font-mono">{file}</span>
              <span className="text-zinc-500 dark:text-zinc-400">— {why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-zinc-400">
          승인 산출물이 없으면 최신 버전 HTML 을 기준으로 진행하고, 비교용 스크린샷은 그 HTML 로 즉석 캡처합니다.
        </p>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-sm font-medium">2. Framework</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {FRAMEWORKS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFramework(key)}
              className={`rounded-lg border p-3 text-left text-xs ${
                framework === key
                  ? "border-zinc-900 dark:border-white"
                  : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={`${button} mt-4`}
          disabled={!!busy}
          onClick={async () => {
            const r = await call<{ plan: ProductionPlan; sectionIds: string[] }>(
              "/api/production/plan",
              { projectId: id, framework },
              "계획 수립",
            );
            if (r) {
              setPlan(r.plan);
              setSectionIds(r.sectionIds);
              setFiles(null);
              setQa(null);
            }
          }}
        >
          컴포넌트 계획 세우기
        </button>
      </section>

      {plan && (
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-medium">3. 계획 확인 — 섹션 {sectionIds.length}개 → 컴포넌트 {plan.components.length}개</h2>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                <th className="py-1 font-normal">섹션</th>
                <th className="py-1 font-normal">컴포넌트</th>
                <th className="py-1 font-normal">props</th>
              </tr>
            </thead>
            <tbody>
              {plan.components.map((c) => (
                <tr key={c.file} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 font-mono">{c.sectionId}</td>
                  <td className="py-1.5 font-mono">{c.file}</td>
                  <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{c.props.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <div>토큰 전략: {plan.tokenStrategy}</div>
            <div>반응형 전략: {plan.responsiveStrategy}</div>
          </dl>
          <div className="mt-5 space-y-5">
            <WorkdirField
              value={workdir}
              onChange={setWorkdir}
              check={wdCheck}
              onCheck={setWdCheck}
              confirmed={wdConfirmed}
              onConfirm={setWdConfirmed}
            />
            <NoteField stage="production" value={productionNote} onChange={setProductionNote} />
          </div>
          <button
            className={`${button} mt-4`}
            disabled={!!busy || workdirBlocked}
            onClick={async () => {
              const r = await call<{ files: string[]; outDir: string; backup: string | null }>(
                "/api/production/build",
                {
                  projectId: id,
                  plan,
                  workdir: workdir.trim() || undefined,
                  confirmed: wdConfirmed,
                  notes: productionNote.trim()
                    ? [{ stage: "production", text: productionNote.trim(), at: new Date().toISOString() }]
                    : [],
                },
                "빌드",
              );
              if (r) {
                setFiles(r.files);
                setOutDir(r.outDir);
                setBackup(r.backup);
              }
            }}
          >
            이 계획으로 전환하기
          </button>
        </section>
      )}

      {files && (
        <section className={`${card} mt-4`}>
          <h2 className="text-sm font-medium">4. 생성된 파일 {files.length}개</h2>
          {outDir && (
            <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">{outDir}</p>
          )}
          {backup && (
            <p className="mt-1 break-all text-xs text-amber-600 dark:text-amber-400">
              덮어쓴 파일 사본: <span className="font-mono">{backup}</span>
            </p>
          )}
          <ul className="mt-3 grid gap-1 text-xs font-mono sm:grid-cols-2">
            {files.map((f) => (
              <li key={f} className="truncate text-zinc-500 dark:text-zinc-400">
                {f}
              </li>
            ))}
          </ul>
          <button
            className={`${button} mt-4`}
            disabled={!!busy}
            onClick={async () => {
              const r = await call<{ result: QaResult }>(
                "/api/production/qa",
                { projectId: id, plan, autoCorrect: true },
                "Visual QA",
              );
              if (r) setQa(r.result);
            }}
          >
            Visual QA 실행 (Fidelity 측정)
          </button>
        </section>
      )}

      {busy && (
        <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          {busy} 중 — 실제 코드를 생성하고 스크린샷을 비교하므로 몇 분 걸립니다.
        </p>
      )}
      {error && <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {qa && <QaView qa={qa} />}
    </main>
  );
}

function QaView({ qa }: { qa: QaResult }) {
  const pass = qa.fidelity >= FIDELITY_TARGET;
  return (
    <section className={`${card} mt-4`}>
      <h2 className="text-sm font-medium">5. Design Fidelity</h2>
      <div className="mt-3">
        <TotalScore
          score={qa.fidelity}
          caption={pass ? `목표 ${FIDELITY_TARGET} 달성` : `목표 ${FIDELITY_TARGET} 미달 — 자동 수정 ${qa.attempts - 1}회 진행`}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        다른 픽셀 {qa.drift.diffPixels.toLocaleString()} / {qa.drift.totalPixels.toLocaleString()} · 세로 차이{" "}
        {qa.drift.heightDeltaPx}px · 가로 {qa.drift.widthMismatch ? "불일치" : "일치"} · 측정 방식{" "}
        {qa.method === "qa-preview" ? "production 정적 산출물 렌더" : "컴포넌트 합성 fallback"}
      </p>

      {qa.breakdown && (
        <div className="mt-4">
          {(Object.keys(BREAKDOWN_LABELS) as (keyof FidelityBreakdown)[]).map((k) => (
            <ScoreBar key={k} label={BREAKDOWN_LABELS[k]} score={qa.breakdown![k]} />
          ))}
          <p className="mt-2 text-[11px] text-zinc-400">
            항목별 점수는 픽셀 비교 결과(diff 비율·세로 차이·가로 불일치)에서 파생된 값입니다.
          </p>
        </div>
      )}

      {qa.history.length > 1 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium">자동 수정 루프</h3>
          <ul className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {qa.history.map((h) => (
              <li key={h.attempt}>
                {h.attempt + 1}회차 — Fidelity {h.fidelity}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div>Production 스크린샷: <span className="font-mono">{qa.producedShot}</span></div>
        {qa.drift.diffImagePath && (
          <div>Diff 이미지: <span className="font-mono">{qa.drift.diffImagePath}</span></div>
        )}
      </div>
    </section>
  );
}
