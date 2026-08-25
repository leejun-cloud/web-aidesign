import { describe, expect, it, vi } from "vitest";

/**
 * 실제로 있었던 사고: /api/template/from-url 처리 도중 클라이언트가 타임아웃으로
 * 끊기면, 서버는 계속 처리 중인데 사용자가 같은 요청을 다시 보내 완전히 같은
 * 작업이 두 번 실행되어 템플릿이 중복 생성됐다. 같은 (url, level) 요청은
 * 진행 중인 Promise 에 합류시켜야 한다.
 */

let captureCalls = 0;

vi.mock("@/lib/design/capture", () => ({
  captureUrl: vi.fn(async (_url: string, out: string) => {
    captureCalls += 1;
    await new Promise((r) => setTimeout(r, 50));
    return out;
  }),
}));
vi.mock("@/lib/design/generate", () => ({
  generatePreview: vi.fn(async () => ({
    html: "<!doctype html><html><body><section data-vdna-id=\"hero\"></section></body></html>",
    audit: { ok: true, found: ["hero"], duplicates: [], unknown: [], missingRequired: [] },
    attempts: 1,
  })),
}));
vi.mock("@/lib/design/visualDna", () => ({
  analyzeReference: vi.fn(async () => ({ mood: ["calm"] })),
}));
vi.mock("@/lib/design/templateStore", () => ({
  buildReferenceTemplateBrief: vi.fn(() => ({
    projectId: "staging-x",
    mode: "create",
    references: [{ id: "A", kind: "url", value: "https://example.com" }],
    level: "similar",
    advanced: {},
    photo: {},
  })),
  extractPhotoDna: vi.fn(async () => ({ name: "p", traits: ["a", "b", "c"], lighting: "x", grading: "y", subject: "z", depthOfField: "w" })),
  saveTemplate: vi.fn(async (args: { name: string }) => ({ id: `tpl-${args.name}-${Date.now()}`, ...args })),
}));

const { POST } = await import("@/app/api/template/from-url/route");

function req(body: unknown) {
  return new Request("http://localhost/api/template/from-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/template/from-url — 동시 재시도 중복 방지", () => {
  it("같은 URL 로 동시에 두 번 요청하면 실제 캡처는 한 번만 일어난다", async () => {
    captureCalls = 0;
    const [r1, r2] = await Promise.all([
      POST(req({ url: "https://dedupe-test.example.com", name: "A" })),
      POST(req({ url: "https://dedupe-test.example.com", name: "B" })),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // desktop + mobile 캡처 2회가 정확히 한 세트만 실행돼야 한다 (중복이면 4회)
    expect(captureCalls).toBe(2);

    const j1 = await r1.json();
    const j2 = await r2.json();
    expect(j1.template.id).toBe(j2.template.id);
  });

  it("다른 URL 요청은 독립적으로 각각 처리된다", async () => {
    captureCalls = 0;
    const [r1, r2] = await Promise.all([
      POST(req({ url: "https://dedupe-a.example.com" })),
      POST(req({ url: "https://dedupe-b.example.com" })),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(captureCalls).toBe(4); // 서로 다른 URL 이므로 각각 2회씩
  });

  it("완료 후 재요청하면 다시 새로 실행된다 (무한정 캐시되지 않는다)", async () => {
    captureCalls = 0;
    await POST(req({ url: "https://dedupe-sequential.example.com" }));
    await POST(req({ url: "https://dedupe-sequential.example.com" }));
    expect(captureCalls).toBe(4); // 순차 실행이므로 매번 새로 돈다
  });
});
