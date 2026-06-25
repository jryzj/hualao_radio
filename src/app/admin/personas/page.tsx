"use client";
import { useEffect, useState } from "react";

interface Persona {
  id: string;
  name: string;
  personality: string;
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [form, setForm] = useState({ name: "", personality: "" });
  // Inline-edit state. When `editingId` matches a persona's id, that
  // row renders inputs + 保存/取消 instead of read-only text + 编辑/删除.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", personality: "" });
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => { reload(); }, []);
  async function reload() { setPersonas(await (await fetch("/api/admin/personas")).json()); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/personas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", personality: "" });
    reload();
  }

  function startEdit(p: Persona) {
    setEditingId(p.id);
    setEditForm({ name: p.name, personality: p.personality });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", personality: "" });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim() || !editForm.personality.trim()) {
      alert("名称和性格描述都不能为空");
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/personas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`保存失败: ${err.error ?? res.status}`);
        return;
      }
      cancelEdit();
      reload();
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除该人设？")) return;
    await fetch(`/api/admin/personas/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <h1>主持人人设管理</h1>
      <form onSubmit={create} style={{ marginBottom: 20 }}>
        <input placeholder="人设名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ marginRight: 8 }} />
        <input placeholder="人设性格 / Personality" value={form.personality} onChange={e => setForm({ ...form, personality: e.target.value })} required style={{ width: 300 }} />
        <button type="submit">新增</button>
      </form>
      <ul>
        {personas.map(p => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            {editingId === p.id ? (
              <>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ marginRight: 8 }}
                />
                <input
                  value={editForm.personality}
                  onChange={e => setEditForm({ ...editForm, personality: e.target.value })}
                  style={{ width: 300, marginRight: 8 }}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(p.id)}
                  disabled={savingId === p.id}
                  style={{ marginRight: 4 }}
                >
                  {savingId === p.id ? "保存中…" : "保存"}
                </button>
                <button type="button" onClick={cancelEdit} disabled={savingId === p.id}>取消</button>
              </>
            ) : (
              <>
                <strong>{p.name}</strong> — {p.personality}
                <button type="button" onClick={() => startEdit(p)} style={{ marginLeft: 8 }}>编辑</button>
                <button type="button" onClick={() => remove(p.id)} style={{ marginLeft: 4, color: "red" }}>删除</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
