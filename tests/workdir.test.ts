import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BACKUP_DIR, backupFiles, checkWorkdir, checkWorkdirPath, isInside, resolveInside,
} from "@/lib/design/workdir";

const APP = "/Users/me/code/visualdna";

describe("경로 검증 — 남의 코드베이스에 쓰기 전 최소 방어", () => {
  it("정상 절대 경로는 통과한다", () => {
    expect(checkWorkdirPath("/Users/me/projects/mysite", APP).errors).toEqual([]);
  });

  it("상대 경로를 거부한다", () => {
    expect(checkWorkdirPath("../mysite", APP).errors[0]).toContain("절대 경로");
  });

  it("빈 입력을 거부한다", () => {
    expect(checkWorkdirPath("   ", APP).errors[0]).toContain("입력");
  });

  it("~ 를 홈으로 펼친다", () => {
    expect(checkWorkdirPath("~/projects/x", APP).root).toBe(path.join(os.homedir(), "projects/x"));
  });

  it("시스템 루트 계열을 거부한다", () => {
    for (const p of ["/", "/etc", "/usr", "/System", "/Applications", "/Users"]) {
      expect(checkWorkdirPath(p, APP).errors.length).toBeGreaterThan(0);
    }
  });

  it("홈 디렉터리 전체를 거부한다", () => {
    expect(checkWorkdirPath(os.homedir(), APP).errors[0]).toContain("홈 디렉터리");
  });

  it("자기 자신과 자기 하위, 자기 상위를 모두 거부한다", () => {
    expect(checkWorkdirPath(APP, APP).errors.length).toBeGreaterThan(0);
    expect(checkWorkdirPath(`${APP}/src`, APP).errors.length).toBeGreaterThan(0);
    expect(checkWorkdirPath("/Users/me/code", APP).errors.length).toBeGreaterThan(0);
  });

  it("끝 슬래시를 정규화한다", () => {
    expect(checkWorkdirPath("/Users/me/projects/mysite///", APP).root).toBe("/Users/me/projects/mysite");
  });
});

describe("디렉터리 격리", () => {
  it("안쪽 경로는 허용한다", () => {
    expect(resolveInside("/root/app", "components/Hero.tsx")).toBe("/root/app/components/Hero.tsx");
  });
  it(".. 로 탈출하는 경로를 막는다", () => {
    expect(() => resolveInside("/root/app", "../secret.txt")).toThrow("밖으로 쓸 수 없습니다");
    expect(() => resolveInside("/root/app", "a/../../b")).toThrow();
  });
  it("절대 경로로 탈출하는 것도 막는다", () => {
    expect(() => resolveInside("/root/app", "/etc/passwd")).toThrow();
  });
  it("isInside 는 자기 자신을 안쪽으로 보지 않는다", () => {
    expect(isInside("/a/b", "/a/b")).toBe(false);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
  });
});

const tmp = path.join(os.tmpdir(), `vdna-workdir-${process.pid}`);

describe("실제 디렉터리 검사와 백업", () => {
  beforeAll(async () => {
    await fs.mkdir(path.join(tmp, "site", "components"), { recursive: true });
    await fs.writeFile(path.join(tmp, "site", "page.tsx"), "기존 내용", "utf8");
    await fs.writeFile(path.join(tmp, "site", "components", "Hero.tsx"), "기존 Hero", "utf8");
  });
  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("존재하지 않는 경로를 잡는다", async () => {
    const r = await checkWorkdir(path.join(tmp, "없는폴더"), APP);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("존재하지 않는");
  });

  it("파일을 가리키면 거부한다", async () => {
    const r = await checkWorkdir(path.join(tmp, "site", "page.tsx"), APP);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("디렉터리가 아닙니다");
  });

  it("정상 디렉터리는 통과하고 내용을 보여준다", async () => {
    const r = await checkWorkdir(path.join(tmp, "site"), APP);
    expect(r.ok).toBe(true);
    expect(r.sample).toContain("page.tsx");
  });

  it("git 저장소가 아니면 경고한다 (막지는 않는다)", async () => {
    const r = await checkWorkdir(path.join(tmp, "site"), APP);
    expect(r.isGitRepo).toBe(false);
    expect(r.warnings.join(" ")).toContain("git");
    expect(r.ok).toBe(true);
  });

  it("덮어쓸 파일을 백업한다", async () => {
    const root = path.join(tmp, "site");
    const dest = await backupFiles(root, ["page.tsx", "components/Hero.tsx", "새파일.tsx"], "20260824-120000");
    expect(dest).toContain(BACKUP_DIR);
    expect(await fs.readFile(path.join(dest, "page.tsx"), "utf8")).toBe("기존 내용");
    expect(await fs.readFile(path.join(dest, "components", "Hero.tsx"), "utf8")).toBe("기존 Hero");
    // 새로 만들 파일은 백업 대상이 아니다
    await expect(fs.stat(path.join(dest, "새파일.tsx"))).rejects.toThrow();
  });

  it("백업할 기존 파일이 없으면 빈 경로를 준다", async () => {
    const dest = await backupFiles(path.join(tmp, "site"), ["없음1.tsx", "없음2.tsx"], "20260824-130000");
    expect(dest).toBe("");
  });

  it("백업도 디렉터리 밖으로 나갈 수 없다", async () => {
    await expect(backupFiles(path.join(tmp, "site"), ["../page.tsx"], "x")).rejects.toThrow();
  });
});
