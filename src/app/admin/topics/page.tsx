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

  const s = {
    container: { minHeight: "100vh", background: "#0a0a0c", color: "#f0ece4" },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 20px", borderBottom: "1px solid #1a1a22",
      flexWrap: "wrap", gap: 12,
    },
    title: { fontFamily: "'Oswald', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: 2 },
    backLink: { fontSize: 12, color: "#9a958c", textDecoration: "none" },
    main: { padding: "24px 20px", maxWidth: 1200, margin: "0 auto" },
    topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 },
    sectionTitle: {
      fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 500,
      letterSpacing: 3, color: "#5a5850", textTransform: "uppercase",
    },
    tableWrapper: { overflowX: "auto", margin: "0 -20px", padding: "0 20px" },
    table: { width: "100%", minWidth: 600, borderCollapse: "collapse" },
    th: {
      textAlign: "left", padding: "14px 12px",
      fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 500,
      letterSpacing: 2, color: "#5a5850",
      borderBottom: "1px solid #1a1a22", textTransform: "uppercase",
    },
    td: { padding: "16px 12px", borderBottom: "1px solid #1a1a22", fontSize: 13 },
    statusBadge: (active: boolean) => ({
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: 1,
      background: active ? "rgba(92, 157, 110, 0.1)" : "rgba(90, 88, 80, 0.1)",
      color: active ? "#5c9d6e" : "#5a5850",
      border: `1px solid ${active ? "rgba(92, 157, 110, 0.3)" : "rgba(90, 88, 80, 0.3)"}`,
    }),
    statusDot: (active: boolean) => ({
      width: 4, height: 4, borderRadius: "50%",
      background: active ? "#5c9d6e" : "#5a5850",
    }),
    actionBtn: (variant: "start" | "stop" | "delete") => ({
      padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4,
      border: "none", cursor: "pointer", marginRight: 6,
      background: variant === "delete" ? "transparent" : "rgba(232, 168, 76, 0.1)",
      color: variant === "delete" ? "#d45c5c" : "#e8a84c",
    }),
    createCard: {
      background: "linear-gradient(145deg, #12121a, #0e0e14)",
      border: "1px solid #2a2a32", borderRadius: 12, padding: 24, marginBottom: 24,
    },
    formGrid: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 12,
      marginBottom: 20,
    },
    input: {
      width: "100%", padding: "11px 14px", background: "#1a1a20",
      border: "1px solid #2a2a32", borderRadius: 6, color: "#f0ece4", fontSize: 13,
    },
    select: {
      width: "100%", padding: "11px 14px", background: "#1a1a20",
      border: "1px solid #2a2a32", borderRadius: 6, color: "#f0ece4", fontSize: 13,
    },
    buttonRow: { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" },
    cancelBtn: {
      padding: "9px 18px", background: "transparent", border: "1px solid #2a2a32",
      borderRadius: 6, color: "#9a958c", fontSize: 12, cursor: "pointer",
    },
    submitBtn: {
      padding: "9px 20px",
      background: "linear-gradient(145deg, #e8a84c, #c77b4a)",
      border: "none", borderRadius: 6, color: "#0a0a0c",
      fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
      letterSpacing: 1, cursor: "pointer",
    },
    addBtn: {
      padding: "9px 18px",
      background: "linear-gradient(145deg, #1a1a20, #222228)",
      border: "1px solid #2a2a32", borderRadius: 6,
      color: "#f0ece4", fontSize: 12, cursor: "pointer",
    },
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <h1 style={s.title}>直播主题</h1>
        <a href="/admin" style={s.backLink}>← 返回概览</a>
      </header>

      <main style={s.main}>
        <div style={s.topBar}>
          <h2 style={s.sectionTitle}>全部主题 ({themes.length})</h2>
          {!isCreating && (
            <button style={s.addBtn} onClick={() => setIsCreating(true)}>+ 新增主题</button>
          )}
        </div>

        {isCreating && (
          <div style={s.createCard}>
            <h3 style={{
              fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 500,
              marginBottom: 20, letterSpacing: 1, color: "#f0ece4",
            }}>
              创建新主题
            </h3>
            <form onSubmit={create}>
              <div style={s.formGrid as React.CSSProperties}>
                <input
                  placeholder="主题名称"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  style={s.input}
                />
                <input
                  placeholder="描述（选填）"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  style={s.input}
                />
                <select
                  value={form.personaId}
                  onChange={e => setForm({ ...form, personaId: e.target.value })}
                  required
                  style={s.select}
                >
                  <option value="">选择人设</option>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select
                  value={form.workflowId}
                  onChange={e => setForm({ ...form, workflowId: e.target.value })}
                  required
                  style={s.select}
                >
                  <option value="">选择工作流</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <textarea
                  placeholder="系统 Prompt（发给 LLM 的指令，可使用 {{name}} {{prompt}} {{theme.name}} {{theme.description}} 等变量）"
                  value={form.prompt}
                  onChange={e => setForm({ ...form, prompt: e.target.value })}
                  style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties}
                />
                <textarea
                  placeholder="LLM 用户消息模板（每轮发给 LLM 的 user 消息，可使用 {{listenerMessages}} {{listenerAuthors}} 等变量）"
                  value={form.userPrompt}
                  onChange={e => setForm({ ...form, userPrompt: e.target.value })}
                  style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties}
                />
                <textarea
                  placeholder="有新留言时使用的 Prompt（可使用 {{listenerMessages}} {{listenerAuthors}} 等变量；留空则回退到上面的 userPrompt）"
                  value={form.audiencePrompt}
                  onChange={e => setForm({ ...form, audiencePrompt: e.target.value })}
                  style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties}
                />
                <input
                  type="number"
                  placeholder="历史轮数（-1 = 全部）"
                  value={form.historyRounds}
                  onChange={e => setForm({ ...form, historyRounds: Number(e.target.value) })}
                  style={s.input}
                />
              </div>
              <div style={s.buttonRow}>
                <button type="button" style={s.cancelBtn} onClick={() => setIsCreating(false)}>取消</button>
                <button type="submit" style={s.submitBtn}>创建主题</button>
              </div>
            </form>
          </div>
        )}

        {editingId && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}>
            <div style={{
              background: "#1a1a20", border: "1px solid #2a2a32", borderRadius: 12,
              padding: 24, width: 500, maxWidth: "90vw",
            }}>
              <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, marginBottom: 20, letterSpacing: 1 }}>编辑主题</h3>
              <form onSubmit={saveEdit}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  <input placeholder="主题名称" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required style={s.input} />
                  <input placeholder="描述" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={s.input} />
                  <select value={editForm.personaId} onChange={e => setEditForm({ ...editForm, personaId: e.target.value })} required style={s.select}>
                    <option value="">选择人设</option>
                    {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={editForm.workflowId} onChange={e => setEditForm({ ...editForm, workflowId: e.target.value })} required style={s.select}>
                    <option value="">选择工作流</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <textarea placeholder="系统 Prompt（发给 LLM）" value={editForm.prompt} onChange={e => setEditForm({ ...editForm, prompt: e.target.value })} style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties} />
                  <textarea placeholder="LLM 用户消息模板（可使用 {{listenerMessages}} 等变量）" value={editForm.userPrompt} onChange={e => setEditForm({ ...editForm, userPrompt: e.target.value })} style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties} />
                  <textarea placeholder="有新留言时使用的 Prompt（留空回退到 userPrompt）" value={editForm.audiencePrompt} onChange={e => setEditForm({ ...editForm, audiencePrompt: e.target.value })} style={{ ...s.input, height: 80, resize: "vertical" } as React.CSSProperties} />
                  <input type="number" placeholder="历史轮数（-1 = 全部）" value={editForm.historyRounds} onChange={e => setEditForm({ ...editForm, historyRounds: Number(e.target.value) })} style={s.input} />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" style={s.cancelBtn} onClick={() => setEditingId(null)}>取消</button>
                  <button type="submit" style={s.submitBtn}>保存</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div style={s.tableWrapper}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>名称</th>
                <th style={s.th}>描述</th>
                <th style={s.th}>人设</th>
                <th style={s.th}>工作流</th>
                <th style={s.th}>状态</th>
                <th style={s.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {themes.map(t => (
                <tr key={t.id}>
                  <td style={{ ...s.td, fontWeight: 600, color: "#f0ece4" }}>{t.name}</td>
                  <td style={{ ...s.td, color: "#9a958c" }}>{t.description || "—"}</td>
                  <td style={{ ...s.td, color: "#9a958c" }}>{t.persona?.name || "—"}</td>
                  <td style={{ ...s.td, color: "#9a958c" }}>{t.workflow?.name || "—"}</td>
                  <td style={s.td}>
                    <span style={s.statusBadge(t.isActive)}>
                      <span style={s.statusDot(t.isActive)} />
                      {t.isActive ? "进行中" : "已停止"}
                    </span>
                  </td>
                  <td style={s.td}>
                    <button
                      style={s.actionBtn(t.isActive ? "stop" : "start")}
                      onClick={() => toggleActive(t.id, t.isActive)}
                    >
                      {t.isActive ? "停止" : "启动"}
                    </button>
                    <button
                      style={{ ...s.actionBtn("start"), marginRight: 6 }}
                      onClick={() => startEdit(t)}
                    >
                      编辑
                    </button>
                    <button
                      style={s.actionBtn("delete")}
                      onClick={() => remove(t.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {themes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{
                    ...s.td, textAlign: "center", color: "#5a5850", padding: "48px 0"
                  }}>
                    暂无主题，创建一个开始直播吧
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <style>{`
        input:focus, select:focus {
          border-color: #e8a84c !important;
        }
        input::placeholder { color: #5a5850; }
        button:hover { opacity: 0.8; }
        @media (min-width: 640px) {
          .form-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .header {
            padding: 20px 32px !important;
          }
          .main {
            padding: 32px !important;
          }
        }
      `}</style>
    </div>
  );
}