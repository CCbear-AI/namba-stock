// 高科 iAI（OpenAI 相容 API）。金鑰放 IAI_API_KEY，不寫進程式碼。
// 學校 GPU 尖峰時段會排隊（429／503），呼叫端一律要有退路，不能讓網頁卡住。
// 學校的模型多半會先「思考」再回答，思考也算字數，所以 max_tokens 要給寬，否則回答會是空的。

const BASE = (process.env.IAI_BASE_URL || "https://www.iai.nkust.edu.tw/aihub/v1").replace(/\/$/, "");
export const AI_MODEL = process.env.IAI_MODEL || "Furen-large";

export const aiReady = () => !!process.env.IAI_API_KEY?.trim();

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: Msg[], { model = AI_MODEL, timeout = 60_000, temperature = 0.2, maxTokens = 8000 } = {}): Promise<string> {
  const key = process.env.IAI_API_KEY?.trim();
  if (!key) throw new Error("沒有設定 IAI_API_KEY");
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`AI 服務 ${r.status}${r.status === 429 || r.status === 503 ? "（學校伺服器忙碌）" : ""}`);
  const j = await r.json();
  const text: string = j.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("AI 沒有回應內容");
  return text;
}

/** 從回覆中取出 JSON（模型常會包 ```json 或在前面加思考過程） */
export function parseJson<T>(text: string): T {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI 回覆不是 JSON");
  return JSON.parse(body.slice(a, b + 1)) as T;
}
