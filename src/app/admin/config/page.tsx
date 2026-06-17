"use client";
import { useEffect, useState } from "react";

export default function ConfigPage() {
  const [data, setData] = useState<{ llm: Record<string, string> | null; comfyui: Record<string, string> | null; moderationPrompt: string | null; audioBuffer: { prebufferSentences: number; prebufferSeconds: number; prebufferMode: string; prebufferGroupSize: number; pauseThresholdMs: number } | null }>({ llm: null, comfyui: null, moderationPrompt: null, audioBuffer: null });
  const [form, setForm] = useState({ apiUrl: "", apiKey: "", modelName: "", serverUrl: "", comfyuiToken: "", webhookUrl: "", pollTimeoutMs: "", moderationPrompt: "", prebufferSentences: "", prebufferSeconds: "", prebufferMode: "sentences", prebufferGroupSize: "3", pauseThresholdMs: "60000" });

  useEffect(() => {
    fetch("/api/admin/config").then(r => r.json()).then(d => {
      setData(d);
      setForm({
        // Secret fields are returned masked as "<set>". Don't populate
        // them — leaving them empty means "keep the existing value"
        // when the form is saved.
        apiUrl: d.llm?.apiUrl ?? "",
        apiKey: "",
        modelName: d.llm?.modelName ?? "",
        serverUrl: d.comfyui?.serverUrl ?? "",
        comfyuiToken: "",
        webhookUrl: d.comfyui?.webhookUrl ?? "",
        pollTimeoutMs: d.comfyui?.pollTimeoutMs?.toString() ?? "120000",
        moderationPrompt: d.moderationPrompt ?? "",
        prebufferSentences: d.audioBuffer?.prebufferSentences?.toString() ?? "3",
        prebufferSeconds: d.audioBuffer?.prebufferSeconds?.toString() ?? "8",
        prebufferMode: d.audioBuffer?.prebufferMode ?? "sentences",
        prebufferGroupSize: d.audioBuffer?.prebufferGroupSize?.toString() ?? "3",
        pauseThresholdMs: d.audioBuffer?.pauseThresholdMs?.toString() ?? "60000",
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
          pauseThresholdMs: parseInt(form.pauseThresholdMs) || 60000,
        },
      }),
    });
    alert("保存成功");
  }

  // Shared form input style — all 11 inputs in this page had identical
  // { display:"block", width:400, marginBottom:8 } so a single class
  // replaces them. The moderation prompt textarea is taller (h-52)
  // and wider (w-[600px]) to fit the multi-line template.
  const inputClass = "mb-2 block w-[400px]";
  const promptClass = "mb-4 block h-52 w-[600px]";
  const labelClass = "mb-1 block";

  return (
    // Tailwind v4 migration: 20 style={{}} props with identical
    // {display:"block", width:400, marginBottom:8} replaced by shared
    // inputClass / promptClass / labelClass strings. No <style> block,
    // no responsive variants in the original.
    <div>
      <h1>系统配置</h1>
      <form onSubmit={save}>
        <h2>LLM 配置</h2>
        <input className={inputClass} placeholder="API URL" value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} />
        <input className={inputClass} placeholder={data.llm?.apiKey === "<set>" ? "已设置（留空保留原值）" : "API Key"} value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
        <input className="mb-4 block w-[400px]" placeholder="模型名称" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} />

        <h2>ComfyUI 配置</h2>
        <input className={inputClass} placeholder="服务器地址" value={form.serverUrl} onChange={e => setForm({ ...form, serverUrl: e.target.value })} />
        <input className={inputClass} placeholder={data.comfyui?.comfyuiToken === "<set>" ? "已设置（留空保留原值）" : "API Token (Bearer)"} value={form.comfyuiToken} onChange={e => setForm({ ...form, comfyuiToken: e.target.value })} />
        <input className={inputClass} placeholder="Webhook 回调地址" value={form.webhookUrl} onChange={e => setForm({ ...form, webhookUrl: e.target.value })} />
        <input className="mb-4 block w-[400px]" placeholder="TTS 超时时间(毫秒)" value={form.pollTimeoutMs} onChange={e => setForm({ ...form, pollTimeoutMs: e.target.value })} />

        <h2>AI 预审 Prompt</h2>
        <textarea className={promptClass} placeholder={`你是电台留言审核员。请审核以下留言是否可以通过。
留言作者：{{authorName}}
留言内容：{{content}}

判断标准：
- 包含人身攻击、辱骂、歧视、淫秽、政治敏感内容 → 拒绝
- 广告、垃圾信息、引流 → 拒绝
- 与节目主题相关、友善、积极 → 通过

请严格用以下 JSON 格式输出（不要任何其他文字）：
{"passed": true|false, "reason": "简短原因"}

如果你无法输出 JSON，则只输出单词 approve 表示通过。`} value={form.moderationPrompt} onChange={e => setForm({ ...form, moderationPrompt: e.target.value })} />

        <h2>音频播放缓冲配置</h2>
        <div className="mb-2">
          <label className={labelClass}>预缓冲句子数（开始播放前需等到的句子数）</label>
          <input className={inputClass} placeholder="预缓冲句子数" value={form.prebufferSentences} onChange={e => setForm({ ...form, prebufferSentences: e.target.value })} />
        </div>
        <div className="mb-2">
          <label className={labelClass}>预缓冲秒数（开始播放前需积累的音频时长）</label>
          <input className={inputClass} placeholder="预缓冲秒数" value={form.prebufferSeconds} onChange={e => setForm({ ...form, prebufferSeconds: e.target.value })} />
        </div>
        <div className="mb-2">
          <label className={labelClass}>预缓冲模式</label>
          <select className="mb-2 block w-[400px] p-2" value={form.prebufferMode} onChange={e => setForm({ ...form, prebufferMode: e.target.value })}>
            <option value="sentences">按句子数</option>
            <option value="seconds">按秒数</option>
            <option value="both">二者皆满足</option>
            <option value="group">按 N 句一组</option>
            <option value="paragraph">按段落</option>
          </select>
        </div>
        {form.prebufferMode === "group" && (
          <div className="mb-4">
            <label className={labelClass}>组大小 N（每组合并 N 句送 TTS，缓冲按组数计）</label>
            <input className={inputClass} placeholder="组大小" value={form.prebufferGroupSize} onChange={e => setForm({ ...form, prebufferGroupSize: e.target.value })} />
          </div>
        )}
        <div className="mb-4">
          <label className={labelClass}>LLM 生成过快暂停阈值 A（毫秒，累计 Σ(L2−L1) 超过此值时服务器暂停 LLM 内容生成；0 关闭）</label>
          <input className={inputClass} placeholder="60000" value={form.pauseThresholdMs} onChange={e => setForm({ ...form, pauseThresholdMs: e.target.value })} />
        </div>

        <button type="submit">保存配置</button>
      </form>
    </div>
  );
}
