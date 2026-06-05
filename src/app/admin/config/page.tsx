"use client";
import { useEffect, useState } from "react";

export default function ConfigPage() {
  const [data, setData] = useState<{ llm: Record<string, string> | null; comfyui: Record<string, string> | null; moderationPrompt: string | null; audioBuffer: { prebufferSentences: number; prebufferSeconds: number; prebufferMode: string; prebufferGroupSize: number } | null }>({ llm: null, comfyui: null, moderationPrompt: null, audioBuffer: null });
  const [form, setForm] = useState({ apiUrl: "", apiKey: "", modelName: "", serverUrl: "", comfyuiToken: "", webhookUrl: "", pollTimeoutMs: "", moderationPrompt: "", prebufferSentences: "", prebufferSeconds: "", prebufferMode: "sentences", prebufferGroupSize: "3" });

  useEffect(() => {
    fetch("/api/admin/config").then(r => r.json()).then(d => {
      setData(d);
      setForm({
        apiUrl: d.llm?.apiUrl ?? "",
        apiKey: d.llm?.apiKey ?? "",
        modelName: d.llm?.modelName ?? "",
        serverUrl: d.comfyui?.serverUrl ?? "",
        comfyuiToken: d.comfyui?.comfyuiToken ?? "",
        webhookUrl: d.comfyui?.webhookUrl ?? "",
        pollTimeoutMs: d.comfyui?.pollTimeoutMs?.toString() ?? "120000",
        moderationPrompt: d.moderationPrompt ?? "",
        prebufferSentences: d.audioBuffer?.prebufferSentences?.toString() ?? "3",
        prebufferSeconds: d.audioBuffer?.prebufferSeconds?.toString() ?? "8",
        prebufferMode: d.audioBuffer?.prebufferMode ?? "sentences",
        prebufferGroupSize: d.audioBuffer?.prebufferGroupSize?.toString() ?? "3",
      });
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm: { apiUrl: form.apiUrl, apiKey: form.apiKey, modelName: form.modelName },
        comfyui: { serverUrl: form.serverUrl, comfyuiToken: form.comfyuiToken, webhookUrl: form.webhookUrl, pollTimeoutMs: parseInt(form.pollTimeoutMs) || 120000 },
        moderationPrompt: form.moderationPrompt,
        audioBuffer: {
          prebufferSentences: parseInt(form.prebufferSentences) || 3,
          prebufferSeconds: parseInt(form.prebufferSeconds) || 8,
          prebufferMode: form.prebufferMode,
          prebufferGroupSize: parseInt(form.prebufferGroupSize) || 3,
        },
      }),
    });
    alert("保存成功");
  }

  return (
    <div>
      <h1>系统配置</h1>
      <form onSubmit={save}>
        <h2>LLM 配置</h2>
        <input placeholder="API URL" value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        <input placeholder="API Key" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        <input placeholder="模型名称" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} style={{ display: "block", width: 400, marginBottom: 16 }} />

        <h2>ComfyUI 配置</h2>
        <input placeholder="服务器地址" value={form.serverUrl} onChange={e => setForm({ ...form, serverUrl: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        <input placeholder="API Token (Bearer)" value={form.comfyuiToken} onChange={e => setForm({ ...form, comfyuiToken: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        <input placeholder="Webhook 回调地址" value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        <input placeholder="TTS 超时时间(毫秒)" value={form.pollTimeoutMs} onChange={e => setForm({ ...form, pollTimeoutMs: e.target.value })} style={{ display: "block", width: 400, marginBottom: 16 }} />

        <h2>AI 预审 Prompt</h2>
        <textarea placeholder={`你是电台留言审核员。请审核以下留言是否可以通过。
留言作者：{{authorName}}
留言内容：{{content}}

判断标准：
- 包含人身攻击、辱骂、歧视、淫秽、政治敏感内容 → 拒绝
- 广告、垃圾信息、引流 → 拒绝
- 与节目主题相关、友善、积极 → 通过

请严格用以下 JSON 格式输出（不要任何其他文字）：
{"passed": true|false, "reason": "简短原因"}

如果你无法输出 JSON，则只输出单词 approve 表示通过。`} value={form.moderationPrompt} onChange={e => setForm({ ...form, moderationPrompt: e.target.value })} style={{ display: "block", width: 600, height: 200, marginBottom: 16 }} />

        <h2>音频播放缓冲配置</h2>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", marginBottom: 4 }}>预缓冲句子数（开始播放前需等到的句子数）</label>
          <input placeholder="预缓冲句子数" value={form.prebufferSentences} onChange={e => setForm({ ...form, prebufferSentences: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", marginBottom: 4 }}>预缓冲秒数（开始播放前需积累的音频时长）</label>
          <input placeholder="预缓冲秒数" value={form.prebufferSeconds} onChange={e => setForm({ ...form, prebufferSeconds: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", marginBottom: 4 }}>预缓冲模式</label>
          <select value={form.prebufferMode} onChange={e => setForm({ ...form, prebufferMode: e.target.value })} style={{ display: "block", width: 400, padding: 8 }}>
            <option value="sentences">按句子数</option>
            <option value="seconds">按秒数</option>
            <option value="both">二者皆满足</option>
            <option value="group">按 N 句一组</option>
            <option value="paragraph">按段落</option>
          </select>
        </div>
        {form.prebufferMode === "group" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>组大小 N（每组合并 N 句送 TTS，缓冲按组数计）</label>
            <input placeholder="组大小" value={form.prebufferGroupSize} onChange={e => setForm({ ...form, prebufferGroupSize: e.target.value })} style={{ display: "block", width: 400, marginBottom: 8 }} />
          </div>
        )}

        <button type="submit">保存配置</button>
      </form>
    </div>
  );
}