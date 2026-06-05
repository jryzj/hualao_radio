import { LLMConfig } from "@/config";

export async function* streamChat(
  config: LLMConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): AsyncGenerator<string> {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: true,
      thinking: { type: "disabled" },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("LLM API returned empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let lineBuffer = "";
  let raw = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) raw += content;
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Strip <think>...</think> blocks (can be multiline, can repeat)
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (cleaned) yield cleaned;
}
