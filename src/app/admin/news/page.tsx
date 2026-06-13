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
  newsPoolSize: number;
}

interface Stats {
  sourcesTotal: number;
  sourcesActive: number;
  sourcesDisabled: number;
  itemsTotal: number;
  lastFetchedAt: string | null;
}

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

  // Tailwind v4 migration: 44 style={{}} props + a 7-entry modalStyles
  // object replaced with shared local className strings. The S.input
  // (block w-full max-w-480 bg-deep border rounded) was used 15+ times
  // across form inputs, the modal password field, and Field/Stat
  // sub-components. Per-cell status colors composed inline.

  const inputClass = "mb-2 block w-full max-w-[480px] rounded border border-[#2a2a32] bg-[#0f0f14] px-2.5 py-2 text-[13px] text-[#e8e6e0]";
  const btnClass = "mr-2 cursor-pointer rounded border-0 bg-[#e8a84c] px-3.5 py-1.5 text-xs font-semibold text-[#0a0a0c]";
  const btnSecondaryClass = "mr-2 cursor-pointer rounded border-0 bg-[#2a2a32] px-3.5 py-1.5 text-xs text-[#e8e6e0]";
  const fieldLabelClass = "mb-1 block text-[11px] text-[#9a958c]";
  const statusActiveClass = "text-[#7ed87e]";
  const statusDisabledClass = "text-[#d87e7e]";
  const sectionClass = "mb-8";
  const h2Class = "mb-3 font-display text-base tracking-[1px] text-[#e8a84c]";

  return (
    <div>
      <h1 className="mb-5 font-display text-[22px] tracking-[1px]">资讯源管理</h1>

      <section className={sectionClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`${h2Class} mb-0`}>
            RSS 源列表
            <span className="ml-2 text-[11px] tracking-normal text-[#5a5850]">
              （共 {sources.length} 条）
            </span>
          </h2>
          <button
            className={btnSecondaryClass}
            onClick={() => setSourcesCollapsed((v) => !v)}
            title={sourcesCollapsed ? "展开" : "折叠"}
          >
            {sourcesCollapsed ? "▼ 展开" : "▲ 折叠"}
          </button>
        </div>
        <div className="mb-3">
          <label className={btnClass}>
            上传 OPML 文件
            <input type="file" accept=".opml,.xml" onChange={handleOpmlUpload} className="hidden" />
          </label>
          <button className={btnSecondaryClass} onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "刷新中..." : "立即刷新全部"}
          </button>
          {opmlError && <span className="ml-3 text-xs text-[#d87e7e]">{opmlError}</span>}
          {opmlInfo && <span className="ml-3 text-xs text-[#7ed87e]">{opmlInfo}</span>}
        </div>

        <form onSubmit={addManualUrl} className="mb-3 flex items-center gap-2">
          <input
            className={`${inputClass} mb-0 flex-[2]`}
            placeholder="Feed URL"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
          />
          <input
            className={`${inputClass} mb-0 flex-1`}
            placeholder="标题（可选）"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
          />
          <button type="submit" className={btnClass}>添加</button>
        </form>

        {sourcesCollapsed ? (
          <div className="rounded border border-dashed border-[#2a2a32] bg-[#0f0f14] p-4 text-center text-xs text-[#5a5850]">
            列表已折叠（{sources.length} 条）— 点击右上角按钮展开
          </div>
        ) : (
          <>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">URL / 标题</th>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">状态</th>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">失败次数</th>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">Items</th>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">最后抓取</th>
                  <th className="border-b border-[#2a2a32] px-2.5 py-2 text-left text-[#9a958c]">操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={6} className="border-b border-[#1a1a20] px-2.5 py-2 text-center text-[#5a5850]">
                      暂无源，请上传 OPML 或手动添加
                    </td>
                  </tr>
                )}
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-[#1a1a20] px-2.5 py-2 text-[#e8e6e0]">
                      <div>
                        <a
                          onClick={() => openItemsModal(s.id)}
                          className="cursor-pointer text-[#e8a84c] [text-decoration:underline_dotted]"
                          title="点击查看该源的 items 内容"
                        >
                          {s.title || s.text || "(无标题)"}
                        </a>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#5a5850]">{s.url}</div>
                    </td>
                    <td className={`border-b border-[#1a1a20] px-2.5 py-2 ${s.status === "active" ? statusActiveClass : statusDisabledClass}`}>
                      {s.status}
                    </td>
                    <td className="border-b border-[#1a1a20] px-2.5 py-2 text-[#e8e6e0]">{s.failCount}</td>
                    <td className="border-b border-[#1a1a20] px-2.5 py-2 text-[#e8e6e0]">{s._count?.items ?? 0}</td>
                    <td className="border-b border-[#1a1a20] px-2.5 py-2 text-[#e8e6e0]">{s.lastFetchedAt ? new Date(s.lastFetchedAt).toLocaleString() : "-"}</td>
                    <td className="border-b border-[#1a1a20] px-2.5 py-2 text-[#e8e6e0]">
                      <button className={btnSecondaryClass} onClick={() => toggleSource(s.id)}>
                        {s.status === "active" ? "禁用" : "启用"}
                      </button>
                      <button className={btnSecondaryClass} onClick={() => deleteSource(s.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sources.length > 10 && (
              <div className="mt-3 text-right">
                <button className={btnSecondaryClass} onClick={() => setSourcesCollapsed(true)}>
                  ▲ 折叠列表
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>系统配置</h2>
        {form ? (
          <form onSubmit={saveConfig}>
            <div className="mb-3 grid max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="决策 LLM 预取频率 (ms)" value={form.prefetchIntervalMs} onChange={(v) => setForm({ ...form, prefetchIntervalMs: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="RSS 抓取频率 (ms)" value={form.updateIntervalMs} onChange={(v) => setForm({ ...form, updateIntervalMs: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="资讯源有效窗口 (ms)" value={form.activeWindowMs} onChange={(v) => setForm({ ...form, activeWindowMs: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="Item 保留天数" value={form.retentionDays} onChange={(v) => setForm({ ...form, retentionDays: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="RSS 并发抓取数" value={form.maxConcurrentFetches} onChange={(v) => setForm({ ...form, maxConcurrentFetches: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="决策 LLM 模型名（空=回退主 LLM）" value={form.decisionModelName} onChange={(v) => setForm({ ...form, decisionModelName: v })} type="text" inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="资讯条数上限（{{news}} 最多渲染几条）" value={form.maxNewsItems} onChange={(v) => setForm({ ...form, maxNewsItems: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="资讯候选池大小（A 路径每次从最近 N 条里洗牌抽）" value={form.newsPoolSize} onChange={(v) => setForm({ ...form, newsPoolSize: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="单条字符上限（超出截断）" value={form.maxItemChars} onChange={(v) => setForm({ ...form, maxItemChars: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
              <Field label="总字符上限（整体截断）" value={form.maxTotalChars} onChange={(v) => setForm({ ...form, maxTotalChars: v })} inputClass={inputClass} fieldLabelClass={fieldLabelClass} />
            </div>
            <h3 className="mb-2 mt-5 text-[13px] text-[#9a958c]">Tavily 配置</h3>
            <div className="mb-2">
              <label className={fieldLabelClass}>API Key</label>
              <input
                type="password"
                value={form.tavilyApiKey}
                onChange={(e) => setForm({ ...form, tavilyApiKey: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="mb-3">
              <label className={fieldLabelClass}>时间范围</label>
              <select
                value={form.tavilyTimeRange}
                onChange={(e) => setForm({ ...form, tavilyTimeRange: e.target.value as NewsConfig["tavilyTimeRange"] })}
                className={inputClass}
              >
                <option value="d">最近 1 天 (d)</option>
                <option value="w">最近 1 周 (w)</option>
                <option value="m">最近 1 月 (m)</option>
                <option value="y">最近 1 年 (y)</option>
              </select>
            </div>
            <button type="submit" className={btnClass}>保存</button>
          </form>
        ) : (
          <div className="text-xs text-[#5a5850]">加载中...</div>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>实时统计</h2>
        {stats ? (
          <div className="grid max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-5">
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
          <div className="text-xs text-[#5a5850]">加载中...</div>
        )}
      </section>

      {itemsLoading && !itemsModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.7)] p-5">
          <div className="rounded-md border border-[#2a2a32] bg-[#1a1a20] p-8 text-center text-[#9a958c] shadow-[0_8px_40px_rgba(0,0,0,0.6)]">加载中...</div>
        </div>
      )}

      {itemsModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(0,0,0,0.7)] p-5" onClick={() => setItemsModal(null)}>
          <div className="flex w-full max-w-[900px] max-h-[85vh] flex-col rounded-md border border-[#2a2a32] bg-[#1a1a20] shadow-[0_8px_40px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-[#2a2a32] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm tracking-[1px] text-[#e8a84c]">
                  {itemsModal.source.title || "(无标题)"}
                </div>
                <div className="mt-1 text-[11px] text-[#5a5850] [word-break:break-all]">
                  {itemsModal.source.url}
                </div>
                <div className="mt-1 text-[11px] text-[#9a958c]">
                  状态: <span className={itemsModal.source.status === "active" ? statusActiveClass : statusDisabledClass}>
                    {itemsModal.source.status}
                  </span>
                  {" · "}共 {itemsModal.total} 条 items
                </div>
              </div>
              <button className={btnSecondaryClass} onClick={() => setItemsModal(null)}>
                关闭 ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pt-2 px-5 pb-4">
              {itemsModal.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#5a5850]">
                  暂无 items（可能从未抓取，或源已禁用）
                </div>
              ) : (
                <ul className="m-0 list-none p-0">
                  {itemsModal.items.map((it) => {
                    const expanded = expandedItemId === it.id;
                    return (
                      <li key={it.id} className="border-b border-[#1a1a20] py-2.5">
                        <div
                          className="flex cursor-pointer items-start gap-2"
                          onClick={() => setExpandedItemId(expanded ? null : it.id)}
                        >
                          <span className="mt-0.5 text-[11px] text-[#e8a84c]">
                            {expanded ? "▼" : "▶"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-[#e8e6e0]">{it.title || "(无标题)"}</div>
                            <div className="mt-0.5 text-[11px] text-[#5a5850]">
                              {it.publishedAt ? new Date(it.publishedAt).toLocaleString() : "(无发布时间)"}
                              {" · 抓取于 "}
                              {new Date(it.fetchedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {expanded && (
                          <div className="ml-5 mt-2 rounded border border-[#2a2a32] bg-[#0f0f14] p-3">
                            {it.description && (
                              <div className="mb-2 text-xs italic text-[#9a958c]">
                                {it.description}
                              </div>
                            )}
                            <pre className="m-0 max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-[1.5] text-[#e8e6e0]">{it.contentMd || "(无正文)"}</pre>
                            {it.link && (
                              <a
                                href={it.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-[11px] text-[#e8a84c]"
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

function Field({
  label,
  value,
  onChange,
  type = "number",
  inputClass,
  fieldLabelClass,
}: {
  label: string;
  value: string | number;
  onChange: (v: any) => void;
  type?: "number" | "text";
  inputClass: string;
  fieldLabelClass: string;
}) {
  return (
    <div>
      <label className={fieldLabelClass}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string | number; color?: string; small?: boolean }) {
  return (
    <div className="rounded border border-[#2a2a32] bg-[#0f0f14] p-3">
      <div className="mb-1.5 text-[11px] text-[#9a958c]">{label}</div>
      <div
        className="font-display"
        style={{ fontSize: small ? 12 : 22, color: color ?? "#e8a84c" }}
      >
        {value}
      </div>
    </div>
  );
}
