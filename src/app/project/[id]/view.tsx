"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTION_LABELS, actionInstruction, type ActionLabel } from "@/lib/design/editActions";
import { MOTION_TEMPLATES, type MotionIntensity, type MotionSpeed } from "@/lib/design/motion";
import type { ImageRole, VisualDna } from "@/lib/types";

const VIEWPORTS = [
  { key: "mobile", label: "Mobile", width: 390 },
  { key: "tablet", label: "Tablet", width: 834 },
  { key: "desktop", label: "Desktop", width: 1440 },
] as const;

const IMAGE_ROLES: { key: ImageRole; label: string }[] = [
  { key: "overall", label: "전체 스타일(기본)" },
  { key: "layout", label: "레이아웃" },
  { key: "photo", label: "사진" },
  { key: "typography", label: "Typography" },
  { key: "motion", label: "Motion 느낌" },
];

const SPEEDS: { key: MotionSpeed; label: string }[] = [
  { key: "slow", label: "Slow" },
  { key: "normal", label: "Normal" },
  { key: "fast", label: "Fast" },
];
const INTENSITIES: { key: MotionIntensity; label: string }[] = [
  { key: "subtle", label: "Subtle" },
  { key: "medium", label: "Medium" },
  { key: "strong", label: "Strong" },
];

const SECTION_LABEL: Record<string, string> = {
  header: "Header",
  hero: "Hero",
  trust: "Trust",
  services: "Services",
  story: "Story",
  features: "Features",
  testimonials: "Testimonials",
  cta: "CTA",
  footer: "Footer",
};

/** iframe 안에 심는 선택 스크립트 — same-origin(/api/preview) 이라 contentDocument 로 주입한다 */
const PICKER = `
(function () {
  var STYLE = '[data-vdna-id]{outline-offset:-2px;cursor:pointer}' +
    '[data-vdna-id]:hover{outline:2px dashed #6366f1}' +
    '[data-vdna-selected]{outline:2px solid #4f46e5 !important}';
  var s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
  function post(id) {
    parent.postMessage({ type: 'vdna:select', id: id }, '*');
  }
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-vdna-id]') : null;
    e.preventDefault();
    e.stopPropagation();
    if (el) post(el.getAttribute('data-vdna-id'));
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
  window.__vdnaMark = function (id) {
    document.querySelectorAll('[data-vdna-selected]').forEach(function (n) {
      n.removeAttribute('data-vdna-selected');
    });
    var el = id ? document.querySelector('[data-vdna-id="' + id + '"]') : null;
    if (el) el.setAttribute('data-vdna-selected', '1');
  };
})();
`;

interface VersionRow {
  version: number;
  label: string;
  createdAt: string;
}

interface EditResponse {
  version: number;
  label: string;
  changed: string[];
  reverted: string[];
  audit?: { sections?: { ok: boolean; found: string[] }; tokens?: { ok: boolean; variableCount: number } };
}

interface ApproveResponse {
  version: number;
  files: string[];
  designMdAttempts: number;
  audit: {
    ok: boolean;
    missingFiles: string[];
    emptyFiles: string[];
    sections: { ok: boolean; duplicates: string[]; unknown: string[]; missingRequired: string[] };
    tokens: { ok: boolean; variableCount: number; hardcodedColors: string[] };
    designMd: { ok: boolean; missing: string[]; empty: string[]; hasSourceOfTruth: boolean };
  };
}

