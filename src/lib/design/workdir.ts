import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * 사용자의 실제 코드베이스를 대상으로 작업할 때의 안전장치.
 *
 * 여기서 쓰는 대상은 우리가 만든 workspace 가 아니라 **사용자가 이미 운영하는 프로젝트**다.
 * 잘못 쓰면 남의 작업물을 망친다. 그래서 경로를 검증하고, 디렉터리 밖으로 못 나가게 막고,
 * 덮어쓰기 전에 백업한다.
 */

export interface WorkdirCheck {
  ok: boolean;
  /** 정규화된 절대 경로 */
  root: string;
  errors: string[];
  warnings: string[];
  isGitRepo: boolean;
  /** git 저장소이고 커밋되지 않은 변경이 있는가 */
  isDirty: boolean;
  /** 눈에 보이는 상위 파일 몇 개 — 사용자가 경로를 잘못 짚었는지 확인용 */
  sample: string[];
}

const FORBIDDEN_EXACT = new Set(["/", "/Users", "/home", "/etc", "/usr", "/var", "/tmp", "/System", "/Applications"]);

function git(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, out: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out });
    });
  });
}

/** 경로만 보고 판단할 수 있는 것 — 파일시스템 접근 없이 테스트 가능하게 분리한다 */
export function checkWorkdirPath(input: string, appRoot = process.cwd()): { errors: string[]; root: string } {
  const errors: string[] = [];
  const raw = input.trim();
  if (!raw) return { errors: ["작업 디렉터리를 입력해주세요"], root: "" };

  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  if (!path.isAbsolute(expanded)) {
    errors.push("절대 경로를 입력해주세요 (예: /Users/me/projects/mysite)");
    return { errors, root: expanded };
  }

  const root = path.normalize(expanded).replace(/\/+$/, "") || "/";

  if (FORBIDDEN_EXACT.has(root)) errors.push(`${root} 는 작업 디렉터리로 쓸 수 없습니다`);
  if (root === os.homedir()) errors.push("홈 디렉터리 전체를 대상으로 삼을 수 없습니다");

  const app = path.normalize(appRoot).replace(/\/+$/, "");
  if (root === app) errors.push("VisualDNA 자신의 디렉터리는 대상으로 쓸 수 없습니다");
  if (isInside(app, root)) errors.push("VisualDNA 디렉터리 안의 경로는 대상으로 쓸 수 없습니다");
  if (isInside(root, app)) errors.push("VisualDNA 를 포함하는 상위 디렉터리는 대상으로 쓸 수 없습니다");

  return { errors, root };
}

/** child 가 parent 안에 있는가 (parent 자신은 제외) */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.normalize(parent), path.normalize(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function checkWorkdir(input: string, appRoot = process.cwd()): Promise<WorkdirCheck> {
  const { errors, root } = checkWorkdirPath(input, appRoot);
  const warnings: string[] = [];
  let isGitRepo = false;
  let isDirty = false;
  let sample: string[] = [];

  if (!errors.length) {
    try {
      const st = await fs.stat(root);
      if (!st.isDirectory()) errors.push("디렉터리가 아닙니다");
    } catch {
      errors.push("존재하지 않는 경로입니다");
    }
  }

  if (!errors.length) {
    try {
      sample = (await fs.readdir(root)).filter((f) => !f.startsWith(".")).slice(0, 12);
    } catch {
      errors.push("디렉터리를 읽을 수 없습니다 (권한 확인)");
    }

    // 쓰기 권한을 미리 확인한다 — 작업 도중에 실패하면 어중간한 상태가 남는다
    try {
      await fs.access(root, fs.constants.W_OK);
    } catch {
      errors.push("쓰기 권한이 없습니다");
    }

    const rev = await git(["rev-parse", "--show-toplevel"], root);
    isGitRepo = rev.code === 0 && rev.out.trim().length > 0;
    if (!isGitRepo) {
      warnings.push("git 저장소가 아닙니다. 변경을 되돌리기 어렵습니다 — 백업 사본은 남기지만 git 사용을 권합니다");
    } else {
      const status = await git(["status", "--porcelain"], root);
      isDirty = status.out.trim().length > 0;
      if (isDirty) {
        warnings.push("커밋되지 않은 변경이 있습니다. 먼저 커밋하거나 stash 하는 편이 안전합니다");
      }
    }
  }

  return { ok: errors.length === 0, root, errors, warnings, isGitRepo, isDirty, sample };
}

/** 작업 디렉터리 밖으로 나가는 경로를 거부한다 */
export function resolveInside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (target !== path.normalize(root) && !isInside(root, target)) {
    throw new Error(`작업 디렉터리 밖으로 쓸 수 없습니다: ${relative}`);
  }
  return target;
}

export const BACKUP_DIR = ".vdna-backup";

/**
 * 덮어쓸 파일들을 타임스탬프 폴더에 복사해 둔다.
 * git 이 없는 프로젝트에서도 최소한 되돌릴 수단을 남긴다.
 */
export async function backupFiles(root: string, relativeFiles: string[], stamp: string): Promise<string> {
  const dest = path.join(root, BACKUP_DIR, stamp);
  let copied = 0;
  for (const rel of relativeFiles) {
    const from = resolveInside(root, rel);
    try {
      await fs.stat(from);
    } catch {
      continue; // 새로 만들 파일은 백업할 것이 없다
    }
    const to = path.join(dest, rel);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    copied += 1;
  }
  if (copied === 0) {
    return "";
  }
  return dest;
}
