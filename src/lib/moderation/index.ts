import { getLLMConfig, getModerationPrompt } from "@/config";

export type ModerationStatus = "approved" | "rejected" | "pending";

export interface ModerationResult {
  status: ModerationStatus;
  reason: string;
}

const TIMEOUT_MS = 30_000;
const APPROVE_RE = /\bapprove\b/i;

export async function moderateMessage(content: string, authorName: string): Promise<ModerationResult> {
  const [config, promptTemplate] = await Promise.all([
    getLLMConfig(),
    getModerationPrompt(),
  ]);

  if (!config || !promptTemplate) {
    return { status: "approved", reason: "未启用审核" };
  }

  const prompt = promptTemplate
    .replace("{{content}}", content)
    .replace("{{authorName}}", authorName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text = "";
  try {
    const res = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 200,
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    text = data.choices?.[0]?.message?.content ?? "";
  } catch {
    // network / timeout / abort — fall through
  } finally {
    clearTimeout(timer);
  }

  // 1. JSON 优先
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.passed === "boolean") {
      const reason = typeof parsed.reason === "string" && parsed.reason.length > 0
        ? parsed.reason
        : (parsed.passed ? "LLM 通过" : "LLM 拒绝");
      return { status: parsed.passed ? "approved" : "rejected", reason };
    }
  } catch {
    // not JSON
  }

  // 2. 关键词兜底
  if (APPROVE_RE.test(text)) {
    return { status: "approved", reason: "LLM 关键词兜底" };
  }

  // 3. 全失败 → pending 等人工
  return { status: "pending", reason: "LLM 调用失败，待人工" };
}
