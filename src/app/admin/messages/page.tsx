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

  return (
    <div style={{ padding: 16 }}>
      <h1>留言管理</h1>

      <div
        style={{
          marginBottom: 16,
          padding: 12,
          border: "1px solid #2a2a32",
          borderRadius: 6,
          background: "linear-gradient(145deg, #1a1a20, #222228)",
          color: "#f0ece4",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>前台可见留言配置</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label htmlFor="max-visible">前台显示的最多留言数（1-500）：</label>
          <input
            id="max-visible"
            type="number"
            min={1}
            max={500}
            value={maxVisibleInput}
            onChange={e => setMaxVisibleInput(e.target.value)}
            style={{
              width: 80,
              padding: "4px 8px",
              background: "#0a0a0c",
              border: "1px solid #2a2a32",
              borderRadius: 4,
              color: "#f0ece4",
            }}
          />
          <label htmlFor="scroll-speed" style={{ marginLeft: 12 }}>
            滚动速度（5-600 秒/屏）：
          </label>
          <input
            id="scroll-speed"
            type="number"
            min={5}
            max={600}
            value={scrollSpeedInput}
            onChange={e => setScrollSpeedInput(e.target.value)}
            style={{
              width: 80,
              padding: "4px 8px",
              background: "#0a0a0c",
              border: "1px solid #2a2a32",
              borderRadius: 4,
              color: "#f0ece4",
            }}
          />
          <label
            htmlFor="frontend-visible"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, cursor: "pointer" }}
          >
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
            style={{
              padding: "4px 12px",
              background: "linear-gradient(145deg, #e8a84c, #c77b4a)",
              border: "none",
              borderRadius: 4,
              color: "#0a0a0c",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {savingConfig ? "保存中…" : "保存"}
          </button>
          <span style={{ color: "#9a958c", fontSize: 12 }}>
            当前：{maxVisible} 条 · {scrollSpeed} 秒/屏 · {frontendVisible ? "已开启" : "已关闭"}
          </span>
          {configMsg && <span style={{ color: configMsg.startsWith("✓") ? "green" : "red" }}>{configMsg}</span>}
        </div>
      </div>

      <table border={1} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ padding: 6 }}>内容</th>
            <th style={{ padding: 6 }}>作者</th>
            <th style={{ padding: 6 }}>状态</th>
            <th style={{ padding: 6 }}>显示</th>
            <th style={{ padding: 6 }}>时间</th>
            <th style={{ padding: 6 }}>AI 备注</th>
            <th style={{ padding: 6 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {messages.map(m => {
            const isApproved = m.status === "approved";
            const isRejected = m.status === "rejected";
            const isConfirming = confirmingDelete === m.id;
            return (
              <tr key={m.id} style={isConfirming ? { background: "#fff4e5" } : undefined}>
                <td style={{ padding: 6 }}>{m.content}</td>
                <td style={{ padding: 6 }}>{m.authorName}</td>
                <td style={{ padding: 6, color: isApproved ? "green" : isRejected ? "red" : "orange" }}>
                  {m.status}
                </td>
                <td style={{ padding: 6, color: m.isVisible ? "#444" : "#aaa" }}>
                  {m.isVisible ? "显示中" : "已隐藏"}
                </td>
                <td style={{ padding: 6, fontSize: 12 }}>{new Date(m.createdAt).toLocaleString()}</td>
                <td style={{ padding: 6, fontSize: 12, color: m.aiReason ? "#444" : "#bbb" }}>
                  {m.aiReason ?? "—"}
                </td>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                  {isConfirming ? (
                    <span style={{ color: "#c00", fontWeight: 600 }}>
                      确认删除?
                      <button
                        onClick={() => deleteMessage(m.id)}
                        style={{
                          marginLeft: 6,
                          color: "white",
                          background: "#c00",
                          border: "1px solid #a00",
                          padding: "2px 8px",
                          cursor: "pointer",
                        }}
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        style={{
                          marginLeft: 4,
                          padding: "2px 8px",
                          cursor: "pointer",
                        }}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => review(m.id, "approved")}
                        disabled={isApproved}
                        style={{ marginRight: 4 }}
                      >
                        通过
                      </button>
                      <button
                        onClick={() => review(m.id, "rejected")}
                        disabled={isRejected}
                        style={{ marginRight: 8, color: isRejected ? "#aaa" : "red" }}
                      >
                        拒绝
                      </button>
                      <button
                        onClick={() => setVisible(m.id, !m.isVisible)}
                        style={{ marginRight: 4 }}
                      >
                        {m.isVisible ? "隐藏" : "显示"}
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(m.id)}
                        style={{ color: "#c00" }}
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
            <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "#999" }}>暂无留言</td></tr>
          )}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        <span style={{ color: "#666" }}>
          共 <strong>{total}</strong> 条 · 第 <strong>{page}</strong> / {totalPages} 页
        </span>
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
        >
          首页
        </button>
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          上一页
        </button>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          下一页
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page >= totalPages}
        >
          末页
        </button>
        <label style={{ marginLeft: "auto", color: "#666" }}>
          每页
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ margin: "0 6px", padding: "2px 6px" }}
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
