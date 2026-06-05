// Decision LLM: ask the LLM whether the next broadcast needs external news
// context, and if so what query to use. Output is parsed back into a
// structured form.

import { getLLMConfig, getNewsConfig } from "@/config";

export const DECISION_SYSTEM_PROMPT = `你是直播间的"资讯需求评估员"。

输入包含：
- 当前主题（name, description）
- 最近 1-2 轮播音历史
- 当前时间
- 听众留言（如有）

你的唯一任务：判断下一段播音是否需要外部资讯支持。

输出（严格两种格式之一，不要任何额外文字）：
- 需要资讯：QUERY: <查询词>
- 不需要资讯：NO_NEWS

判定原则：
- 听众留言引用具体事件/人物/产品 → 需要查
- 主题本身是新闻/资讯类（财经、科技速递）→ 通常需要
- 主题是情感/聊天类（深夜电台）→ 大多数时候不需要
- 刚聊过的话题，短期内不需要再查`;

export interface DecisionInput {
  themeName: string;
  themeDescription: string;
  // NOTE: `recentHistory` and `pendingMessages` are declared but not
  // fed to the decision LLM in buildDecisionUserPrompt below. This is
  // deliberate (security review 2026-06-06, finding H3): listener
  // messages and recent broadcast text are untrusted and a prompt
  // that includes them lets a listener force the decision LLM to
  // emit "QUERY: <attacker-controlled URL>", pivoting the system
  // into a Tavily lookup the attacker chose. If you ever decide to
  // feed them in, sandbox them in a clearly delimited block and
  // require the LLM to decide only on the surrounding context.
  recentHistory: string;
  currentTime: string;
  pendingMessages: string;
}

export interface DecisionResult {
  need: boolean;
  query: string;
}

export function buildDecisionUserPrompt(input: DecisionInput): string {
  return [
    `当前主题：${input.themeName}`,
    `主题描述：${input.themeDescription}`,
    `当前时间：${input.currentTime}`,
  ].join("\n");
}

export function parseDecisionOutput(text: string): DecisionResult {
  const trimmed = text.trim();
  const match = trimmed.match(/^QUERY:\s*(.+)$/m);
  if (match) {
    return { need: true, query: match[1].trim() };
  }
  if (/^NO_NEWS$/m.test(trimmed)) {
    return { need: false, query: "" };
  }
  return { need: false, query: "" };
}

export interface CallDecisionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function callDecisionLLM(
  input: DecisionInput,
  options: CallDecisionOptions = {},
): Promise<string> {
  const config = await getLLMConfig();
  if (!config || !config.apiUrl) {
    throw new Error("LLMConfig missing or apiUrl empty");
  }
  const newsCfg = await getNewsConfig();
  const modelName = newsCfg.decisionModelName || config.modelName;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: DECISION_SYSTEM_PROMPT },
          { role: "user", content: buildDecisionUserPrompt(input) },
        ],
        max_completion_tokens: 80,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Decision LLM HTTP ${res.status}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } finally {
    clearTimeout(timer);
  }
}
