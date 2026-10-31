import Link from "next/link";

const MODES = [
  {
    href: "/create",
    title: "새 사이트 만들기",
    desc: "마음에 드는 사이트를 참고해 랜딩페이지를 새로 만듭니다.",
    ready: true,
  },
  {
    href: "/improve",
    title: "기존 사이트 개선",
    desc: "지금 쓰는 사이트의 디자인을 참고 사이트 수준으로 끌어올립니다.",
    ready: true,
  },
  {
    href: "/evaluate",
    title: "사이트 평가·비교",
    desc: "내 사이트와 경쟁사를 같은 기준으로 점수화해 비교합니다.",
    ready: true,
  },
  {
    href: "/templates",
    title: "디자인 템플릿",
    desc: "미리 만들어 둔 디자인에서 출발합니다.",
    ready: true,
  },
  {
    href: "/clone",
    title: "다른 곳 복제하기",
    desc: "URL 하나로 기존 사이트를 구조·문안까지 최대한 그대로 재현합니다.",
    ready: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">무엇을 해볼까요?</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        하고 싶은 일을 하나 고르세요.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{m.title}</span>
              {!m.ready && (
                <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  준비 중
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{m.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
