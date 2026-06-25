"use client";
import { useCallback, useEffect, useState } from "react";

interface Visitor {
  id: string;
  visitAt: string;
  ip: string;
  deviceType: string;
  deviceModel: string;
  deviceOs: string;
  deviceName: string;
  userName: string;
  isAdmin: boolean;
  path: string;
  userAgent: string;
}

interface PageResponse {
  visitors: Visitor[];
  total: number;
  page: number;
  pageSize: number;
}

interface OnlineStats {
  audioClients: number;
  messageClients: number;
  online: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
// Refresh the live online count every 5s. The /api/admin/visitors
// reload runs on its own cadence (page/filters change) and could be
// much slower, so a dedicated interval keeps the "当前在线" badge
// from feeling stale without coupling it to the table re-render.
const ONLINE_POLL_MS = 5000;

// Admin visitors log. Mirrors the /admin/messages layout (table +
// pagination + filters) so the two pages feel like siblings.
//
// Filters:
//   - isAdmin:  "all" | "admin" | "guest" — separates operator
//               traffic from public audience traffic, since they
//               have very different shapes
//   - pathPrefix: free text — e.g. "/" for the public homepage,
//                 "/admin" for any admin page. SQLite is fine with
//                 `LIKE 'prefix%'` for this
//   - q: free-text search across ip / model / os / browser / path
//
// Performance note: as the table grows, add an index on (path, visitAt)
// if a particular prefix scan gets slow. For now the existing
// (visitAt) and (ip) indexes cover the dominant queries.
export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [pathPrefix, setPathPrefix] = useState("");
  const [pathPrefixInput, setPathPrefixInput] = useState("");
  const [isAdmin, setIsAdmin] = useState<"all" | "admin" | "guest">("all");

  // Live online counts from the ws-server. `null` means "haven't
  // heard back yet" (initial load or transient failure) so the badge
  // shows a dash instead of a misleading 0.
  const [online, setOnline] = useState<OnlineStats | null>(null);

