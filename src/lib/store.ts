import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

/** 프로젝트 파일 구조 (PRD §75) */
export const WORKSPACE = path.resolve(process.env.VDNA_WORKSPACE ?? "workspace");

export function projectDir(projectId: string) {
  return path.join(WORKSPACE, "projects", projectId);
}
export const templatesDir = () => path.join(WORKSPACE, "templates");

export const paths = (projectId: string) => {
  const root = projectDir(projectId);
  return {
    root,
    reference: path.join(root, "reference"),
    design: path.join(root, "design"),
    versions: path.join(root, "versions"),
    production: path.join(root, "production"),
    meta: path.join(root, "project.json"),
  };
};

export async function ensureProject(projectId: string) {
  const p = paths(projectId);
  await Promise.all(
    [p.reference, p.design, p.versions, p.production].map((d) => fs.mkdir(d, { recursive: true })),
  );
  return p;
}

export async function createProject(name: string) {
  const projectId = `${slug(name) || "project"}-${nanoid(6)}`;
  await ensureProject(projectId);
  await writeMeta(projectId, { projectId, name, createdAt: new Date().toISOString(), versions: [] });
  return projectId;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export interface VersionEntry {
  version: number;
  label: string;
  file: string;
  createdAt: string;
  approved?: boolean;
}

export interface ProjectMeta {
  projectId: string;
  name: string;
  createdAt: string;
  versions: VersionEntry[];
  brief?: unknown;
  visualDna?: unknown;
  scores?: unknown[];
  /** PRD §21 — 디자인 확정 시각. approveDesign 이 성공적으로 완료된 뒤에만 갱신된다 */
  approvedAt?: string;
  /** MODE 2 진행 상태 (src/app/improve/logic.ts 의 ImproveState) */
  improve?: unknown;
}

export async function readMeta(projectId: string): Promise<ProjectMeta> {
  const raw = await fs.readFile(paths(projectId).meta, "utf8");
  return JSON.parse(raw) as ProjectMeta;
}

export async function writeMeta(projectId: string, meta: ProjectMeta) {
  await fs.mkdir(paths(projectId).root, { recursive: true });
  await fs.writeFile(paths(projectId).meta, JSON.stringify(meta, null, 2), "utf8");
}

export async function patchMeta(projectId: string, patch: Partial<ProjectMeta>) {
  const meta = await readMeta(projectId);
  const next = { ...meta, ...patch };
  await writeMeta(projectId, next);
  return next;
}

/** 새 버전 저장 후 메타에 기록 (PRD §20) */
export async function saveVersion(projectId: string, html: string, label: string) {
  const p = await ensureProject(projectId);
  const meta = await readMeta(projectId);
  const version = (meta.versions.at(-1)?.version ?? 0) + 1;
  const file = path.join(p.versions, `preview-v${version}.html`);
  await fs.writeFile(file, html, "utf8");
  const entry: VersionEntry = {
    version,
    label,
    file: path.relative(WORKSPACE, file),
    createdAt: new Date().toISOString(),
  };
  await writeMeta(projectId, { ...meta, versions: [...meta.versions, entry] });
  return entry;
}

export async function readVersion(projectId: string, version: number) {
  const meta = await readMeta(projectId);
  const entry = meta.versions.find((v) => v.version === version);
  if (!entry) throw new Error(`v${version} 없음`);
  return { entry, html: await fs.readFile(path.join(WORKSPACE, entry.file), "utf8") };
}

export async function latestVersion(projectId: string) {
  const meta = await readMeta(projectId);
  const entry = meta.versions.at(-1);
  if (!entry) throw new Error("저장된 버전이 없습니다");
  return { entry, html: await fs.readFile(path.join(WORKSPACE, entry.file), "utf8") };
}
