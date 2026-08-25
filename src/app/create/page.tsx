"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  AXES,
  type AdvancedSimilarity,
  type Axis,
  type BlendMode,
  type PhotoSimilarity,
  type Reference,
  type SimilarityLevel,
  LEVEL_LABELS,
  LEVEL_ORDER,
} from "@/lib/types";
import { buildBrief, clampAxis, mergeAdvanced, presetFor } from "@/lib/design/brief";
import { normalizeUrl } from "@/lib/design/url";
import { noteFromText } from "@/lib/design/notes";
import { NoteField } from "../NoteField";

// 라벨 정의는 types.ts 한 곳에만 둔다 (화면마다 다르게 적히던 문제를 없앤다)
const LEVELS = LEVEL_ORDER.map((value) => ({ value, ...LEVEL_LABELS[value] }));

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

interface RefSlot {
  id: string;
  url: string;
  filePath: string;
  fileName: string;
  /** 저장된 Template 에서 출발한 슬롯 (PRD §42) */
  templateId?: string;
  templateName?: string;
}

const emptySlot = (id: string): RefSlot => ({ id, url: "", filePath: "", fileName: "" });

function toReference(slot: RefSlot): Reference | null {
  if (slot.templateId) return { id: slot.id, kind: "template", value: slot.templateId };
  if (slot.filePath) return { id: slot.id, kind: "screenshot", value: slot.filePath };
  if (slot.url.trim()) {
    // "같이.com" 처럼 프로토콜 없는 입력을 여기서 정규화한다 —
    // 그대로 넘기면 브라우저 계층에서 크래시가 난다
    const check = normalizeUrl(slot.url);
    if (!check.ok) throw new Error(check.error);
    return { id: slot.id, kind: "url", value: check.url! };
  }
  return null;
}

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateForm />
    </Suspense>
  );
}