export default function ProjectView({
  projectId,
  name,
  versions,
  visualDna,
}: {
  projectId: string;
  name: string;
  versions: VersionRow[];
  visualDna: VisualDna | null;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatRef = useRef<HTMLTextAreaElement>(null);

  const [vpKey, setVpKey] = useState<(typeof VIEWPORTS)[number]["key"]>("desktop");
  const [version, setVersion] = useState<number | null>(versions.at(-1)?.version ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [showDna, setShowDna] = useState(false);

  const [sections, setSections] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageRole, setImageRole] = useState<ImageRole>("overall");
  const [lastEdit, setLastEdit] = useState<EditResponse | null>(null);
  const [pending, setPending] = useState<{ instruction: string } | null>(null);
  const [motionOpen, setMotionOpen] = useState(false);

  // PRD §33, §68 — 평가 화면의 [Preview에서 수정] 에서 넘어온 경우
  // 섹션 목록이 준비된 시점에 해당 섹션을 선택하고 개선 지시를 대화창에 채운다.
  const prefilled = useRef(false);
  const [motionId, setMotionId] = useState(MOTION_TEMPLATES[0].id);
  const [speed, setSpeed] = useState<MotionSpeed>("normal");
  const [intensity, setIntensity] = useState<MotionIntensity>("medium");
  const [approval, setApproval] = useState<ApproveResponse | null>(null);

  const vp = VIEWPORTS.find((v) => v.key === vpKey)!;
  const scale = vpKey === "desktop" ? 0.72 : 1;

  // iframe 안에서 온 섹션 선택 메시지
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; id?: string } | null;
      if (data?.type === "vdna:select" && data.id) setSelected(data.id);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 선택 표시를 iframe 에 반영
  useEffect(() => {
    const win = iframeRef.current?.contentWindow as (Window & { __vdnaMark?: (id: string | null) => void }) | null;
    win?.__vdnaMark?.(selected);
  }, [selected, version]);

  const onFrameLoad = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const found = [...doc.querySelectorAll("[data-vdna-id]")].map(
      (el) => el.getAttribute("data-vdna-id") ?? "",
    );
    const ids = found.filter(Boolean);
    setSections(ids);

    if (!prefilled.current) {
      prefilled.current = true;
      const params = new URLSearchParams(window.location.search);
      const target = params.get("select");
      const ask = params.get("ask");
      if (target && ids.includes(target)) setSelected(target);
      if (ask) setMessage(ask);
    }

    const s = doc.createElement("script");
    s.textContent = PICKER;
    doc.body.appendChild(s);
    const win = frame?.contentWindow as (Window & { __vdnaMark?: (id: string | null) => void }) | null;
    win?.__vdnaMark?.(selected);
  }, [selected]);

  async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "요청 실패");
    return json as T;
  }

  async function generate() {
    setError("");
    setNote("디자인을 만들고 있습니다. 수 분 걸릴 수 있어요 — 창을 닫지 마세요.");
    setBusy(true);
    try {
      const json = await post<{ version: number; audit?: { found?: string[] }; tokenAudit?: { variableCount?: number } }>(
        "/api/generate",
        { projectId },
      );
      setVersion(json.version);
      setNote(
        `v${json.version} 생성 완료 · 섹션 ${json.audit?.found?.length ?? 0}개 · CSS 변수 ${json.tokenAudit?.variableCount ?? 0}개`,
      );
      router.refresh();
    } catch (e) {
      setNote("");
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(false);
    }
  }

  /** 섹션 수정 — 프리셋/대화 모두 이 경로를 쓴다 (PRD §16~§19) */
  async function sectionEdit(instruction: string, scope: "selected-only" | "allow-related" = "selected-only") {
    if (!selected) {
      setError("먼저 수정할 영역을 클릭하세요");
      return;
    }
    setError("");
    setApproval(null);
    setNote(`${SECTION_LABEL[selected] ?? selected} 를 수정하고 있습니다. 수 분 걸릴 수 있어요.`);
    setBusy(true);
    try {
      const json = await post<EditResponse>("/api/section-edit", {
        projectId,
        sectionId: selected,
        instruction,
        images,
        imageRole,
        scope,
      });
      setLastEdit(json);
      setPending(json.reverted.length ? { instruction } : null);
      setVersion(json.version);
      setMessage("");
      setNote(
        `v${json.version} 저장 · 변경 ${json.changed.join(", ") || "없음"}` +
          (json.reverted.length ? ` · 다른 영역 변경 시도를 되돌렸습니다 (${json.reverted.join(", ")})` : ""),
      );
      router.refresh();
    } catch (e) {
      setNote("");
      setError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function applyMotion() {
    if (!selected) {
      setError("먼저 수정할 영역을 클릭하세요");
      setMotionOpen(false);
      return;
    }
    setMotionOpen(false);
    setError("");
    setNote("Motion 을 적용하고 있습니다. 수 분 걸릴 수 있어요.");
    setBusy(true);
    try {
      const json = await post<EditResponse>("/api/motion", {
        request: { projectId, sectionId: selected, images, imageRole, scope: "selected-only" },
        settings: { templateId: motionId, speed, intensity },
      });
      setLastEdit(json);
      setPending(null);
      setVersion(json.version);
      setNote(`v${json.version} 저장 · Motion 적용 (${json.changed.join(", ") || "변경 없음"})`);
      router.refresh();
    } catch (e) {
      setNote("");
      setError(e instanceof Error ? e.message : "Motion 적용 실패");
    } finally {
      setBusy(false);
    }
  }

  async function onAction(label: string) {
    if (label === "직접 요청") {
      chatRef.current?.focus();
      return;
    }
    if (label === "Motion") {
      if (!selected) {
        setError("먼저 수정할 영역을 클릭하세요");
        return;
      }
      setMotionOpen(true);
      return;
    }
    await sectionEdit(actionInstruction(label as ActionLabel));
  }

  async function restore(v: number) {
    setError("");
    setBusy(true);
    try {
      const json = await post<{ version: number; label: string }>("/api/restore", { projectId, version: v });
      setVersion(json.version);
      setNote(`v${v} 을 v${json.version} 로 복구했습니다. 이전 버전은 그대로 남아 있습니다.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setError("");
    setNote("디자인을 확정하고 산출물을 만들고 있습니다. 수 분 걸릴 수 있어요.");
    setBusy(true);
    try {
      const json = await post<ApproveResponse>("/api/approve", { projectId });
      setApproval(json);
      setNote(json.audit.ok ? "디자인 확정 완료 — 산출물 6개 검증 통과" : "확정 산출물이 생성됐지만 감사에서 미달 항목이 있습니다");
      router.refresh();
    } catch (e) {
      setNote("");
      setError(e instanceof Error ? e.message : "확정 실패");
    } finally {
      setBusy(false);
    }
  }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    setBusy(true);
    setError("");
    (async () => {
      try {
        const out: string[] = [];
        for (const f of files) {
          const fd = new FormData();
          fd.append("projectId", projectId);
          fd.append("file", f);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "업로드 실패");
          out.push(json.path);
        }
        setImages((prev) => [...prev, ...out.filter(Boolean)]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "이미지 업로드 실패");
      } finally {
        setBusy(false);
      }
    })();
  }

  const sectionList = sections.length ? sections : [];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← 처음으로
        </Link>
        <span className="text-xs text-zinc-400">{projectId}</span>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{name}</h1>

      {/* 뷰포트 전환 + 버전 히스토리 */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {VIEWPORTS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setVpKey(v.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              vpKey === v.key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
            }`}
          >
            {v.label} · {v.width}px
          </button>
        ))}
        {versions.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <select
              value={version ?? ""}
              onChange={(e) => setVersion(Number(e.target.value))}
              size={1}
              className="max-h-40 max-w-64 overflow-y-auto rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              {[...versions].reverse().map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} · {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setVersion(versions.at(-1)?.version ?? null)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
            >
              [ 최신 버전 보기 ]
            </button>
            <button
              type="button"
              onClick={() => version !== null && restore(version)}
              disabled={busy || version === null || version === versions.at(-1)?.version}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300"
            >
              [ 이 버전으로 복구 ]
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* LIVE PREVIEW */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {version === null ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-10 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                아직 만든 디자인이 없습니다. 참고 사이트를 분석해 랜딩페이지를 만들어 봅니다.
              </p>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                {busy ? "만들고 있습니다…" : "[ 랜딩페이지 만들어보기 ]"}
              </button>
              {note && <p className="text-xs text-zinc-500">{note}</p>}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="flex justify-center p-4">
              <div
                style={{ width: vp.width * scale, height: 780 * scale }}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
              >
                <iframe
                  ref={iframeRef}
                  onLoad={onFrameLoad}
                  title="Live Preview"
                  src={`/api/preview?projectId=${encodeURIComponent(projectId)}&version=${version}`}
                  style={{
                    width: vp.width,
                    height: 780,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    border: 0,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* AI Designer + Lock 표 (PRD §65, §71) */}
        {version !== null && (
          <aside className="flex flex-col gap-4">
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold">AI Designer</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {selected
                  ? `${SECTION_LABEL[selected] ?? selected} 선택됨`
                  : "미리보기에서 수정할 영역을 클릭하세요"}
              </p>
              <textarea
                ref={chatRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="예) CTA 버튼을 하나만 남기고 제목을 더 크게 해줘"
                className="mt-3 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  📎 참고 이미지 첨부
                  <input type="file" accept="image/*" multiple hidden onChange={onPickImages} />
                </label>
                {images.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setImages([])}
                    className="text-xs text-zinc-400 hover:underline"
                  >
                    첨부 {images.length}개 비우기
                  </button>
                )}
              </div>
              {images.length > 0 && (
                <fieldset className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <legend className="px-1 text-xs text-zinc-500">이 이미지를 무엇에 참고할까요?</legend>
                  {IMAGE_ROLES.map((r) => (
                    <label key={r.key} className="flex items-center gap-2 py-0.5 text-xs">
                      <input
                        type="radio"
                        name="imageRole"
                        checked={imageRole === r.key}
                        onChange={() => setImageRole(r.key)}
                      />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <button
                type="button"
                onClick={() => sectionEdit(message.trim())}
                disabled={busy || !selected || !message.trim()}
                className="mt-3 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                {busy ? "작업 중…" : "변경 적용"}
              </button>

              {/* PRD §17 — 되돌린 변경이 있으면 범위를 다시 고르게 한다 */}
              {pending && lastEdit?.reverted.length ? (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                  <p>
                    다른 영역({lastEdit.reverted.join(", ")}) 변경 시도를 되돌렸습니다. 변경 범위를 고르세요.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPending(null)}
                      className="rounded border border-zinc-300 px-2 py-1 text-left dark:border-zinc-700"
                    >
                      ○ 선택 영역만 수정 (현재 상태 유지)
                    </button>
                    <button
                      type="button"
                      onClick={() => sectionEdit(pending.instruction, "allow-related")}
                      disabled={busy}
                      className="rounded border border-zinc-300 px-2 py-1 text-left disabled:opacity-40 dark:border-zinc-700"
                    >
                      ○ 관련 영역도 함께 수정
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Component Lock 표 */}
            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold">Component Lock</h2>
              <ul className="mt-2 space-y-1">
                {sectionList.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelected(id)}
                      className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <span>{SECTION_LABEL[id] ?? id}</span>
                      <span
                        className={
                          id === selected
                            ? "rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
                            : "rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800"
                        }
                      >
                        {id === selected ? "EDIT" : "LOCK"}
                      </span>
                    </button>
                  </li>
                ))}
                {!sectionList.length && <li className="text-xs text-zinc-400">섹션을 읽는 중…</li>}
              </ul>
            </section>
          </aside>
        )}
      </div>

      {version !== null && (note || error) && (
        <p className={`mt-2 text-xs ${error ? "text-red-600" : "text-zinc-500"}`}>{error || note}</p>
      )}

      {/* 편집 액션 (PRD §14) */}
      {version !== null && (
        <section className="mt-6 flex flex-wrap items-center gap-2">
          {[...ACTION_LABELS, "직접 요청"].map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy}
              onClick={() => onAction(a)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {a}
            </button>
          ))}
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="ml-auto rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
          >
            ✓ 디자인 확정
          </button>
        </section>
      )}

      {/* 확정 결과 (PRD §21, §22) */}
      {approval && (
        <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">
            확정 산출물 · v{approval.version} {approval.audit.ok ? "· 검증 통과" : "· 감사 미달"}
          </h2>
          <ul className="mt-2 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2 dark:text-zinc-300">
            {approval.files.map((f) => (
              <li key={f}>
                {approval.audit.missingFiles.includes(f)
                  ? "✕"
                  : approval.audit.emptyFiles.includes(f)
                    ? "△"
                    : "✓"}{" "}
                design/{f}
              </li>
            ))}
          </ul>
          {!approval.audit.ok && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
              {approval.audit.missingFiles.length > 0 && <li>파일 누락: {approval.audit.missingFiles.join(", ")}</li>}
              {approval.audit.emptyFiles.length > 0 && <li>내용이 비었음: {approval.audit.emptyFiles.join(", ")}</li>}
              {!approval.audit.sections.ok && (
                <li>
                  섹션 id 파손 — 중복 {approval.audit.sections.duplicates.join(", ") || "없음"} / 미허용{" "}
                  {approval.audit.sections.unknown.join(", ") || "없음"} / 누락{" "}
                  {approval.audit.sections.missingRequired.join(", ") || "없음"}
                </li>
              )}
              {!approval.audit.tokens.ok && (
                <li>
                  Design Token 미달 — 변수 {approval.audit.tokens.variableCount}개 / 하드코딩 색{" "}
                  {approval.audit.tokens.hardcodedColors.length}개
                </li>
              )}
              {!approval.audit.designMd.ok && (
                <li>
                  DESIGN.md — 누락 {approval.audit.designMd.missing.join(", ") || "없음"} / 빈 섹션{" "}
                  {approval.audit.designMd.empty.join(", ") || "없음"}
                </li>
              )}
            </ul>
          )}
          <a
            href={`/production/${projectId}`}
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            [ 본격적으로 사이트 제작 ]
          </a>
        </section>
      )}

      {/* Motion Library 모달 (PRD §46~§49) */}
      {motionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Motion Library · {selected ? (SECTION_LABEL[selected] ?? selected) : ""} 선택됨
              </h2>
              <button type="button" onClick={() => setMotionOpen(false)} className="text-sm text-zinc-400">
                닫기
              </button>
            </div>
            <ul className="mt-3 space-y-1">
              {MOTION_TEMPLATES.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setMotionId(t.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                      motionId === t.id
                        ? "border-zinc-900 bg-zinc-100 dark:border-white dark:bg-zinc-900"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <span className="font-medium">
                      {t.no} {t.name}
                    </span>
                    <span className="ml-2 text-zinc-500">{t.description}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {t.suits.map((s) => (
                        <span
                          key={s}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            s === selected
                              ? "bg-indigo-600 text-white"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {SECTION_LABEL[s] ?? s}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <fieldset className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <legend className="px-1 text-xs text-zinc-500">Speed</legend>
                {SPEEDS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 py-0.5 text-xs">
                    <input type="radio" name="speed" checked={speed === s.key} onChange={() => setSpeed(s.key)} />
                    {s.label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <legend className="px-1 text-xs text-zinc-500">Intensity</legend>
                {INTENSITIES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 py-0.5 text-xs">
                    <input
                      type="radio"
                      name="intensity"
                      checked={intensity === s.key}
                      onChange={() => setIntensity(s.key)}
                    />
                    {s.label}
                  </label>
                ))}
              </fieldset>
            </div>
            <button
              type="button"
              onClick={applyMotion}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
            >
              [ 선택 영역에 적용 ]
            </button>
          </div>
        </div>
      )}

      {/* Visual DNA */}
      {visualDna && (
        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setShowDna((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            <span>Visual DNA · {visualDna.mood.join(", ")}</span>
            <span className="text-zinc-400">{showDna ? "닫기" : "펼치기"}</span>
          </button>
          {showDna && (
            <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(visualDna.color)
                  .filter(([, v]) => /^#[0-9a-fA-F]{3,8}$/.test(v))
                  .map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <span
                        className="inline-block h-4 w-4 rounded border border-zinc-300 dark:border-zinc-700"
                        style={{ background: v }}
                      />
                      {k} {v}
                    </span>
                  ))}
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-600 dark:text-zinc-300">
                {JSON.stringify(visualDna, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
