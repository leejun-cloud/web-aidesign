"use client";

import { useEffect, useState } from "react";
import { MOTION_TEMPLATES } from "@/lib/design/motion";

/** PRD §47 — 각 Motion 템플릿을 CSS 만으로 미리보기 한다 (새 패키지 없이) */
const MOTION_CSS = `
@keyframes vd-fade-up { 0%,10% { opacity:0; transform:translateY(18px); } 55%,100% { opacity:1; transform:none; } }
@keyframes vd-soft-reveal { 0%,10% { clip-path:inset(0 0 100% 0); } 60%,100% { clip-path:inset(0 0 0 0); } }
@keyframes vd-stagger { 0%,10% { opacity:0; transform:translateY(10px); } 50%,100% { opacity:1; transform:none; } }
@keyframes vd-image-reveal { 0%,10% { clip-path:inset(0 100% 0 0); transform:scale(1.08); } 65%,100% { clip-path:inset(0 0 0 0); transform:scale(1); } }
@keyframes vd-parallax-back { 0% { transform:translateY(0); } 100% { transform:translateY(-14px); } }
@keyframes vd-parallax-front { 0% { transform:translateY(0); } 100% { transform:translateY(-30px); } }
@keyframes vd-sticky { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-22px); } }
@keyframes vd-horizontal { 0% { transform:translateX(0); } 100% { transform:translateX(-42%); } }
@keyframes vd-scale-in { 0%,10% { opacity:0; transform:scale(0.86); } 60%,100% { opacity:1; transform:scale(1); } }
@keyframes vd-counter { 0% { width:8%; } 100% { width:100%; } }
@keyframes vd-marquee { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
@keyframes vd-cursor { 0%,100% { transform:translate(0,0); } 50% { transform:translate(16px,10px); } }
@keyframes vd-hover-lift { 0%,100% { transform:translateY(0); box-shadow:0 1px 2px rgba(0,0,0,.18); } 50% { transform:translateY(-6px); box-shadow:0 10px 18px rgba(0,0,0,.22); } }
@keyframes vd-page-transition { 0% { opacity:1; transform:translateX(0); } 45% { opacity:0; transform:translateX(-24px); } 55% { opacity:0; transform:translateX(24px); } 100% { opacity:1; transform:translateX(0); } }
.vd-demo { animation-duration: 2.4s; animation-iteration-count: infinite; animation-timing-function: cubic-bezier(0.22,1,0.36,1); }
.vd-demo.d2 { animation-delay: .18s; }
.vd-demo.d3 { animation-delay: .36s; }
@media (prefers-reduced-motion: reduce) { .vd-demo { animation: none !important; } }
`;

const bar = "rounded-sm bg-zinc-400/70 dark:bg-zinc-500/70";
const block = "rounded-md bg-zinc-300 dark:bg-zinc-700";

