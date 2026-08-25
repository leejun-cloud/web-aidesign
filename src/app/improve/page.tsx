"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SiteFacts } from "@/lib/design/capture";
import type { SiteAnalysis } from "@/lib/design/improve";
import type { MigrationAction, MigrationMap, MenuProposal } from "@/lib/design/migration";
import { buildBrief, clampAxis, mergeAdvanced, presetFor } from "@/lib/design/brief";
import {
  AXES,
  type AdvancedSimilarity,
  type Axis,
  type BlendMode,
  type PhotoSimilarity,
  type Reference,
  type RewriteLevel,
  type SimilarityLevel,
  LEVEL_LABELS,
  LEVEL_ORDER,
} from "@/lib/types";
import { normalizeUrl } from "@/lib/design/url";
import { noteFromText } from "@/lib/design/notes";
import { NoteField } from "../NoteField";
import { menuTreeText, menuWarning } from "./menu";

interface ImproveData {
  url: string;
  rewriteLevel: RewriteLevel;
  facts?: SiteFacts;
  analysis: SiteAnalysis;
  menu: MenuProposal;
  migration: MigrationMap;
  migrationAudit?: { ok: boolean; unaccounted: string[] };
  menuApproved?: boolean;
  migrationApproved?: boolean;
}

const STEPS = ["입력", "사이트 분석", "메뉴 개선안", "Migration Map", "리디자인"] as const;

const LEVELS = LEVEL_ORDER.map((value) => ({ value, ...LEVEL_LABELS[value] }));

const REWRITES: { value: RewriteLevel; label: string; hint: string }[] = [
  { value: "keep", label: "기존 문구 최대한 유지", hint: "오탈자와 비문만 손봅니다" },
  { value: "clarify", label: "의미 유지 + 더 읽기 쉽게", hint: "기본값입니다" },
  { value: "rewrite", label: "적극적으로 재작성", hint: "원문 사실만 사용합니다" },
];

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: "a-structure-b-style", label: "A의 구조 + B의 스타일" },
  { value: "a-lead", label: "A 중심" },
  { value: "b-lead", label: "B 중심" },
];

const AXIS_LABEL: Record<Axis, string> = {
  layout: "레이아웃",
  photography: "사진",
  typography: "타이포그래피",
  color: "색상",
  components: "컴포넌트",
  spacing: "여백",
  motion: "모션",
};

const PHOTO_KEYS = [
  ["composition", "구도"],
  ["lighting", "조명"],
  ["colorGrading", "색보정"],
  ["cameraAngle", "카메라 앵글"],
  ["depthOfField", "심도"],
  ["humanPose", "인물 포즈"],
  ["texture", "질감"],
] as const;

