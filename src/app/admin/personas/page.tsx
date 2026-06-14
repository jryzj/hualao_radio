"use client";
import { useEffect, useState } from "react";

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ name: "", prompt: "" });

  useEffect(() => { reload(); }, []);
  async function reload() { setPersonas(await (await fetch("/api/admin/personas")).json()); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/personas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", prompt: "" });
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/personas/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <h1>主持人人设管理</h1>
      <form onSubmit={create} style={{ marginBottom: 20 }}>
        <input placeholder="人设名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ marginRight: 8 }} />
        <input placeholder="人设描述/Prompt" value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} required style={{ width: 300 }} />
        <button type="submit">新增</button>
      </form>
      <ul>
        {personas.map(p => (
          <li key={p.id as string} style={{ marginBottom: 8 }}>
            <strong>{p.name as string}</strong> — {p.prompt as string}
            <button onClick={() => remove(p.id as string)} style={{ marginLeft: 8, color: "red" }}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}