"use client";
import { useEffect, useState } from "react";

interface Persona { id: string; name: string; }
interface Workflow { id: string; name: string; }
interface Theme {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  prompt?: string;
  userPrompt?: string;
  audiencePrompt?: string;
  historyRounds?: number;
  personaId?: string;
  workflowId?: string;
  persona?: Persona;
  workflow?: Workflow;
}

interface FormState {
  name: string;
  description: string;
  prompt: string;
  userPrompt: string;
  audiencePrompt: string;
  historyRounds: number;
  personaId: string;
  workflowId: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  prompt: "",
  userPrompt: "请生成下一段直播内容。",
  audiencePrompt: "",
  historyRounds: 5,
  personaId: "",
  workflowId: "",
};

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => { reload(); }, []);
  async function reload() {
    const [t, p, w] = await Promise.all([
      fetch("/api/admin/topics").then(r => r.json()),
      fetch("/api/admin/personas").then(r => r.json()),
      fetch("/api/admin/workflows").then(r => r.json()),
    ]);
    setThemes(t || []);
    setPersonas(p || []);
    setWorkflows(w || []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        prompt: form.prompt,
        userPrompt: form.userPrompt,
        audiencePrompt: form.audiencePrompt,
        historyRounds: form.historyRounds,
        personaId: form.personaId,
        workflowId: form.workflowId,
      }),
    });
    setForm(DEFAULT_FORM);
    setIsCreating(false);
    reload();
  }

  async function toggleActive(id: string, isActive: boolean) {
    if (!isActive) {
      // Starting this topic - activate it first, then start live engine
      await fetch(`/api/admin/topics/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      await fetch(`/api/live/start`, { method: "POST" });
    } else {
      // Stopping this topic - deactivate it and stop live engine
      await fetch(`/api/live/stop`, { method: "POST" });
      await fetch(`/api/admin/topics/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
    }
    reload();
  }

  async function remove(id: string) {
    if (!confirm("确定要删除这个主题吗？")) return;
    await fetch(`/api/admin/topics/${id}`, { method: "DELETE" });
    reload();
  }

  function startEdit(t: Theme) {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      description: t.description ?? "",
      prompt: t.prompt ?? "",
      userPrompt: t.userPrompt ?? "请生成下一段直播内容。",
      audiencePrompt: t.audiencePrompt ?? "",
      historyRounds: t.historyRounds ?? 5,
      personaId: t.personaId ?? "",
      workflowId: t.workflowId ?? "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await fetch(`/api/admin/topics/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    reload();
  }

  // Shared form input + select classes — both need the gold focus ring
  // from the original <style> block, plus the placeholder dim color.
  const inputClass = "w-full rounded-md border border-[#2a2a32] bg-[#1a1a20] px-3.5 py-2.5 text-[13px] text-[#f0ece4] focus:border-[#e8a84c] focus:outline-none placeholder:text-[#5a5850]";
  const textareaClass = `${inputClass} h-20 resize-y`;

  return (
    // Tailwind v4 migration: the 18 style={{}} props + 17-line <style>
    // block are replaced with utility classes. The 640px breakpoint is
    // expressed as the arbitrary variant [@media(min-width:640px)]: since
    // the @theme sm is overridden to 480px.
    <div className="min-h-screen bg-[#0a0a0c] text-[#f0ece4]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a1a22] px-5 py-4 [@media(min-width:640px)]:px-8 [@media(min-width:640px)]:py-5">
        <h1 className="font-display text-base font-bold tracking-[2px]">直播主题</h1>
        <a href="/admin" className="text-xs text-[#9a958c] no-underline">← 返回概览</a>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-6 [@media(min-width:640px)]:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[11px] font-medium uppercase tracking-[3px] text-[#5a5850]">
            全部主题 ({themes.length})
          </h2>
          {!isCreating && (
            <button onClick={() => setIsCreating(true)} className="cursor-pointer rounded-md border border-[#2a2a32] [background:linear-gradient(145deg,#1a1a20,#222228)] px-[18px] py-2.5 text-xs text-[#f0ece4] transition-opacity hover:opacity-80">
              + 新增主题
            </button>
          )}
        </div>

        {isCreating && (
          <div className="mb-6 rounded-xl border border-[#2a2a32] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-6">
            <h3 className="mb-5 font-display text-sm font-medium tracking-[1px] text-[#f0ece4]">
              创建新主题
            </h3>
            <form onSubmit={create}>
              <div className="mb-5 grid grid-cols-1 gap-3 [@media(min-width:640px)]:grid-cols-2">
                <input className={inputClass} placeholder="主题名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                <input className={inputClass} placeholder="描述（选填）" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                <select className={inputClass} value={form.personaId} onChange={e => setForm({ ...form, personaId: e.target.value })} required>
                  <option value="">选择人设</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className={inputClass} value={form.workflowId} onChange={e => setForm({ ...form, workflowId: e.target.value })} required>
                  <option value="">选择工作流</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <textarea
                  className={`${textareaClass} [@media(min-width:640px)]:col-span-2`}
                  placeholder="系统 Prompt（发给 LLM 的指令，可使用 {{name}} {{personality}} {{theme.name}} {{theme.description}} 等变量）"
                  value={form.prompt}
                  onChange={e => setForm({ ...form, prompt: e.target.value })}
                />
                <textarea
                  className={`${textareaClass} [@media(min-width:640px)]:col-span-2`}
                  placeholder="LLM 用户消息模板（每轮发给 LLM 的 user 消息，可使用 {{listenerMessages}} {{listenerAuthors}} 等变量）"
                  value={form.userPrompt}
                  onChange={e => setForm({ ...form, userPrompt: e.target.value })}
                />
                <textarea
                  className={`${textareaClass} [@media(min-width:640px)]:col-span-2`}
                  placeholder="有新留言时使用的 Prompt（可使用 {{listenerMessages}} {{listenerAuthors}} 等变量；留空则回退到上面的 userPrompt）"
                  value={form.audiencePrompt}
                  onChange={e => setForm({ ...form, audiencePrompt: e.target.value })}
                />
                <input
                  className={inputClass}
                  type="number"
                  placeholder="历史轮数（-1 = 全部）"
                  value={form.historyRounds}
                  onChange={e => setForm({ ...form, historyRounds: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2.5">
                <button type="button" onClick={() => setIsCreating(false)} className="cursor-pointer rounded-md border border-[#2a2a32] bg-transparent px-[18px] py-2.5 text-xs text-[#9a958c] transition-opacity hover:opacity-80">
                  取消
                </button>
                <button type="submit" className="cursor-pointer rounded-md border-0 [background:linear-gradient(145deg,#e8a84c,#c77b4a)] px-5 py-2.5 font-display text-xs font-semibold tracking-[1px] text-[#0a0a0c] transition-opacity hover:opacity-80">
                  创建主题
                </button>
              </div>
            </form>
          </div>
        )}

        {editingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.8)]">
            <div className="w-[500px] max-w-[90vw] rounded-xl border border-[#2a2a32] bg-[#1a1a20] p-6">
              <h3 className="mb-5 font-display text-sm tracking-[1px]">编辑主题</h3>
              <form onSubmit={saveEdit}>
                <div className="mb-5 flex flex-col gap-3">
                  <input className={inputClass} placeholder="主题名称" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
                  <input className={inputClass} placeholder="描述" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                  <select className={inputClass} value={editForm.personaId} onChange={e => setEditForm({ ...editForm, personaId: e.target.value })} required>
                    <option value="">选择人设</option>
                    {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className={inputClass} value={editForm.workflowId} onChange={e => setEditForm({ ...editForm, workflowId: e.target.value })} required>
                    <option value="">选择工作流</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <textarea className={textareaClass} placeholder="系统 Prompt（发给 LLM）" value={editForm.prompt} onChange={e => setEditForm({ ...editForm, prompt: e.target.value })} />
                  <textarea className={textareaClass} placeholder="LLM 用户消息模板（可使用 {{listenerMessages}} 等变量）" value={editForm.userPrompt} onChange={e => setEditForm({ ...editForm, userPrompt: e.target.value })} />
                  <textarea className={textareaClass} placeholder="有新留言时使用的 Prompt（留空回退到 userPrompt）" value={editForm.audiencePrompt} onChange={e => setEditForm({ ...editForm, audiencePrompt: e.target.value })} />
                  <input className={inputClass} type="number" placeholder="历史轮数（-1 = 全部）" value={editForm.historyRounds} onChange={e => setEditForm({ ...editForm, historyRounds: Number(e.target.value) })} />
                </div>
                <div className="flex justify-end gap-2.5">
                  <button type="button" onClick={() => setEditingId(null)} className="cursor-pointer rounded-md border border-[#2a2a32] bg-transparent px-[18px] py-2.5 text-xs text-[#9a958c] transition-opacity hover:opacity-80">
                    取消
                  </button>
                  <button type="submit" className="cursor-pointer rounded-md border-0 [background:linear-gradient(145deg,#e8a84c,#c77b4a)] px-5 py-2.5 font-display text-xs font-semibold tracking-[1px] text-[#0a0a0c] transition-opacity hover:opacity-80">
                    保存
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">名称</th>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">描述</th>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">人设</th>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">工作流</th>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">状态</th>
                <th className="border-b border-[#1a1a22] px-3 py-3.5 text-left font-display text-[10px] font-medium uppercase tracking-[2px] text-[#5a5850]">操作</th>
              </tr>
            </thead>
            <tbody>
              {themes.map(t => (
                <tr key={t.id}>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px] font-semibold text-[#f0ece4]">{t.name}</td>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px] text-[#9a958c]">{t.description || "—"}</td>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px] text-[#9a958c]">{t.persona?.name || "—"}</td>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px] text-[#9a958c]">{t.workflow?.name || "—"}</td>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px]">
                    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-[3px] text-[10px] font-semibold tracking-[1px] ${t.isActive ? "border border-[rgba(92,157,110,0.3)] bg-[rgba(92,157,110,0.1)] text-[#5c9d6e]" : "border border-[rgba(90,88,80,0.3)] bg-[rgba(90,88,80,0.1)] text-[#5a5850]"}`}>
                      <span className={`h-1 w-1 rounded-full ${t.isActive ? "bg-[#5c9d6e]" : "bg-[#5a5850]"}`} />
                      {t.isActive ? "进行中" : "已停止"}
                    </span>
                  </td>
                  <td className="border-b border-[#1a1a22] px-3 py-4 text-[13px]">
                    <button
                      onClick={() => toggleActive(t.id, t.isActive)}
                      className="mr-1.5 cursor-pointer rounded border-0 bg-[rgba(232,168,76,0.1)] px-2.5 py-[5px] text-[11px] font-medium text-[#e8a84c] transition-opacity hover:opacity-80"
                    >
                      {t.isActive ? "停止" : "启动"}
                    </button>
                    <button
                      onClick={() => startEdit(t)}
                      className="mr-1.5 cursor-pointer rounded border-0 bg-[rgba(232,168,76,0.1)] px-2.5 py-[5px] text-[11px] font-medium text-[#e8a84c] transition-opacity hover:opacity-80"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="mr-1.5 cursor-pointer rounded border-0 bg-transparent px-2.5 py-[5px] text-[11px] font-medium text-[#d45c5c] transition-opacity hover:opacity-80"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {themes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-[13px] text-[#5a5850]">
                    暂无主题，创建一个开始直播吧
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
