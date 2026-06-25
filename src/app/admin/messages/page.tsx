"use client";
import { useEffect, useRef, useState } from "react";

interface AdminMessage {
  id: string;
  content: string;
  authorName: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  aiReason: string | null;
  isVisible: boolean;
}

interface PageResponse {
  messages: AdminMessage[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function MessagesPage() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [maxVisible, setMaxVisible] = useState<number>(50);
  const [maxVisibleInput, setMaxVisibleInput] = useState<string>("50");
  const [frontendVisible, setFrontendVisible] = useState<boolean>(true);
  const savedFrontendVisibleRef = useRef<boolean>(true);
  const [scrollSpeed, setScrollSpeed] = useState<number>(80);
  const [scrollSpeedInput, setScrollSpeedInput] = useState<string>("80");
  const savedScrollSpeedRef = useRef<number>(80);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { reload(); }, [page, pageSize]);

  async function reload() {
    const data: PageResponse = await (await fetch(`/api/admin/messages?page=${page}&pageSize=${pageSize}`)).json();
    setMessages(data.messages);
    setTotal(data.total);
    // If the current page went out of range (e.g. last item on page deleted),
    // back up to the last valid page.
    if (data.messages.length === 0 && data.total > 0 && page > 1) {
      const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
      if (lastPage !== page) setPage(lastPage);
    }
  }
  async function loadConfig() {
    const cfg = await (await fetch("/api/admin/messages/config")).json();
    setMaxVisible(cfg.maxVisibleMessages);
    setMaxVisibleInput(String(cfg.maxVisibleMessages));
    setFrontendVisible(cfg.frontendVisible ?? true);
    savedFrontendVisibleRef.current = cfg.frontendVisible ?? true;
    if (typeof cfg.scrollSpeedSeconds === "number") {
      setScrollSpeed(cfg.scrollSpeedSeconds);
      setScrollSpeedInput(String(cfg.scrollSpeedSeconds));
      savedScrollSpeedRef.current = cfg.scrollSpeedSeconds;
    }
  }
  async function saveConfig() {
    const n = parseInt(maxVisibleInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      setConfigMsg("请输入 1-500 之间的整数");
      return;
    }
    const s = parseInt(scrollSpeedInput, 10);
    if (!Number.isFinite(s) || s < 5 || s > 600) {
      setConfigMsg("请输入 5-600 之间的整数（秒）");
      return;
    }
    setSavingConfig(true);
    setConfigMsg(null);
    const res = await fetch("/api/admin/messages/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxVisibleMessages: n, frontendVisible, scrollSpeedSeconds: s }),
    });
    const data = await res.json();
    setSavingConfig(false);
    if (res.ok) {
      setMaxVisible(data.maxVisibleMessages);
      setMaxVisibleInput(String(data.maxVisibleMessages));
      setFrontendVisible(data.frontendVisible);
      savedFrontendVisibleRef.current = data.frontendVisible;
      if (typeof data.scrollSpeedSeconds === "number") {
        setScrollSpeed(data.scrollSpeedSeconds);
        setScrollSpeedInput(String(data.scrollSpeedSeconds));
        savedScrollSpeedRef.current = data.scrollSpeedSeconds;
      }
      setConfigMsg("✓ 已保存");
      setTimeout(() => setConfigMsg(null), 2000);
    } else {
      setConfigMsg("✗ 保存失败");
    }
  }

  async function review(id: string, status: string) {
    await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", id, status }),
    });
    reload();
  }

  async function setVisible(id: string, visible: boolean) {
    await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setVisible", id, visible }),
    });
    reload();
  }

  async function deleteMessage(id: string) {
    await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setConfirmingDelete(null);
    reload();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Tailwind v4 migration: 38 style={{}} props with three repeating
  // {padding:6} on every table cell replaced with a shared cellClass.
  // Per-row conditional (isConfirming → bg-[#fff4e5]) and per-cell
  // conditional colors (status / visible / ai-reason) expressed inline.

  return (
    <div className="p-4">
      <h1>留言管理</h1>

      <div className="mb-4 rounded-md border border-[#2a2a32] [background:linear-gradient(145deg,#1a1a20,#222228)] p-3 text-[#f0ece4]">
        <div className="mb-2 font-semibold">前台可见留言配置</div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="max-visible">前台显示的最多留言数（1-500）：</label>
          <input
            id="max-visible"
            type="number"
            min={1}
            max={500}
            value={maxVisibleInput}
            onChange={e => setMaxVisibleInput(e.target.value)}
            className="w-20 rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-1 text-[#f0ece4]"
          />
          <label htmlFor="scroll-speed" className="ml-3">滚动速度（5-600 秒/屏）：</label>
          <input
            id="scroll-speed"
            type="number"
            min={5}
            max={600}
            value={scrollSpeedInput}
            onChange={e => setScrollSpeedInput(e.target.value)}
            className="w-20 rounded border border-[#2a2a32] bg-[#0a0a0c] px-2 py-1 text-[#f0ece4]"
          />
          <label htmlFor="frontend-visible" className="ml-3 inline-flex cursor-pointer items-center gap-1.5">
            <input
              id="frontend-visible"
              type="checkbox"
              checked={frontendVisible}
              onChange={e => setFrontendVisible(e.target.checked)}
            />
            留言框 / 留言板前端可见
          </label>
          <button
            onClick={saveConfig}
            disabled={
              savingConfig ||
              (parseInt(maxVisibleInput, 10) === maxVisible &&
                frontendVisible === savedFrontendVisibleRef.current &&
                parseInt(scrollSpeedInput, 10) === savedScrollSpeedRef.current)
            }
            className="cursor-pointer rounded border-0 px-3 py-1 text-xs text-[#0a0a0c] [background:linear-gradient(145deg,#e8a84c,#c77b4a)] disabled:cursor-default disabled:opacity-70"
          >
            {savingConfig ? "保存中…" : "保存"}
          </button>
          <span className="text-xs text-[#9a958c]">
            当前：{maxVisible} 条 · {scrollSpeed} 秒/屏 · {frontendVisible ? "已开启" : "已关闭"}
          </span>
          {configMsg && (
            <span className={configMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}>
              {configMsg}
            </span>
          )}
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-1.5">内容</th>
            <th className="p-1.5">作者</th>
            <th className="p-1.5">状态</th>
            <th className="p-1.5">显示</th>
            <th className="p-1.5">时间</th>
            <th className="p-1.5">AI 备注</th>
            <th className="p-1.5">操作</th>
          </tr>
        </thead>
        <tbody>
          {messages.map(m => {
            const isApproved = m.status === "approved";
            const isRejected = m.status === "rejected";
            const isConfirming = confirmingDelete === m.id;
            return (
              <tr key={m.id} className={isConfirming ? "bg-[#fff4e5]" : undefined}>
                <td className="p-1.5">{m.content}</td>
                <td className="p-1.5">{m.authorName}</td>
                <td className={`p-1.5 ${isApproved ? "text-green-600" : isRejected ? "text-red-600" : "text-orange-500"}`}>
                  {m.status}
                </td>
                <td className={`p-1.5 ${m.isVisible ? "text-[#444]" : "text-[#aaa]"}`}>
                  {m.isVisible ? "显示中" : "已隐藏"}
                </td>
                <td className="p-1.5 text-xs">{new Date(m.createdAt).toLocaleString()}</td>
                <td className={`p-1.5 text-xs ${m.aiReason ? "text-[#444]" : "text-[#bbb]"}`}>
                  {m.aiReason ?? "—"}
                </td>
                <td className="p-1.5 whitespace-nowrap">
                  {isConfirming ? (
                    <span className="font-semibold text-[#c00]">
                      确认删除?
                      <button
                        onClick={() => deleteMessage(m.id)}
                        className="ml-1.5 cursor-pointer border border-[#a00] bg-[#c00] px-2 py-0.5 text-white"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        className="ml-1 cursor-pointer px-2 py-0.5"
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => review(m.id, "approved")}
                        disabled={isApproved}
                        className="mr-1 disabled:text-[#aaa]"
                      >
                        通过
                      </button>
                      <button
                        onClick={() => review(m.id, "rejected")}
                        disabled={isRejected}
                        className={`mr-2 ${isRejected ? "text-[#aaa]" : "text-red-600"}`}
                      >
                        拒绝
                      </button>
                      <button
                        onClick={() => setVisible(m.id, !m.isVisible)}
                        className="mr-1"
                      >
                        {m.isVisible ? "隐藏" : "显示"}
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(m.id)}
                        className="text-[#c00]"
                      >
                        删除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {messages.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-[#999]">暂无留言</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-[#666]">
          共 <strong>{total}</strong> 条 · 第 <strong>{page}</strong> / {totalPages} 页
        </span>
        <button onClick={() => setPage(1)} disabled={page === 1} className="disabled:opacity-50">首页</button>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="disabled:opacity-50">上一页</button>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="disabled:opacity-50">下一页</button>
        <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="disabled:opacity-50">末页</button>
        <label className="ml-auto text-[#666]">
          每页
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="mx-1.5 px-1.5 py-0.5"
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          条
        </label>
      </div>
    </div>
  );
}
