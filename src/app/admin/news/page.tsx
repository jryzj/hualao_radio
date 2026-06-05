"use client";
import { useEffect, useState } from "react";

interface RssSource {
  id: string;
  url: string;
  title: string;
  text: string;
  type: string;
  status: string;
  failCount: number;
  lastFetchedAt: string | null;
  createdAt: string;
  _count?: { items: number };
}

interface RssItemView {
  id: string;
  title: string;
  link: string;
  publishedAt: string | null;
  fetchedAt: string;
  description: string;
  contentMd: string;
}

interface ItemsModalData {
  source: { id: string; url: string; title: string; status: string };
  items: RssItemView[];
  total: number;
}

interface NewsConfig {
  prefetchIntervalMs: number;
  updateIntervalMs: number;
  activeWindowMs: number;
  retentionDays: number;
  maxConcurrentFetches: number;
  maxNewsItems: number;
  maxItemChars: number;
  maxTotalChars: number;
  tavilyApiKey: string;
  tavilyTimeRange: "d" | "w" | "m" | "y";
  decisionModelName: string;
}

interface Stats {
  sourcesTotal: number;
  sourcesActive: number;
  sourcesDisabled: number;
  itemsTotal: number;
  lastFetchedAt: string | null;
}

const S = {
  section: { marginBottom: 32 },
  h2: { fontFamily: "'Oswald', sans-serif", fontSize: 16, marginBottom: 12, letterSpacing: 1, color: "#e8a84c" },
  input: {
    display: "block",
    width: "100%",
    maxWidth: 480,
    padding: "8px 10px",
    background: "#0f0f14",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    color: "#e8e6e0",
    fontSize: 13,
    marginBottom: 8,
  } as React.CSSProperties,
  btn: {
    padding: "6px 14px",
    background: "#e8a84c",
    color: "#0a0a0c",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
    marginRight: 8,
  } as React.CSSProperties,
  btnSecondary: {
    padding: "6px 14px",
    background: "#2a2a32",
    color: "#e8e6e0",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    marginRight: 8,
  } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 } as React.CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #2a2a32", color: "#9a958c" } as React.CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid #1a1a20", color: "#e8e6e0" } as React.CSSProperties,
  statusActive: { color: "#7ed87e" },
  statusDisabled: { color: "#d87e7e" },
};

