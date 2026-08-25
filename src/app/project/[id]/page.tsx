import Link from "next/link";
import { readMeta } from "@/lib/store";
import { VisualDna } from "@/lib/types";
import ProjectView from "./view";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let meta;
  try {
    meta = await readMeta(id);
  } catch {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-14">
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← 처음으로
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">프로젝트를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">프로젝트 ID: {id}</p>
      </main>
    );
  }

  const dna = VisualDna.safeParse(meta.visualDna);
  return (
    <ProjectView
      projectId={id}
      name={meta.name}
      versions={meta.versions.map((v) => ({ version: v.version, label: v.label, createdAt: v.createdAt }))}
      visualDna={dna.success ? dna.data : null}
    />
  );
}