function Demo({ id }: { id: string }) {
  const frame = "relative h-20 overflow-hidden rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900";
  switch (id) {
    case "fade-up":
      return (
        <div className={frame}>
          <div className="space-y-1.5">
            <div className={`vd-demo h-2.5 w-2/3 ${bar}`} style={{ animationName: "vd-fade-up" }} />
            <div className={`vd-demo d2 h-2 w-1/2 ${bar}`} style={{ animationName: "vd-fade-up" }} />
            <div className={`vd-demo d3 h-2 w-1/3 ${bar}`} style={{ animationName: "vd-fade-up" }} />
          </div>
        </div>
      );
    case "soft-reveal":
      return (
        <div className={frame}>
          <div className={`vd-demo h-full w-full ${block}`} style={{ animationName: "vd-soft-reveal" }} />
        </div>
      );
    case "text-stagger":
      return (
        <div className={frame}>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`vd-demo h-3 w-8 ${bar}`}
                style={{ animationName: "vd-stagger", animationDelay: `${i * 0.14}s` }}
              />
            ))}
          </div>
        </div>
      );
    case "image-reveal":
      return (
        <div className={frame}>
          <div className={`vd-demo h-full w-full ${block}`} style={{ animationName: "vd-image-reveal" }} />
        </div>
      );
    case "hero-parallax":
      return (
        <div className={frame}>
          <div className={`vd-demo absolute inset-x-3 top-6 h-10 ${block}`} style={{ animationName: "vd-parallax-back", animationDirection: "alternate" }} />
          <div className={`vd-demo absolute left-6 top-8 h-6 w-1/2 rounded-md bg-zinc-500`} style={{ animationName: "vd-parallax-front", animationDirection: "alternate" }} />
        </div>
      );
    case "sticky-story":
      return (
        <div className={`${frame} flex gap-2`}>
          <div className={`h-full w-1/3 ${block}`} />
          <div className="flex-1 space-y-1.5">
            <div className={`vd-demo h-2 w-full ${bar}`} style={{ animationName: "vd-sticky", animationDirection: "alternate" }} />
            <div className={`vd-demo d2 h-2 w-4/5 ${bar}`} style={{ animationName: "vd-sticky", animationDirection: "alternate" }} />
            <div className={`vd-demo d3 h-2 w-3/5 ${bar}`} style={{ animationName: "vd-sticky", animationDirection: "alternate" }} />
          </div>
        </div>
      );
    case "horizontal-showcase":
      return (
        <div className={frame}>
          <div className="vd-demo flex gap-2" style={{ animationName: "vd-horizontal", animationDirection: "alternate" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-14 w-16 shrink-0 ${block}`} />
            ))}
          </div>
        </div>
      );
    case "scale-in":
      return (
        <div className={`${frame} flex items-center justify-center gap-2`}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`vd-demo h-12 w-12 ${block}`}
              style={{ animationName: "vd-scale-in", animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      );
    case "counter-up":
      return (
        <div className={`${frame} flex flex-col justify-center gap-2`}>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className={`vd-demo h-full rounded-full bg-zinc-500`} style={{ animationName: "vd-counter", animationDirection: "alternate" }} />
          </div>
          <div className="h-2 w-3/4 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className={`vd-demo d2 h-full rounded-full bg-zinc-400`} style={{ animationName: "vd-counter", animationDirection: "alternate" }} />
          </div>
        </div>
      );
    case "marquee":
      return (
        <div className={frame}>
          <div className="vd-demo flex w-[200%] gap-3" style={{ animationName: "vd-marquee", animationTimingFunction: "linear" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`h-3 w-14 shrink-0 ${bar}`} />
            ))}
          </div>
        </div>
      );
    case "cursor-follow":
      return (
        <div className={`${frame} flex items-center justify-center`}>
          <div className={`vd-demo h-6 w-6 rounded-full bg-zinc-500`} style={{ animationName: "vd-cursor", animationDirection: "alternate" }} />
        </div>
      );
    case "hover-lift":
      return (
        <div className={`${frame} flex items-center justify-center`}>
          <div className={`vd-demo h-12 w-24 ${block}`} style={{ animationName: "vd-hover-lift" }} />
        </div>
      );
    default:
      return (
        <div className={frame}>
          <div className={`vd-demo h-full w-full ${block}`} style={{ animationName: "vd-page-transition" }} />
        </div>
      );
  }
}

interface CustomMotion {
  id: string;
  name: string;
  description: string;
  suits: string[];
  sourceUrl: string;
  createdAt: string;
}

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700";
const button =
  "shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900";

/** 예: motionsites.ai 같은 모션 쇼케이스 사이트에서 특성만 뽑아온다 (코드·애셋 복제 아님) */
function ImportMotionForm({ onImported }: { onImported: (t: CustomMotion) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/motion-template/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, name: name.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "가져오기 실패");
      onImported({
        id: json.template.id,
        name: json.template.name,
        description: json.template.motionDna.description,
        suits: json.template.motionDna.suits,
        sourceUrl: json.template.sourceUrl,
        createdAt: json.template.createdAt,
      });
      setNotice(json.notice);
      setUrl("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium">+ 외부 사이트에서 모션 가져오기</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        예: motionsites.ai 같은 모션 쇼케이스 사이트. 실제 애니메이션 코드나 애셋을 그대로 가져오지 않고,
        움직임의 성격(트리거·타이밍·강도)만 추출해 새 Motion Template 으로 만듭니다.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className={input}
          placeholder="https://motionsites.ai/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className={`${input} sm:w-48`}
          placeholder="이름 (선택)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className={button} disabled={!url.trim() || busy} onClick={submit}>
          {busy ? "분석 중…" : "가져오기"}
        </button>
      </div>
      {busy && (
        <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          사이트를 캡처하고 모션 특성을 분석하는 중입니다 — 1~2분 걸릴 수 있습니다.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {notice && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{notice}</p>}
    </div>
  );
}

function CustomMotionCard({ t }: { t: CustomMotion }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-400">
          추출됨
        </span>
        <span className="truncate text-sm font-medium">{t.name}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t.description}</p>
      <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">잘 맞는 섹션: {t.suits.join(", ")}</p>
      <p className="mt-2 truncate text-[11px] text-zinc-400 dark:text-zinc-500" title={t.sourceUrl}>
        출처: {t.sourceUrl} · 코드/애셋 복제 아님, 특성만 추출
      </p>
    </div>
  );
}

export function MotionTemplates() {
  const [custom, setCustom] = useState<CustomMotion[]>([]);

  useEffect(() => {
    void fetch("/api/motion-template/list")
      .then((r) => r.json())
      .then((json) => setCustom(json.custom ?? []))
      .catch(() => undefined);
  }, []);

  return (
    <section>
      <style>{MOTION_CSS}</style>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        섹션에 적용할 수 있는 모션 {MOTION_TEMPLATES.length}종입니다. 애니메이션 코드를 직접 쓰지 않고 이름으로 고릅니다.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MOTION_TEMPLATES.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <Demo id={t.id} />
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs tabular-nums text-zinc-400">{t.no}</span>
              <span className="text-sm font-medium">{t.name}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t.description}</p>
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">잘 맞는 섹션: {t.suits.join(", ")}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <ImportMotionForm onImported={(t) => setCustom((cur) => [t, ...cur])} />
        {custom.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((t) => (
              <CustomMotionCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
