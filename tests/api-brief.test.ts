import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 실제로 있었던 사고: 클라이언트가 존재하지 않는 projectId 를 /api/brief 에 보내면
 * patchMeta → readMeta 가 project.json 을 못 찾아 그대로 500 크래시했다.
 * 다른 탭에서 만든 stale id 재사용, workspace 초기화 후 재요청 등에서 실제로 일어난다.
 */
const ws = path.join(os.tmpdir(), `vdna-api-brief-${process.pid}`);
process.env.VDNA_WORKSPACE = ws;

const { POST } = await import("@/app/api/brief/route");

function req(body: unknown) {
  return new Request("http://localhost/api/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = (projectId: string) => ({
  projectId,
  mode: "create",
  references: [{ id: "A", kind: "url", value: "https://example.com" }],
  level: "similar",
  advanced: { layout: 60, photography: 65, typography: 45, color: 45, components: 50, spacing: 60, motion: 40 },
  photo: { composition: 55, lighting: 65, colorGrading: 60, cameraAngle: 40, depthOfField: 50, humanPose: 30, texture: 50 },
  notes: [{ stage: "design", text: "파란색 계열은 피해주세요", at: "2026-08-25T00:00:00.000Z" }],
});

beforeAll(async () => {
  await fs.mkdir(ws, { recursive: true });
});
afterAll(async () => {
  await fs.rm(ws, { recursive: true, force: true });
});

describe("POST /api/brief — 존재하지 않는 projectId (실제 사고 재현)", () => {
  it("500 이 아니라 200 으로 부트스트랩한다", async () => {
    const res = await POST(req(validBody("never-created-before")));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projectId).toBe("never-created-before");
    expect(json.brief.notes).toEqual(validBody("x").notes);
  });

  it("project.json 이 실제로 디스크에 만들어진다", async () => {
    await POST(req(validBody("another-never-created")));
    const raw = await fs.readFile(path.join(ws, "projects", "another-never-created", "project.json"), "utf8");
    const meta = JSON.parse(raw);
    expect(meta.projectId).toBe("another-never-created");
    expect(meta.brief.mode).toBe("create");
  });

  it("이미 존재하는 프로젝트는 기존 필드를 보존하며 병합한다", async () => {
    await POST(req(validBody("existing-project")));
    const res2 = await POST(req({ ...validBody("existing-project"), notes: [] }));
    expect(res2.status).toBe(200);
    const raw = await fs.readFile(path.join(ws, "projects", "existing-project", "project.json"), "utf8");
    const meta = JSON.parse(raw);
    expect(meta.createdAt).toBeDefined();
  });

  it("검증 실패(잘못된 body)는 여전히 400 이다", async () => {
    const res = await POST(req({ projectId: "bad-body", mode: "create" }));
    expect(res.status).toBe(400);
  });
});
