"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Theme {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  persona?: { name: string };
  workflow?: { name: string };
}

export default function AdminDashboard() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [stats, setStats] = useState({ messages: 0, personas: 0, workflows: 0, themes: 0 });

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(t => setTheme(t));
    Promise.all([
      fetch("/api/admin/messages").then(r => r.json()),
      fetch("/api/admin/personas").then(r => r.json()),
      fetch("/api/admin/workflows").then(r => r.json()),
      fetch("/api/admin/topics").then(r => r.json()),
    ]).then(([messages, personas, workflows, themes]) => {
      setStats({
        messages: Array.isArray(messages) ? messages.length : 0,
        personas: Array.isArray(personas) ? personas.length : 0,
        workflows: Array.isArray(workflows) ? workflows.length : 0,
        themes: Array.isArray(themes) ? themes.length : 0,
      });
    });
  }, []);

  // Tailwind v4 migration: the 30 style={{}} props + two <style> blocks
  // (one for the pulse keyframe + responsive grid, one for the
  // stagger-children fadeSlideUp animation) are replaced with utility
  // classes.
  //
  // Decisions:
  //   - Admin uses a gold (#e8a84c) accent, not the cyberpunk listener
  //     theme, so all gold colors are arbitrary values.
  //   - The stagger-children nth-child delay pattern is kept in a tiny
  //     <style> block — six sibling-position selectors are awkward to
  //     express as utility classes, and the original kept the same
  //     approach.
  //   - The dashboard's "pulse" keyframe is scoped to this component
  //     (not added to @theme) since it's only used by the live dot.
  //   - Responsive grid breakpoints (640/768/1024) → sm:/md:/lg:
  //     variants on the grid containers.

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f0ece4]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a1a22] px-5 py-4 md:px-8 md:py-5">
        <Link href="/admin" className="font-display text-base font-bold tracking-[2px] text-[#e8a84c] no-underline">
          RADIO AI
        </Link>
        <nav className="flex flex-wrap gap-1">
          <Link href="/admin" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            概览
          </Link>
          <Link href="/admin/topics" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            主题
          </Link>
          <Link href="/admin/personas" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            人设
          </Link>
          <Link href="/admin/workflows" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            工作流
          </Link>
          <Link href="/admin/messages" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            留言
          </Link>
          <Link href="/admin/config" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            配置
          </Link>
          <Link href="/admin/visitors" className="rounded px-3 py-1.5 text-xs text-[#9a958c] no-underline transition-all duration-200 hover:bg-[#1a1a20] hover:text-[#e8a84c]">
            访问者
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8 md:py-8">
        <h2 className="mb-4 font-display text-[11px] font-medium uppercase tracking-[3px] text-[#5a5850]">
          系统概览
        </h2>

        <div className="stagger-children mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="relative overflow-hidden rounded-[10px] border border-[#1a1a22] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-5">
            <div className="absolute top-0 right-0 h-[60px] w-[60px] rounded-[0_10px_0_50px] [background:linear-gradient(135deg,rgba(232,168,76,0.12)_0%,transparent_60%)]" />
            <div className="mb-1.5 font-display text-[36px] font-bold leading-none text-[#f0ece4]">
              {stats.messages}
            </div>
            <div className="text-xs text-[#5a5850]">总留言数</div>
          </div>
          <div className="relative overflow-hidden rounded-[10px] border border-[#1a1a22] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-5">
            <div className="absolute top-0 right-0 h-[60px] w-[60px] rounded-[0_10px_0_50px] [background:linear-gradient(135deg,rgba(232,168,76,0.12)_0%,transparent_60%)]" />
            <div className="mb-1.5 font-display text-[36px] font-bold leading-none text-[#f0ece4]">
              {stats.personas}
            </div>
            <div className="text-xs text-[#5a5850]">人设数量</div>
          </div>
          <div className="relative overflow-hidden rounded-[10px] border border-[#1a1a22] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-5">
            <div className="absolute top-0 right-0 h-[60px] w-[60px] rounded-[0_10px_0_50px] [background:linear-gradient(135deg,rgba(232,168,76,0.12)_0%,transparent_60%)]" />
            <div className="mb-1.5 font-display text-[36px] font-bold leading-none text-[#f0ece4]">
              {stats.workflows}
            </div>
            <div className="text-xs text-[#5a5850]">工作流</div>
          </div>
          <div className="relative overflow-hidden rounded-[10px] border border-[#1a1a22] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-5">
            <div className="absolute top-0 right-0 h-[60px] w-[60px] rounded-[0_10px_0_50px] [background:linear-gradient(135deg,rgba(232,168,76,0.12)_0%,transparent_60%)]" />
            <div className="mb-1.5 font-display text-[36px] font-bold leading-none text-[#f0ece4]">
              {stats.themes}
            </div>
            <div className="text-xs text-[#5a5850]">直播主题</div>
          </div>
        </div>

        <div className="mb-8 rounded-[10px] border border-[#1a1a22] [background:linear-gradient(145deg,#12121a,#0e0e14)] p-6">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded border border-[rgba(232,168,76,0.3)] bg-[rgba(232,168,76,0.1)] px-2.5 py-1">
            <span className="h-[5px] w-[5px] animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-[#e8a84c]" />
            <span className="font-display text-[9px] font-medium tracking-[2px] text-[#e8a84c]">
              当前直播
            </span>
          </div>
          {theme ? (
            <div>
              <h3 className="mb-1.5 font-display text-xl font-bold">{theme.name}</h3>
              <p className="mb-3 text-[13px] text-[#9a958c]">{theme.description || "无描述"}</p>
              <div className="flex flex-wrap gap-5 text-xs text-[#5a5850]">
                {theme.persona && <span>主持人：{theme.persona.name}</span>}
                {theme.workflow && <span>工作流：{theme.workflow.name}</span>}
              </div>
            </div>
          ) : (
            <div className="text-[#5a5850]">
              <p>当前无进行中的直播</p>
              <Link href="/admin/topics" className="mt-2 inline-block text-xs text-[#e8a84c]">
                前往主题管理启动直播 →
              </Link>
            </div>
          )}
        </div>

        <h2 className="mb-4 font-display text-[11px] font-medium uppercase tracking-[3px] text-[#5a5850]">
          快捷入口
        </h2>
        <div className="stagger-children grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/topics" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">直播主题</div>
              <div className="text-[11px] text-[#5a5850]">管理直播主题和人设</div>
            </div>
          </Link>

          <Link href="/admin/personas" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">主持人人设</div>
              <div className="text-[11px] text-[#5a5850]">创建和管理AI主持人</div>
            </div>
          </Link>

          <Link href="/admin/workflows" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6v6H9z" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">ComfyUI 工作流</div>
              <div className="text-[11px] text-[#5a5850]">管理工作流配置</div>
            </div>
          </Link>

          <Link href="/admin/messages" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">留言审核</div>
              <div className="text-[11px] text-[#5a5850]">审核听众留言</div>
            </div>
          </Link>

          <Link href="/admin/config" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">系统配置</div>
              <div className="text-[11px] text-[#5a5850]">LLM 和 ComfyUI 设置</div>
            </div>
          </Link>

          <Link href="/listen" target="_blank" className="flex items-center gap-3.5 rounded-lg border border-[#1a1a22] bg-[#12121a] p-4 text-inherit no-underline transition-all duration-200 hover:bg-[#1a1a20]">
            <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg [background:linear-gradient(145deg,#1a1a20,#222228)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <div>
              <div className="mb-0.5 font-display text-sm font-medium text-[#f0ece4]">前往直播间</div>
              <div className="text-[11px] text-[#5a5850]">查看公开直播页面</div>
            </div>
          </Link>
        </div>
      </main>

      <style>{`
        /* Stagger entrance animation. Tailwind doesn't have a clean
           utility for nth-child animation-delay across 6 children, so
           the small block stays. The fadeSlideUp keyframe is local —
           not the @theme fade-slide-up one — because the original CSS
           used this exact name and the behavior is identical. */
        .stagger-children > * {
          opacity: 0;
          animation: fadeSlideUp 0.5s ease-out forwards;
        }
        .stagger-children > *:nth-child(1) { animation-delay: 0.05s; }
        .stagger-children > *:nth-child(2) { animation-delay: 0.1s; }
        .stagger-children > *:nth-child(3) { animation-delay: 0.15s; }
        .stagger-children > *:nth-child(4) { animation-delay: 0.2s; }
        .stagger-children > *:nth-child(5) { animation-delay: 0.25s; }
        .stagger-children > *:nth-child(6) { animation-delay: 0.3s; }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
