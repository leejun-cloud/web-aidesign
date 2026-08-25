import { spawn } from "node:child_process";
import path from "node:path";
import { z, type ZodType } from "zod";

export type Engine = "claude" | "codex";

export interface AgentCall {
  prompt: string;
  /** 절대경로 이미지 목록 — 에이전트가 Read 도구로 직접 읽는다 */
  images?: string[];
  /** 에이전트가 읽고 쓸 수 있는 작업 디렉터리 */
  cwd?: string;
  engine?: Engine;
  model?: string;
  timeoutMs?: number;
  /** 파일 쓰기까지 허용해야 하는 작업 */
  allowWrite?: boolean;
}

const DEFAULT_TIMEOUT = 15 * 60 * 1000;

function engineFrom(explicit?: Engine): Engine {
  const env = process.env.VDNA_ENGINE as Engine | undefined;
  return explicit ?? (env === "codex" ? "codex" : "claude");
}

function buildPrompt(call: AgentCall): string {
  if (!call.images?.length) return call.prompt;
  const list = call.images.map((p) => `- ${path.resolve(p)}`).join("\n");
  return `${call.prompt}\n\n## 첨부 이미지 (Read 도구로 직접 열어서 볼 것)\n${list}`;
}

function argsFor(engine: Engine, call: AgentCall, prompt: string): string[] {
  if (engine === "codex") {
    const a = ["exec", "--skip-git-repo-check"];
    if (call.allowWrite) a.push("--sandbox", "workspace-write");
    if (call.model) a.push("--model", call.model);
    a.push(prompt);
    return a;
  }
  const tools = call.allowWrite ? "Read,Write,Edit,Glob,Grep" : "Read,Glob,Grep";
  const a = ["-p", prompt, "--output-format", "json", "--allowed-tools", tools];
  if (call.allowWrite) a.push("--permission-mode", "acceptEdits");
  a.push("--model", call.model ?? "sonnet");
  return a;
}

function extractText(engine: Engine, stdout: string): string {
  if (engine === "codex") return stdout.trim();
  try {
    const parsed = JSON.parse(stdout);
    if (parsed?.is_error) throw new Error(`agent error: ${parsed.result ?? "unknown"}`);
    if (typeof parsed?.result === "string") return parsed.result;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("agent error")) throw e;
  }
  return stdout.trim();
}

export async function runAgent(call: AgentCall): Promise<string> {
  const engine = engineFrom(call.engine);
  const prompt = buildPrompt(call);
  const args = argsFor(engine, call, prompt);
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(engine, args, {
      cwd: call.cwd ?? process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${engine} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${engine} 실행 실패: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${engine} exit ${code}: ${err.slice(0, 800)}`));
      try {
        resolve(extractText(engine, out));
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

/** ```json 펜스나 앞뒤 잡설을 걷어내고 최상위 JSON 객체/배열만 뽑는다 */
export function carveJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[{[]/);
  if (start === -1) throw new Error("응답에 JSON이 없습니다");
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return body.slice(start, i + 1);
  }
  throw new Error("JSON 이 닫히지 않았습니다");
}

/**
 * 스키마를 프롬프트에 실어 보낸다.
 * 산문으로만 키를 설명하면 모델이 키 이름과 타입을 매번 다르게 추측한다 —
 * 여러 단계를 직렬로 엮은 흐름에서는 그 실패율이 곱해져 완주가 사실상 불가능해진다.
 */
function schemaBlock(schema: ZodType<unknown>): string {
  let json: string;
  try {
    json = JSON.stringify(z.toJSONSchema(schema, { io: "input" }), null, 2);
  } catch {
    return ""; // 재귀 스키마 등 변환 불가 — 산문 설명에 의존한다
  }
  return `\n\n## 출력 JSON Schema (이 구조를 정확히 따른다)\n\`\`\`json\n${json}\n\`\`\`
- 키 이름과 중첩 구조를 이 스키마 그대로 쓴다. 비슷한 뜻의 다른 이름으로 바꾸지 않는다.
- \`type: "array"\` 인 필드는 항목이 없어도 반드시 \`[]\` 로 출력한다. 문자열이나 객체로 대체하지 않는다.
- \`enum\` 이 있는 필드는 나열된 값 중 하나를 정확히 그대로 쓴다.
- \`required\` 필드를 빠뜨리지 않는다.`;
}

/** 스키마 검증 실패 시 오류를 그대로 되먹여 1회 교정 재시도 */
export async function runAgentJson<T>(schema: ZodType<T>, call: AgentCall): Promise<T> {
  const rule =
    "\n\n## 출력 규칙\n설명·머리말·코드펜스 없이 유효한 JSON 하나만 출력한다. 스키마에 없는 키를 추가하지 않는다." +
    schemaBlock(schema as ZodType<unknown>);
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? call.prompt + rule
        : `${call.prompt}${rule}\n\n## 직전 시도가 실패했다\n${last}\n동일 스키마로 다시, JSON 만 출력하라.`;
    let raw: string;
    try {
      raw = await runAgent({ ...call, prompt });
    } catch (e) {
      last = (e as Error).message;
      continue;
    }
    try {
      const parsed = schema.safeParse(JSON.parse(carveJson(raw)));
      if (parsed.success) return parsed.data;
      last = JSON.stringify(parsed.error.issues.slice(0, 12));
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(`구조화 출력 실패: ${last}`);
}