const ACTION_STYLE: Record<MigrationAction, string> = {
  KEEP: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MOVE: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  MERGE: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  REWRITE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  REMOVE: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700";
const button =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";
const card = "rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";

interface RefSlot {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
}
const emptySlot = (id: string): RefSlot => ({ id, url: "", filePath: "", fileName: "" });

function toReference(slot: RefSlot): Reference | null {
  if (slot.filePath) return { id: slot.id, kind: "screenshot", value: slot.filePath };
  if (slot.url.trim()) {
    const check = normalizeUrl(slot.url);
    if (!check.ok) throw new Error(check.error);
    return { id: slot.id, kind: "url", value: check.url! };
  }
  return null;
}

export default function ImprovePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ImproveData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // 1단계 입력
  const [existingUrl, setExistingUrl] = useState("");
  const [rewriteLevel, setRewriteLevel] = useState<RewriteLevel>("clarify");
  const [analysisNote, setAnalysisNote] = useState("");
  const [designNote, setDesignNote] = useState("");
  const [contentNote, setContentNote] = useState("");

  const collectedNotes = () => {
    const at = new Date().toISOString();
    return [
      ...noteFromText(analysisNote, "analysis", at),
      ...noteFromText(designNote, "design", at),
      ...noteFromText(contentNote, "content", at),
    ];
  };
  const [slots, setSlots] = useState<RefSlot[]>([emptySlot("A")]);
  const [level, setLevel] = useState<SimilarityLevel>("similar");
  const [blend, setBlend] = useState<BlendMode>("a-structure-b-style");
  const [advanced, setAdvanced] = useState<AdvancedSimilarity>(presetFor("similar").advanced);
  const [photo, setPhoto] = useState<PhotoSimilarity>(presetFor("similar").photo);
  const dirtyAxes = useRef<Set<Axis>>(new Set());
  const photoDirty = useRef<Set<keyof PhotoSimilarity>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);

  const twoRefs = slots.length === 2;

  // 새로고침 복구 — ?project=... 로 저장된 상태를 되살린다
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/improve/analyze?projectId=${encodeURIComponent(id)}`);
      const json = await res.json();
      setProjectId(id);
      if (res.ok && json.improve) {
        setData(json.improve as ImproveData);
        setStep(json.improve.migrationApproved ? 5 : json.improve.menuApproved ? 4 : 3);
      }
    })();
  }, []);

  function pickLevel(next: SimilarityLevel) {
    setLevel(next);
    setAdvanced((cur) => mergeAdvanced(next, dirtyAxes.current, cur));
    const preset = presetFor(next).photo;
    setPhoto((cur) => {
      const out = { ...preset };
      for (const k of photoDirty.current) out[k] = cur[k];
      return out;
    });
  }

  function setSlot(i: number, patch: Partial<RefSlot>) {
    setSlots((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function upload(i: number, file: File) {
    setError("");
    const body = new FormData();
    body.set("file", file);
    if (projectId) body.set("projectId", projectId);
    setBusy("스크린샷 업로드 중");
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setProjectId(json.projectId);
      setSlot(i, { filePath: json.path, fileName: file.name, url: "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  /** 1단계 → brief 저장 후 사이트 분석 */
  async function analyze() {
    setError("");
    let references: Reference[];
    try {
      references = slots.map(toReference).filter((r): r is Reference => r !== null);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!existingUrl.trim()) return setError("개선할 홈페이지 URL 을 넣어주세요");
    const existingCheck = normalizeUrl(existingUrl);
    if (!existingCheck.ok) return setError(existingCheck.error ?? "URL 형식이 올바르지 않습니다");
    if (references.length !== slots.length) {
      return setError("각 참고 사이트에 URL 을 넣거나 스크린샷을 올려주세요");
    }

    let brief;
    try {
      brief = buildBrief({
        projectId: projectId || "pending",
        mode: "improve",
        references,
        level,
        advanced,
        photo,
        blend: twoRefs ? blend : undefined,
        existingUrl: existingCheck.url,
        rewriteLevel,
        notes: collectedNotes(),
      });
    } catch (e) {
      return setError((e as Error).message);
    }

    setBusy("사이트를 분석하고 있습니다");
    try {
      const briefRes = await fetch("/api/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...brief, projectId: projectId || undefined, name: "improve" }),
      });
      const briefJson = await briefRes.json();
      if (!briefRes.ok) throw new Error(briefJson.error ?? "brief 저장 실패");
      const id = briefJson.projectId as string;
      setProjectId(id);

      const res = await fetch("/api/improve/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: existingCheck.url, rewriteLevel, projectId: id, notes: collectedNotes() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "분석 실패");
      setData({ ...(json as ImproveData), menuApproved: false, migrationApproved: false });
      setStep(2);
      window.history.replaceState(null, "", `/improve?project=${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function approve(what: "menu" | "migration") {
    setError("");
    setBusy("승인 저장 중");
    try {
      const res = await fetch("/api/improve/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, approve: what }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "승인 실패");
      setData(json.improve as ImproveData);
      setStep(what === "menu" ? 4 : 5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function redesign() {
    setError("");
    setBusy("새 Preview 를 만들고 있습니다");
    try {
      const res = await fetch("/api/improve/redesign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "생성 실패");
      router.push(`/project/${projectId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const reachable = (n: number) => {
    if (n <= 2) return !!data || n === 1;
    if (n === 3) return !!data;
    if (n === 4) return !!data?.menuApproved;
    return !!data?.migrationApproved;
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
        ← 처음으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">기존 사이트 개선</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        지금 쓰는 사이트를 분석해 메뉴와 콘텐츠 배치를 정리하고, 참고 사이트의 디자인으로 다시 만듭니다.
      </p>

      {/* Stepper */}
      <ol className="mt-8 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const ok = reachable(n) && n < step;
          return (
            <li key={label}>
              <button
                disabled={!reachable(n)}
                onClick={() => setStep(n)}
                className={`rounded-full border px-3 py-1.5 disabled:opacity-40 ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                }`}
              >
                {ok ? "✓ " : `${n}. `}
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {busy && (
        <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          {busy} — 실제 사이트를 열어 분석하므로 몇 분 걸립니다.
        </p>
      )}
      {error && <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-8">
        {step === 1 && (
          <section className="space-y-8">
            <div>
              <h2 className="text-sm font-medium">현재 홈페이지 URL</h2>
              <input
                className={`${input} mt-3`}
                type="url"
                placeholder="https://oursite.org"
                value={existingUrl}
                onChange={(e) => setExistingUrl(e.target.value)}
              />
            </div>

            <div>
              <h2 className="text-sm font-medium">참고하고 싶은 사이트</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">최대 2개까지 넣을 수 있습니다.</p>
              <div className="mt-3 space-y-4">
                {slots.map((slot, i) => (
                  <div key={slot.id} className={card}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Reference {slot.id}</span>
                      {slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSlots((cur) => cur.filter((_, idx) => idx !== i))}
                          className="text-xs text-zinc-500 hover:underline"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      value={slot.url}
                      onChange={(e) => setSlot(i, { url: e.target.value, filePath: "", fileName: "" })}
                      placeholder="https://example.com"
                      className={`${input} mt-3`}
                    />
                    <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 hover:border-zinc-500 dark:border-zinc-700">
                        스크린샷 업로드
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(i, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <span>{slot.fileName || "PNG · JPG · WebP, 10MB 이하"}</span>
                    </div>
                  </div>
                ))}
                {slots.length < 2 && (
                  <button
                    type="button"
                    onClick={() => setSlots((cur) => [...cur, emptySlot("B")])}
                    className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    + 참고 사이트 하나 더 추가
                  </button>
                )}
              </div>
            </div>

            {twoRefs && (
              <div>
                <h2 className="text-sm font-medium">두 사이트를 어떻게 섞을까요?</h2>
                <div className="mt-3 space-y-2">
                  {BLENDS.map((b) => (
                    <label key={b.value} className="flex items-center gap-3 text-sm">
                      <input type="radio" name="blend" checked={blend === b.value} onChange={() => setBlend(b.value)} />
                      {b.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-medium">얼마나 비슷하게 만들까요?</h2>
              <div className="mt-3 space-y-2">
                {LEVELS.map((l) => (
                  <label key={l.value} className="flex items-baseline gap-3 text-sm">
                    <input type="radio" name="level" checked={level === l.value} onChange={() => pickLevel(l.value)} />
                    <span>{l.label}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{l.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium">기존 문구를 얼마나 손볼까요?</h2>
              <div className="mt-3 space-y-2">
                {REWRITES.map((r) => (
                  <label key={r.value} className="flex items-baseline gap-3 text-sm">
                    <input
                      type="radio"
                      name="rewrite"
                      checked={rewriteLevel === r.value}
                      onChange={() => setRewriteLevel(r.value)}
                    />
                    <span>{r.label}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-5 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <div>
                <h2 className="text-sm font-medium">추가로 남기고 싶은 이야기</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  사이트 사정을 아는 사람만 알 수 있는 것들을 적어주세요. 분석·문구·디자인에 먼저 반영됩니다.
                </p>
              </div>
              <NoteField stage="analysis" value={analysisNote} onChange={setAnalysisNote} />
              <NoteField stage="content" value={contentNote} onChange={setContentNote} />
              <NoteField stage="design" value={designNote} onChange={setDesignNote} />
            </div>

            <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-sm text-zinc-600 hover:underline dark:text-zinc-300"
              >
                고급 설정 {showAdvanced ? "▴" : "▾"}
              </button>
              {showAdvanced && (
                <div className="mt-5 space-y-5">
                  {AXES.map((axis) => (
                    <Slider
                      key={axis}
                      label={AXIS_LABEL[axis]}
                      value={advanced[axis]}
                      onChange={(v) => {
                        dirtyAxes.current.add(axis);
                        setAdvanced((cur) => ({ ...cur, [axis]: clampAxis(v) }));
                      }}
                    />
                  ))}
                  <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setShowPhoto((v) => !v)}
                      className="text-sm text-zinc-600 hover:underline dark:text-zinc-300"
                    >
                      Photo Style {showPhoto ? "▴" : "▾"}
                    </button>
                    {showPhoto && (
                      <div className="mt-5 space-y-5">
                        {PHOTO_KEYS.map(([key, label]) => (
                          <Slider
                            key={key}
                            label={label}
                            value={photo[key]}
                            onChange={(v) => {
                              photoDirty.current.add(key);
                              setPhoto((cur) => ({ ...cur, [key]: clampAxis(v) }));
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button className={`${button} w-full`} disabled={!!busy} onClick={() => void analyze()}>
              사이트 분석 시작
            </button>
          </section>
        )}

        {step === 2 && data && <AnalysisStep data={data} onNext={() => setStep(3)} />}
        {step === 3 && data && (
          <MenuStep data={data} busy={!!busy} onApprove={() => void approve("menu")} />
        )}
        {step === 4 && data && (
          <MigrationStep data={data} busy={!!busy} onApprove={() => void approve("migration")} />
        )}
        {step === 5 && data && (
          <section className="space-y-5">
            <h2 className="text-lg font-medium">리디자인 Preview 생성</h2>
            <div className={card}>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                승인된 메뉴 구조와 Content Migration Map, 참고 사이트의 Visual DNA 를 합쳐 새 Preview 를 만듭니다.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                <li>· 최상위 메뉴 {menuWarning(data.menu).topLevel}개</li>
                <li>· Migration 항목 {data.migration.items.length}개</li>
                <li>· 재작성 강도 {REWRITES.find((r) => r.value === data.rewriteLevel)?.label}</li>
              </ul>
            </div>
            {!data.menuApproved || !data.migrationApproved ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                메뉴 개선안과 Migration Map 을 먼저 승인해야 합니다.
              </p>
            ) : (
              <button className={`${button} w-full`} disabled={!!busy} onClick={() => void redesign()}>
                새 Preview 만들기
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Measured({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span className="font-medium">실측</span>
      {children}
    </span>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</div>
      <ul className="mt-1 space-y-1 text-sm leading-6">
        {items.map((t, i) => (
          <li key={i}>· {t}</li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisStep({ data, onNext }: { data: ImproveData; onNext: () => void }) {
  const f = data.facts;
  const a = data.analysis;
  const cardCls = "rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-medium">사이트 분석 결과</h2>
      {f && (
        <div className="flex flex-wrap gap-2">
          <Measured>메뉴 {f.navLinks.length}개</Measured>
          <Measured>이미지 {f.imageCount}개</Measured>
          <Measured>alt 누락 {f.missingAlt}개</Measured>
          <Measured>2400px 초과 {f.oversizedImages}개</Measured>
          <Measured>로드 {f.loadMs}ms</Measured>
          <Measured>폰트 {f.fonts.length}종</Measured>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardCls}>
          <h3 className="text-sm font-medium">구조</h3>
          <p className="mt-2 text-sm leading-6">{a.structure.navigation}</p>
          <List title="메뉴 위계" items={a.structure.menuHierarchy} />
          <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Footer · {a.structure.footer}</p>
          <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">CTA · {a.structure.cta}</p>
        </div>

        <div className={cardCls}>
          <h3 className="text-sm font-medium">콘텐츠</h3>
          <List title="중복" items={a.content.duplicates} />
          <List title="너무 긴 문장" items={a.content.tooLong} />
          <List title="약한 제목" items={a.content.weakHeadings} />
          <List title="빠진 정보" items={a.content.missing} />
          <List title="잘못 배치" items={a.content.misplaced} />
        </div>

        <div className={cardCls}>
          <h3 className="text-sm font-medium">디자인</h3>
          <dl className="mt-2 space-y-1.5 text-sm leading-6">
            {(
              [
                ["Typography", a.design.typography],
                ["Spacing", a.design.spacing],
                ["Color", a.design.color],
                ["Components", a.design.components],
                ["Imagery", a.design.imagery],
                ["Mobile", a.design.mobile],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={cardCls}>
          <h3 className="text-sm font-medium">UX</h3>
          <List title="주요 행동" items={a.ux.primaryActions} />
          <p className="mt-3 text-sm leading-6">전환 경로 · {a.ux.conversionPath}</p>
          <p className="mt-1 text-sm leading-6">내비게이션 명확성 · {a.ux.navigationClarity}</p>
          <p className="mt-1 text-sm leading-6">CTA 명확성 · {a.ux.ctaClarity}</p>
        </div>
      </div>

      <button className={button} onClick={onNext}>
        메뉴 개선안 보기
      </button>
    </section>
  );
}

function MenuTree({ nodes, depth = 0 }: { nodes: MenuProposal["after"]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-1.5" : "mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800"}>
      {nodes.map((n, i) => (
        <li key={`${n.label}-${i}`} className="text-sm leading-6">
          <span className={depth === 0 ? "font-medium" : "text-zinc-500 dark:text-zinc-400"}>{n.label}</span>
          {!!n.children?.length && <MenuTree nodes={n.children as MenuProposal["after"]} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function MenuStep({
  data,
  busy,
  onApprove,
}: {
  data: ImproveData;
  busy: boolean;
  onApprove: () => void;
}) {
  const w = menuWarning(data.menu);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">메뉴 개선안</h2>
        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          최상위 {w.topLevel}개
        </span>
        {w.tooManyTopLevel && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
            최상위가 7개를 넘습니다
          </span>
        )}
        {w.warn && (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-600 dark:text-rose-400">
            사라진 항목 {w.dropped.length}개
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">BEFORE · 기존 메뉴</h3>
          <ul className="mt-3 space-y-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            {data.menu.before.map((b, i) => (
              <li key={`${b}-${i}`} className={w.dropped.includes(b) ? "text-rose-600 dark:text-rose-400" : ""}>
                {b}
                {w.dropped.includes(b) && <span className="ml-1 text-[11px]">(새 구조에 없음)</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className={card}>
          <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">AFTER · 새 메뉴</h3>
          <div className="mt-3">
            <MenuTree nodes={data.menu.after} />
          </div>
        </div>
      </div>

      {w.warn && (
        <div className="rounded-xl border border-rose-300 p-4 text-sm dark:border-rose-900">
          <p className="font-medium text-rose-600 dark:text-rose-400">새 구조에서 사라진 기존 메뉴</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">{w.dropped.join(", ")}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            다음 단계 Migration Map 에 이 항목들의 처리가 설명돼 있어야 합니다.
          </p>
        </div>
      )}

      <div className={card}>
        <h3 className="text-sm font-medium">이렇게 묶은 이유</h3>
        <ul className="mt-2 space-y-1 text-sm leading-6">
          {data.menu.rationale.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      </div>

      {data.menuApproved ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">승인됨 — 다음 단계로 진행할 수 있습니다.</p>
      ) : (
        <button className={button} disabled={busy} onClick={onApprove}>
          이대로 진행
        </button>
      )}
    </section>
  );
}

function MigrationStep({
  data,
  busy,
  onApprove,
}: {
  data: ImproveData;
  busy: boolean;
  onApprove: () => void;
}) {
  const audit = data.migrationAudit;
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-medium">Content Migration Map</h2>

      {audit && audit.ok === false && (
        <div className="rounded-xl border border-rose-300 p-4 text-sm dark:border-rose-900">
          <p className="font-medium text-rose-600 dark:text-rose-400">설명되지 않은 기존 메뉴가 있습니다</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">{audit.unaccounted.join(", ")}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            이 항목들은 새 구조에서 사라졌지만 처리 방법이 기록되지 않았습니다. 승인 전에 확인하세요.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">기존</th>
              <th className="px-4 py-2 font-medium">새 위치</th>
              <th className="px-4 py-2 font-medium">처리</th>
              <th className="px-4 py-2 font-medium">이유</th>
            </tr>
          </thead>
          <tbody>
            {data.migration.items.map((it, i) => (
              <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-2 align-top">{it.from}</td>
                <td className="px-4 py-2 align-top">{it.to}</td>
                <td className="px-4 py-2 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${ACTION_STYLE[it.action]}`}>
                    {it.action}
                  </span>
                </td>
                <td className="px-4 py-2 align-top text-zinc-500 dark:text-zinc-400">{it.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className={card}>
        <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-300">
          생성 프롬프트에 실릴 새 메뉴 구조
        </summary>
        <pre className="mt-3 overflow-x-auto text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {menuTreeText(data.menu.after)}
        </pre>
      </details>

      {data.migrationApproved ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">승인됨 — 리디자인 단계로 진행할 수 있습니다.</p>
      ) : (
        <button className={button} disabled={busy} onClick={onApprove}>
          이대로 진행
        </button>
      )}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={90}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-zinc-900 dark:accent-zinc-100"
      />
    </div>
  );
}
