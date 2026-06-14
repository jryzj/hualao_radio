"use client";
import { useEffect, useState } from "react";

interface Workflow {
  id: string;
  name: string;
  workflowJson: string;
  inputParams: string;
  refAudioPath: string | null;
  refText: string | null;
  instruct: string;
  speed: number;
}

interface CreateForm {
  name: string;
  workflowJson: string;
  inputParams: string;
  speed: string;
  refText: string;
  instruct: string;
  refAudioFile: File | null;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [form, setForm] = useState<CreateForm>({ name: "", workflowJson: "", inputParams: "", speed: "1", refText: "", instruct: "", refAudioFile: null });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [refTextEdits, setRefTextEdits] = useState<Record<string, string>>({});
  const [instructEdits, setInstructEdits] = useState<Record<string, string>>({});

  useEffect(() => { reload(); }, []);
  async function reload() { setWorkflows(await (await fetch("/api/admin/workflows")).json()); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { refAudioFile, refText, instruct, workflowJson, inputParams, speed, name } = form;
    // Step 1: JSON 创建工作流
    const res = await fetch("/api/admin/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        workflowJson: workflowJson || "",
        inputParams: inputParams.split(",").map(s => s.trim()),
        speed: parseFloat(speed),
        refText: refText || null,
        instruct,
      }),
    });
    if (!res.ok) {
      alert(`创建失败: ${res.status}`);
      return;
    }
    const created = await res.json() as Workflow;
    // Step 2: 如选了文件，上传参考音频
    if (refAudioFile) {
      const fd = new FormData();
      fd.append("file", refAudioFile);
      const upRes = await fetch(`/api/admin/workflows/${created.id}/ref-audio`, {
        method: "POST",
        body: fd,
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        alert(`工作流已创建，但参考音频上传失败: ${err.error ?? upRes.status}`);
      }
    }
    setForm({ name: "", workflowJson: "", inputParams: "", speed: "1", refText: "", instruct: "", refAudioFile: null });
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/workflows/${id}`, { method: "DELETE" });
    reload();
  }

  async function uploadRefAudio(workflowId: string, file: File) {
    setUploadingId(workflowId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/workflows/${workflowId}/ref-audio`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`上传失败: ${err.error ?? res.status}`);
      }
    } finally {
      setUploadingId(null);
      reload();
    }
  }

  async function deleteRefAudio(workflowId: string) {
    if (!confirm("确认删除参考音频？")) return;
    const res = await fetch(`/api/admin/workflows/${workflowId}/ref-audio`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败");
    }
    reload();
  }

  async function saveRefText(workflowId: string, newVal: string, currentVal: string | null) {
    const normalized = newVal || null;
    if (normalized === currentVal) return;
    const res = await fetch(`/api/admin/workflows/${workflowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refText: normalized }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`ref_text 保存失败: ${err.error ?? res.status}`);
    }
    reload();
  }

  async function saveInstruct(workflowId: string, newVal: string, currentVal: string) {
    if (newVal === currentVal) return;
    const res = await fetch(`/api/admin/workflows/${workflowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruct: newVal }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`instruct 保存失败: ${err.error ?? res.status}`);
    }
    reload();
  }

  const getEditVal = (id: string, refText: string | null) => refTextEdits[id] ?? refText ?? "";
  const getInstructEditVal = (id: string, instruct: string) => instructEdits[id] ?? instruct ?? "";

  const s = {
    page: { padding: "24px", maxWidth: 900 },
    title: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: 3, color: "#5a5850", marginBottom: 20, textTransform: "uppercase" },
    form: { display: "flex", flexWrap: "wrap" as const, gap: 12, marginBottom: 24, alignItems: "flex-end" },
    input: { padding: "10px 12px", background: "#1a1a20", border: "1px solid #2a2a32", borderRadius: 6, color: "#f0ece4", fontSize: 13 },
    btn: { padding: "10px 20px", background: "linear-gradient(145deg, #e8a84c, #c77b4a)", border: "none", borderRadius: 6, color: "#0a0a0c", fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 500, letterSpacing: 1, cursor: "pointer" },
    list: { listStyle: "none", padding: 0, margin: 0 },
    item: { background: "#12121a", border: "1px solid #1a1a22", borderRadius: 8, padding: "16px 20px", marginBottom: 12 },
    itemName: { fontFamily: "'Oswald', sans-serif", fontSize: 16, fontWeight: 500, color: "#f0ece4", marginBottom: 8 },
    itemMeta: { display: "flex", gap: 16, fontSize: 11, color: "#5a5850", flexWrap: "wrap" as const, marginBottom: 12 },
    delBtn: { background: "none", border: "none", color: "#d45c5c", cursor: "pointer", fontSize: 12 },
    label: { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 10, color: "#9a958c", letterSpacing: 1 },
    audioRow: { display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" as const },
    fileInput: { fontSize: 12, color: "#9a958c" },
    refTextRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" as const },
    instructRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" as const },
    saveBtn: { padding: "6px 12px", background: "linear-gradient(145deg, #e8a84c, #c77b4a)", border: "none", borderRadius: 4, color: "#0a0a0c", fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: 1, cursor: "pointer" },
    saveBtnDisabled: { padding: "6px 12px", background: "#2a2a32", border: "1px solid #1a1a22", borderRadius: 4, color: "#5a5850", fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: 1, cursor: "not-allowed" },
  };

  return (
    <div style={s.page}>
      <h2 style={s.title}>ComfyUI 工作流</h2>
      <form onSubmit={create} style={s.form}>
        <label style={s.label}>
          名称
          <input placeholder="工作流名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={s.input} />
        </label>
        <label style={s.label}>
          speed
          <input type="number" step="0.1" min="0.5" max="3" placeholder="1" value={form.speed} onChange={e => setForm({ ...form, speed: e.target.value })} style={s.input} />
        </label>
        <label style={s.label}>
          输入参数字符串
          <input placeholder="逗号分隔参数" value={form.inputParams} onChange={e => setForm({ ...form, inputParams: e.target.value })} style={s.input} />
        </label>
        <label style={s.label}>
          ref_text（克隆工作流节点 35 参考文本）
          <input
            placeholder="如：我们下期再见，记得点赞关注哦！拜拜！"
            value={form.refText}
            onChange={e => setForm({ ...form, refText: e.target.value })}
            style={s.input}
          />
        </label>
        <label style={s.label}>
          instruct（克隆工作流节点 35 语音指令）
          <input
            placeholder="如：东北话 / 粤语 / 温柔女声"
            value={form.instruct}
            onChange={e => setForm({ ...form, instruct: e.target.value })}
            style={s.input}
          />
        </label>
        <label style={s.label}>
          参考音频（可选）
          <input
            type="file"
            accept="audio/*"
            onChange={e => setForm({ ...form, refAudioFile: e.target.files?.[0] ?? null })}
            style={s.fileInput}
          />
        </label>
        <button type="submit" style={s.btn}>新增工作流</button>
      </form>

      <ul style={s.list}>
        {workflows.map(w => (
          <li key={w.id} style={s.item}>
            <div style={s.itemName}>{w.name}</div>
            <div style={s.itemMeta}>
              <span>speed: <strong style={{ color: "#9a958c" }}>{w.speed}</strong></span>
              {w.inputParams && <span>params: {w.inputParams}</span>}
              <span>instruct: <strong style={{ color: w.instruct ? "#9a958c" : "#3a3a40" }}>{w.instruct || "（未设置）"}</strong></span>
            </div>
            <div style={s.audioRow}>
              {w.refAudioPath ? (
                <>
                  <audio controls src={`/${w.refAudioPath}`} style={{ height: 40 }} />
                  <label style={s.fileInput}>
                    {uploadingId === w.id ? "上传中..." : "替换参考音频:"}
                    <input
                      type="file"
                      accept="audio/*"
                      disabled={uploadingId === w.id}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadRefAudio(w.id, f);
                        e.target.value = "";
                      }}
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                  <button onClick={() => deleteRefAudio(w.id)} style={s.delBtn}>删除参考音频</button>
                </>
              ) : (
                <label style={s.fileInput}>
                  {uploadingId === w.id ? "上传中..." : "上传参考音频（启用 voice clone）:"}
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={uploadingId === w.id}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadRefAudio(w.id, f);
                      e.target.value = "";
                    }}
                    style={{ marginLeft: 8 }}
                  />
                </label>
              )}
              <button onClick={() => remove(w.id)} style={{ ...s.delBtn, marginLeft: "auto" }}>删除工作流</button>
            </div>
            <div style={s.refTextRow}>
              <span style={{ ...s.fileInput, color: "#5a5850", fontSize: 10, letterSpacing: 1 }}>ref_text:</span>
              <input
                value={getEditVal(w.id, w.refText)}
                onChange={e => setRefTextEdits({ ...refTextEdits, [w.id]: e.target.value })}
                onBlur={e => saveRefText(w.id, e.target.value, w.refText)}
                placeholder="（未设置）"
                style={{ ...s.input, flex: 1, minWidth: 240 }}
              />
              <button
                onClick={() => saveRefText(w.id, getEditVal(w.id, w.refText), w.refText)}
                disabled={getEditVal(w.id, w.refText) === (w.refText ?? "")}
                style={getEditVal(w.id, w.refText) === (w.refText ?? "") ? s.saveBtnDisabled : s.saveBtn}
              >保存</button>
            </div>
            <div style={s.instructRow}>
              <span style={{ ...s.fileInput, color: "#5a5850", fontSize: 10, letterSpacing: 1 }}>instruct:</span>
              <input
                value={getInstructEditVal(w.id, w.instruct)}
                onChange={e => setInstructEdits({ ...instructEdits, [w.id]: e.target.value })}
                onBlur={e => saveInstruct(w.id, e.target.value, w.instruct)}
                placeholder="（未设置）"
                style={{ ...s.input, flex: 1, minWidth: 240 }}
              />
              <button
                onClick={() => saveInstruct(w.id, getInstructEditVal(w.id, w.instruct), w.instruct)}
                disabled={getInstructEditVal(w.id, w.instruct) === (w.instruct ?? "")}
                style={getInstructEditVal(w.id, w.instruct) === (w.instruct ?? "") ? s.saveBtnDisabled : s.saveBtn}
              >保存</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