export default function NewsPage() {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [cfg, setCfg] = useState<NewsConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState<NewsConfig | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [opmlError, setOpmlError] = useState<string | null>(null);
  const [opmlInfo, setOpmlInfo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [itemsModal, setItemsModal] = useState<ItemsModalData | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  async function loadAll() {
    const [s, c, st] = await Promise.all([
      fetch("/api/admin/news/sources").then((r) => r.json()),
      fetch("/api/admin/news/config").then((r) => r.json()),
      fetch("/api/admin/news/stats").then((r) => r.json()),
    ]);
    setSources(s);
    setCfg(c);
    setForm(c);
    setStats(st);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleOpmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOpmlError(null);
    setOpmlInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/news/sources", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setOpmlError(data.message ?? data.error ?? "上传失败");
    } else {
      setOpmlInfo(`导入成功：新建 ${data.created}，更新 ${data.updated}，共 ${data.total} 条`);
      loadAll();
    }
    e.target.value = "";
  }

  async function addManualUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    const res = await fetch("/api/admin/news/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: manualUrl.trim(), title: manualTitle.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`添加失败：${data.message ?? data.error}`);
    } else {
      setManualUrl("");
      setManualTitle("");
      loadAll();
    }
  }

  async function toggleSource(id: string) {
    await fetch(`/api/admin/news/sources/${id}/toggle`, { method: "POST" });
    loadAll();
  }

  async function deleteSource(id: string) {
    if (!confirm("确定删除该源？所有相关 item 也会被级联删除。")) return;
    await fetch(`/api/admin/news/sources/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function openItemsModal(sourceId: string) {
    setItemsLoading(true);
    setExpandedItemId(null);
    try {
      const res = await fetch(`/api/admin/news/sources/${sourceId}/items?limit=100`);
      if (!res.ok) {
        alert("加载 items 失败");
        return;
      }
      const data = (await res.json()) as ItemsModalData;
      setItemsModal(data);
    } finally {
      setItemsLoading(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/news/refresh", { method: "POST" });
      const data = await res.json();
      alert(`刷新完成：成功 ${data.fetched}，失败 ${data.failed}，新增 ${data.items} 条`);
      loadAll();
    } finally {
      setRefreshing(false);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const res = await fetch("/api/admin/news/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      alert("保存成功");
      loadAll();
    } else {
      alert("保存失败");
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, marginBottom: 20, letterSpacing: 1 }}>
        资讯源管理
      </h1>

      <section style={S.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ ...S.h2, marginBottom: 0 }}>
            RSS 源列表
            <span style={{ color: "#5a5850", fontSize: 11, marginLeft: 8, letterSpacing: 0 }}>
              （共 {sources.length} 条）
            </span>
          </h2>
          <button
            style={S.btnSecondary}
            onClick={() => setSourcesCollapsed((v) => !v)}
            title={sourcesCollapsed ? "展开" : "折叠"}
          >
            {sourcesCollapsed ? "▼ 展开" : "▲ 折叠"}
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.btn as React.CSSProperties}>
            上传 OPML 文件
            <input type="file" accept=".opml,.xml" onChange={handleOpmlUpload} style={{ display: "none" }} />
          </label>
          <button style={S.btnSecondary} onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "刷新中..." : "立即刷新全部"}
          </button>
          {opmlError && <span style={{ color: "#d87e7e", marginLeft: 12, fontSize: 12 }}>{opmlError}</span>}
          {opmlInfo && <span style={{ color: "#7ed87e", marginLeft: 12, fontSize: 12 }}>{opmlInfo}</span>}
        </div>

        <form onSubmit={addManualUrl} style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <input
            placeholder="Feed URL"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            style={{ ...S.input, marginBottom: 0, flex: 2 }}
          />
          <input
            placeholder="标题（可选）"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            style={{ ...S.input, marginBottom: 0, flex: 1 }}
          />
          <button type="submit" style={S.btn}>
            添加
          </button>
        </form>

        {sourcesCollapsed ? (
          <div
            style={{
              padding: 16,
              background: "#0f0f14",
              border: "1px dashed #2a2a32",
              borderRadius: 4,
              textAlign: "center",
              color: "#5a5850",
              fontSize: 12,
            }}
          >
            列表已折叠（{sources.length} 条）— 点击右上角按钮展开
          </div>
        ) : (
          <>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>URL / 标题</th>
                  <th style={S.th}>状态</th>
                  <th style={S.th}>失败次数</th>
                  <th style={S.th}>Items</th>
                  <th style={S.th}>最后抓取</th>
                  <th style={S.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...S.td, color: "#5a5850", textAlign: "center" }}>
                      暂无源，请上传 OPML 或手动添加
                    </td>
                  </tr>
                )}
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td style={S.td}>
                      <div>
                        <a
                          onClick={() => openItemsModal(s.id)}
                          style={{
                            cursor: "pointer",
                            color: "#e8a84c",
                            textDecoration: "underline",
                            textDecorationStyle: "dotted",
                          }}
                          title="点击查看该源的 items 内容"
                        >
                          {s.title || s.text || "(无标题)"}
                        </a>
                      </div>
                      <div style={{ color: "#5a5850", fontSize: 11, marginTop: 2 }}>{s.url}</div>
                    </td>
                    <td style={{ ...S.td, ...(s.status === "active" ? S.statusActive : S.statusDisabled) }}>
                      {s.status}
                    </td>
                    <td style={S.td}>{s.failCount}</td>
                    <td style={S.td}>{s._count?.items ?? 0}</td>
                    <td style={S.td}>{s.lastFetchedAt ? new Date(s.lastFetchedAt).toLocaleString() : "-"}</td>
                    <td style={S.td}>
                      <button style={S.btnSecondary} onClick={() => toggleSource(s.id)}>
                        {s.status === "active" ? "禁用" : "启用"}
                      </button>
                      <button style={S.btnSecondary} onClick={() => deleteSource(s.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sources.length > 10 && (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button style={S.btnSecondary} onClick={() => setSourcesCollapsed(true)}>
                  ▲ 折叠列表
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section style={S.section}>
        <h2 style={S.h2}>系统配置</h2>
        {form ? (
          <form onSubmit={saveConfig}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 720 }}>
              <Field
                label="决策 LLM 预取频率 (ms)"
                value={form.prefetchIntervalMs}
                onChange={(v) => setForm({ ...form, prefetchIntervalMs: v })}
              />
              <Field
                label="RSS 抓取频率 (ms)"
                value={form.updateIntervalMs}
                onChange={(v) => setForm({ ...form, updateIntervalMs: v })}
              />
              <Field
                label="资讯源有效窗口 (ms)"
                value={form.activeWindowMs}
                onChange={(v) => setForm({ ...form, activeWindowMs: v })}
              />
              <Field
                label="Item 保留天数"
                value={form.retentionDays}
                onChange={(v) => setForm({ ...form, retentionDays: v })}
              />
              <Field
                label="RSS 并发抓取数"
                value={form.maxConcurrentFetches}
                onChange={(v) => setForm({ ...form, maxConcurrentFetches: v })}
              />
              <Field
                label="决策 LLM 模型名（空=回退主 LLM）"
                value={form.decisionModelName}
                onChange={(v) => setForm({ ...form, decisionModelName: v })}
                type="text"
              />
              <Field
                label="资讯条数上限（{{news}} 最多渲染几条）"
                value={form.maxNewsItems}
                onChange={(v) => setForm({ ...form, maxNewsItems: v })}
              />
              <Field
                label="单条字符上限（超出截断）"
                value={form.maxItemChars}
                onChange={(v) => setForm({ ...form, maxItemChars: v })}
              />
              <Field
                label="总字符上限（整体截断）"
                value={form.maxTotalChars}
                onChange={(v) => setForm({ ...form, maxTotalChars: v })}
              />
            </div>
            <h3 style={{ fontSize: 13, marginTop: 20, marginBottom: 8, color: "#9a958c" }}>Tavily 配置</h3>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9a958c", marginBottom: 4 }}>API Key</label>
              <input
                type="password"
                value={form.tavilyApiKey}
                onChange={(e) => setForm({ ...form, tavilyApiKey: e.target.value })}
                style={S.input}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9a958c", marginBottom: 4 }}>时间范围</label>
              <select
                value={form.tavilyTimeRange}
                onChange={(e) => setForm({ ...form, tavilyTimeRange: e.target.value as NewsConfig["tavilyTimeRange"] })}
                style={S.input}
              >
                <option value="d">最近 1 天 (d)</option>
                <option value="w">最近 1 周 (w)</option>
                <option value="m">最近 1 月 (m)</option>
                <option value="y">最近 1 年 (y)</option>
              </select>
            </div>
            <button type="submit" style={S.btn}>
              保存
            </button>
          </form>
        ) : (
          <div style={{ color: "#5a5850", fontSize: 12 }}>加载中...</div>
        )}
      </section>

      <section style={S.section}>
        <h2 style={S.h2}>实时统计</h2>
        {stats ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, maxWidth: 720 }}>
            <Stat label="总源数" value={stats.sourcesTotal} />
            <Stat label="Active" value={stats.sourcesActive} color="#7ed87e" />
            <Stat label="Disabled" value={stats.sourcesDisabled} color="#d87e7e" />
            <Stat label="Items" value={stats.itemsTotal} />
            <Stat
              label="最后抓取"
              value={stats.lastFetchedAt ? new Date(stats.lastFetchedAt).toLocaleString() : "-"}
              small
            />
          </div>
        ) : (
          <div style={{ color: "#5a5850", fontSize: 12 }}>加载中...</div>
        )}
      </section>

      {itemsLoading && !itemsModal && (
        <div style={modalStyles.backdrop}>
          <div style={{ ...modalStyles.box, padding: 32, textAlign: "center", color: "#9a958c" }}>加载中...</div>
        </div>
      )}

      {itemsModal && (
        <div style={modalStyles.backdrop} onClick={() => setItemsModal(null)}>
          <div style={modalStyles.box} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "#e8a84c", fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
                  {itemsModal.source.title || "(无标题)"}
                </div>
                <div style={{ fontSize: 11, color: "#5a5850", marginTop: 4, wordBreak: "break-all" }}>
                  {itemsModal.source.url}
                </div>
                <div style={{ fontSize: 11, color: "#9a958c", marginTop: 4 }}>
                  状态: <span style={itemsModal.source.status === "active" ? S.statusActive : S.statusDisabled}>
                    {itemsModal.source.status}
                  </span>
                  {" · "}共 {itemsModal.total} 条 items
                </div>
              </div>
              <button style={S.btnSecondary} onClick={() => setItemsModal(null)}>
                关闭 ✕
              </button>
            </div>

            <div style={modalStyles.body}>
              {itemsModal.items.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#5a5850", fontSize: 12 }}>
                  暂无 items（可能从未抓取，或源已禁用）
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {itemsModal.items.map((it) => {
                    const expanded = expandedItemId === it.id;
                    return (
                      <li key={it.id} style={modalStyles.item}>
                        <div
                          style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
                          onClick={() => setExpandedItemId(expanded ? null : it.id)}
                        >
                          <span style={{ color: "#e8a84c", fontSize: 11, marginTop: 2 }}>
                            {expanded ? "▼" : "▶"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "#e8e6e0" }}>{it.title || "(无标题)"}</div>
                            <div style={{ fontSize: 11, color: "#5a5850", marginTop: 2 }}>
                              {it.publishedAt ? new Date(it.publishedAt).toLocaleString() : "(无发布时间)"}
                              {" · 抓取于 "}
                              {new Date(it.fetchedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {expanded && (
                          <div style={modalStyles.itemBody}>
                            {it.description && (
                              <div style={{ fontSize: 12, color: "#9a958c", marginBottom: 8, fontStyle: "italic" }}>
                                {it.description}
                              </div>
                            )}
                            <pre style={modalStyles.contentPre}>{it.contentMd || "(无正文)"}</pre>
                            {it.link && (
                              <a
                                href={it.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 11, color: "#e8a84c", marginTop: 8, display: "inline-block" }}
                              >
                                打开原文 ↗
                              </a>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  } as React.CSSProperties,
  box: {
    background: "#1a1a20",
    border: "1px solid #2a2a32",
    borderRadius: 6,
    width: "100%",
    maxWidth: 900,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid #2a2a32",
  } as React.CSSProperties,
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 20px 16px 20px",
  } as React.CSSProperties,
  item: {
    padding: "10px 0",
    borderBottom: "1px solid #1a1a20",
  } as React.CSSProperties,
  itemBody: {
    marginTop: 8,
    marginLeft: 20,
    padding: 12,
    background: "#0f0f14",
    borderRadius: 4,
    border: "1px solid #2a2a32",
  } as React.CSSProperties,
  contentPre: {
    fontSize: 12,
    color: "#e8e6e0",
    fontFamily: "'Consolas', 'Monaco', monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    margin: 0,
    maxHeight: 320,
    overflowY: "auto" as const,
    lineHeight: 1.5,
  } as React.CSSProperties,
};

function Field({
  label,
  value,
  onChange,
  type = "number",
}: {
  label: string;
  value: string | number;
  onChange: (v: any) => void;
  type?: "number" | "text";
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "#9a958c", marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        style={S.input}
      />
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string | number; color?: string; small?: boolean }) {
  return (
    <div style={{ padding: 12, background: "#0f0f14", border: "1px solid #2a2a32", borderRadius: 4 }}>
      <div style={{ fontSize: 11, color: "#9a958c", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: small ? 12 : 22, color: color ?? "#e8a84c", fontFamily: "'Oswald', sans-serif" }}>
        {value}
      </div>
    </div>
  );
}