  const reload = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q) params.set("q", q);
    if (pathPrefix) params.set("pathPrefix", pathPrefix);
    if (isAdmin !== "all") params.set("isAdmin", isAdmin === "admin" ? "true" : "false");
    const data: PageResponse = await (await fetch(`/api/admin/visitors?${params.toString()}`)).json();
    setVisitors(data.visitors);
    setTotal(data.total);
    if (data.visitors.length === 0 && data.total > 0 && page > 1) {
      const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
      if (lastPage !== page) setPage(lastPage);
    }
  }, [page, pageSize, q, pathPrefix, isAdmin]);

  // Reload whenever the inputs change. The auto-recovery (setPage to
  // the last valid page when the current page goes empty) is the
  // "setState in effect" pattern the linter warns about, but it's
  // the right place for it — it's a side effect of a fetch whose
  // own setStates are async. Disabling the rule here is the lesser
  // evil vs. splitting the data flow across two effects and a ref.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  // Poll the ws-server for live client counts. Independent of the
  // table reload so the badge stays fresh even when the admin
  // isn't paging through rows. The interval is unref'd by clearing
  // it on unmount, so a route change can't leak timers.
  useEffect(() => {
    let cancelled = false;
    async function fetchOnline() {
      try {
        const res = await fetch("/api/admin/online");
        if (!res.ok) return;
        const data = (await res.json()) as OnlineStats;
        if (!cancelled) setOnline(data);
      } catch {
        // Network blip — keep the last known value, don't blank
        // the badge on a transient failure.
      }
    }
    fetchOnline();
    const id = setInterval(fetchOnline, ONLINE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function applyFilters() {
    setQ(qInput);
    setPathPrefix(pathPrefixInput);
    setPage(1);
  }
  function clearFilters() {
    setQInput("");
    setPathPrefixInput("");
    setIsAdmin("all");
    setQ("");
    setPathPrefix("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 text-[#f0ece4]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1>访问者记录</h1>
        <OnlineBadge stats={online} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-[#2a2a32] [background:linear-gradient(145deg,#1a1a20,#222228)] p-3">
        <div>
          <label className="mb-1 block text-xs text-[#9a958c]">搜索（IP / 设备 / 系统 / 浏览器 / 路径）</label>
          <input
            type="text"
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
            placeholder="例如 192.168、iPhone、Safari"
            className="w-64 rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-1 text-[#f0ece4]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#9a958c]">路径前缀</label>
          <input
            type="text"
            value={pathPrefixInput}
            onChange={e => setPathPrefixInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
            placeholder="例如 /、/admin"
            className="w-40 rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-1 text-[#f0ece4]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#9a958c]">访问者类型</label>
          <select
            value={isAdmin}
            onChange={e => { setIsAdmin(e.target.value as "all" | "admin" | "guest"); setPage(1); }}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-1 text-[#f0ece4]"
          >
            <option value="all">全部</option>
            <option value="admin">仅管理员</option>
            <option value="guest">仅公开听众</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={applyFilters}
            className="rounded bg-[#e8a84c] px-3 py-1 text-[#0a0a0c] hover:bg-[#d49a3e]"
          >
            应用筛选
          </button>
          <button
            onClick={clearFilters}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-3 py-1 text-[#f0ece4] hover:border-[#e8a84c]"
          >
            清除
          </button>
        </div>

        <div className="ml-auto text-xs text-[#9a958c]">
          共 <span className="font-semibold text-[#e8a84c]">{total}</span> 条
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-[#2a2a32]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1a1a20] text-[#9a958c]">
            <tr>
              <th className="px-2 py-2">访问时间</th>
              <th className="px-2 py-2">IP</th>
              <th className="px-2 py-2">类型</th>
              <th className="px-2 py-2">设备型号</th>
              <th className="px-2 py-2">系统</th>
              <th className="px-2 py-2">浏览器</th>
              <th className="px-2 py-2">用户名字</th>
              <th className="px-2 py-2">路径</th>
              <th className="px-2 py-2">角色</th>
            </tr>
          </thead>
          <tbody>
            {visitors.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-[#5a5850]">
                  暂无记录
                </td>
              </tr>
            )}
            {visitors.map(v => (
              <tr
                key={v.id}
                className="border-t border-[#1a1a22] hover:bg-[#1a1a20]"
                title={v.userAgent}
              >
                <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                  {formatDateTime(v.visitAt)}
                </td>
                <td className="px-2 py-1.5 font-mono">{v.ip}</td>
                <td className="px-2 py-1.5">
                  <DeviceTypeBadge type={v.deviceType} />
                </td>
                <td className="px-2 py-1.5">{v.deviceModel}</td>
                <td className="px-2 py-1.5">{v.deviceOs}</td>
                <td className="px-2 py-1.5">{v.deviceName}</td>
                <td className="px-2 py-1.5 text-[#9a958c]">{v.userName}</td>
                <td className="px-2 py-1.5 font-mono text-[#9a958c]">{v.path}</td>
                <td className="px-2 py-1.5">
                  {v.isAdmin ? (
                    <span className="rounded border border-[rgba(232,168,76,0.4)] bg-[rgba(232,168,76,0.12)] px-1.5 py-0.5 text-[10px] tracking-wider text-[#e8a84c]">
                      管理员
                    </span>
                  ) : (
                    <span className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-1.5 py-0.5 text-[10px] tracking-wider text-[#5a5850]">
                      听众
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#9a958c]">
        <label>
          每页
          <select
            value={pageSize}
            onChange={e => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
            className="ml-1 rounded border border-[#2a2a32] bg-[#0a0a0c] px-1 py-0.5 text-[#f0ece4]"
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage(1)}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-0.5 disabled:opacity-40 hover:border-[#e8a84c]"
          >
            «
          </button>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-0.5 disabled:opacity-40 hover:border-[#e8a84c]"
          >
            ‹
          </button>
          <span className="px-2">
            第 <span className="text-[#e8a84c]">{page}</span> / {totalPages} 页
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-0.5 disabled:opacity-40 hover:border-[#e8a84c]"
          >
            ›
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            className="rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-0.5 disabled:opacity-40 hover:border-[#e8a84c]"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    mobile: { label: "手机", color: "border-[rgba(0,240,255,0.4)] bg-[rgba(0,240,255,0.12)] text-[#00f0ff]" },
    tablet: { label: "平板", color: "border-[rgba(255,0,170,0.4)] bg-[rgba(255,0,170,0.12)] text-[#ff00aa]" },
    desktop: { label: "桌面", color: "border-[#2a2a32] bg-[#0a0a0c] text-[#9a958c]" },
  };
  const cfg = map[type] ?? map.desktop;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] tracking-wider ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// "当前在线 N" badge. Sits next to the page title so it's the first
// thing an admin sees on this page. Shows a dash on initial load /
// transient failure rather than 0, so a startup blip doesn't look
// like "nobody's listening" at a glance. The pulsing dot borrows
// from the cyan accent used elsewhere on the dashboard.
function OnlineBadge({ stats }: { stats: OnlineStats | null }) {
  const count = stats?.online ?? null;
  const label = count === null ? "—" : String(count);
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-[#2a2a32] bg-[#0a0a0c] px-3 py-1.5 text-xs"
      title={
        stats
          ? `音频 ${stats.audioClients} · 消息 ${stats.messageClients}`
          : "正在获取在线人数…"
      }
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00f0ff] opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00f0ff]" />
      </span>
      <span className="text-[#9a958c]">当前在线</span>
      <span className="font-mono text-base font-semibold text-[#e8a84c]">{label}</span>
      {stats && (
        <span className="text-[10px] text-[#5a5850]">
          音频 {stats.audioClients} · 消息 {stats.messageClients}
        </span>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    // Local time, YYYY-MM-DD HH:mm:ss — admin viewing this wants to
    // see when things happened, not a relative time string.
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