function CreateForm() {
  const [slots, setSlots] = useState<RefSlot[]>([emptySlot("A")]);
  const [level, setLevel] = useState<SimilarityLevel>("similar");
  const [blend, setBlend] = useState<BlendMode>("a-structure-b-style");
  const [advanced, setAdvanced] = useState<AdvancedSimilarity>(presetFor("similar").advanced);
  const [photo, setPhoto] = useState<PhotoSimilarity>(presetFor("similar").photo);
  const dirtyAxes = useRef<Set<Axis>>(new Set());
  const photoDirty = useRef<Set<keyof PhotoSimilarity>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [brandBrief, setBrandBrief] = useState("");
  // 폼으로 담을 수 없는 제약·맥락을 받는 자리 (PRD 밖 요구, 실무에서 절반을 차지한다)
  const [designNote, setDesignNote] = useState("");
  const [contentNote, setContentNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const router = useRouter();
  const search = useSearchParams();
  const templateParam = search.get("template");

  const twoRefs = slots.length === 2;

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

  // PRD §42 — 저장된 Template 에서 출발한다. Template 은 이미 Visual DNA 를 갖고 있어 재분석하지 않는다.
  useEffect(() => {
    if (!templateParam) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/template/get?id=${encodeURIComponent(templateParam)}`);
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? "템플릿을 찾을 수 없습니다");
        const t = json.template as { id: string; name: string; defaultLevel: SimilarityLevel };
        setSlots([{ ...emptySlot("A"), templateId: t.id, templateName: t.name }]);
        pickLevel(t.defaultLevel);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "템플릿 불러오기 실패");
      }
    })();
    return () => {
      alive = false;
    };
  }, [templateParam]);

  function setSlot(i: number, patch: Partial<RefSlot>) {
    setSlots((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function upload(i: number, file: File) {
    setError("");
    const body = new FormData();
    body.set("file", file);
    if (projectId) body.set("projectId", projectId);
    setBusy(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setProjectId(json.projectId);
      setSlot(i, { filePath: json.path, fileName: file.name, url: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError("");
    setDone("");
    let references: Reference[];
    try {
      references = slots.map(toReference).filter((r): r is Reference => r !== null);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (references.length !== slots.length) {
      setError("각 Reference 에 URL 을 넣거나 스크린샷을 올려주세요");
      return;
    }
    let payload;
    try {
      payload = buildBrief({
        projectId: projectId || "pending",
        mode: "create",
        references,
        level,
        advanced,
        photo,
        blend: twoRefs ? blend : undefined,
        brandBrief,
        notes: [
          ...noteFromText(designNote, "design", new Date().toISOString()),
          ...noteFromText(contentNote, "content", new Date().toISOString()),
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해주세요");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, projectId: projectId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setProjectId(json.projectId);
      setDone(`저장했습니다 · 프로젝트 ${json.projectId}`);
      router.push(`/project/${json.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← 처음으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">새 사이트 만들기</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        참고할 사이트를 알려주세요. 최대 2개까지 넣을 수 있습니다.
      </p>

      {/* Reference */}
      <section className="mt-8 space-y-4">
        {slots.map((slot, i) => (
          <div
            key={slot.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
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

            {slot.templateId ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                <span className="text-sm">
                  저장된 템플릿 <span className="font-medium">{slot.templateName}</span>
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Visual DNA 를 그대로 재사용합니다
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSlot(i, { templateId: undefined, templateName: undefined })}
                  className="shrink-0 text-xs text-zinc-500 hover:underline"
                >
                  해제
                </button>
              </div>
            ) : (
            <>
            <input
              type="url"
              value={slot.url}
              onChange={(e) => setSlot(i, { url: e.target.value, filePath: "", fileName: "" })}
              placeholder="https://example.com"
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
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
            </>
            )}
          </div>
        ))}

        {slots.length < 2 && (
          <button
            type="button"
            onClick={() => setSlots((cur) => [...cur, emptySlot("B")])}
            className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            + Reference 하나 더 추가
          </button>
        )}
      </section>

      {/* 조합 방식 */}
      {twoRefs && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">두 사이트를 어떻게 섞을까요?</h2>
          <div className="mt-3 space-y-2">
            {BLENDS.map((b) => (
              <label key={b.value} className="flex items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="blend"
                  checked={blend === b.value}
                  onChange={() => setBlend(b.value)}
                />
                {b.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* 유사도 */}
      <section className="mt-8">
        <h2 className="text-sm font-medium">얼마나 비슷하게 만들까요?</h2>
        <div className="mt-3 space-y-2">
          {LEVELS.map((l) => (
            <label key={l.value} className="flex items-baseline gap-3 text-sm">
              <input
                type="radio"
                name="level"
                checked={level === l.value}
                onChange={() => pickLevel(l.value)}
              />
              <span>{l.label}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{l.hint}</span>
            </label>
          ))}
        </div>
      </section>

      {/* 고급 설정 */}
      <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
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
      </section>

      {/* 브랜드 설명 */}
      <section className="mt-8">
        <label className="text-sm font-medium" htmlFor="brandBrief">
          브랜드 설명 <span className="text-zinc-500">(선택)</span>
        </label>
        <textarea
          id="brandBrief"
          value={brandBrief}
          maxLength={4000}
          rows={4}
          onChange={(e) => setBrandBrief(e.target.value)}
          placeholder="어떤 브랜드인지, 누구에게 보여줄 페이지인지 자유롭게 적어주세요."
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <div className="mt-1 text-right text-xs text-zinc-400">{brandBrief.length} / 4000</div>
      </section>

      {/* 추가로 남기고 싶은 이야기 */}
      <section className="mt-8 space-y-5 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-medium">추가로 남기고 싶은 이야기</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            위 항목으로 담기 어려운 제약이나 맥락을 적어주세요. 다른 지시보다 먼저 반영됩니다.
          </p>
        </div>
        <NoteField stage="design" value={designNote} onChange={setDesignNote} />
        <NoteField stage="content" value={contentNote} onChange={setContentNote} />
      </section>

      {error && <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {done && <p className="mt-6 text-sm text-emerald-600 dark:text-emerald-400">{done}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-8 w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "처리 중…" : "랜딩페이지 만들어보기"}
      </button>
    </main>
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
