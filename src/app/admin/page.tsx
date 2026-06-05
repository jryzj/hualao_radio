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

  const s: Record<string, React.CSSProperties> = {
    container: { minHeight: "100vh", background: "#0a0a0c", color: "#f0ece4" },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 20px", borderBottom: "1px solid #1a1a22",
      flexWrap: "wrap", gap: 12,
    },
    logo: {
      fontFamily: "'Oswald', sans-serif", fontSize: 16, fontWeight: 700,
      letterSpacing: 2, color: "#e8a84c", textDecoration: "none",
    },
    nav: {
      display: "flex", gap: 4, flexWrap: "wrap",
    },
    navLink: {
      padding: "6px 12px", fontSize: 12, color: "#9a958c",
      borderRadius: 4, transition: "all 0.2s", textDecoration: "none",
    },
    main: {
      padding: "24px 20px", maxWidth: 1400, margin: "0 auto",
    },
    sectionTitle: {
      fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 500,
      letterSpacing: 3, color: "#5a5850", marginBottom: 16,
      textTransform: "uppercase",
    },
    statGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 12,
      marginBottom: 32,
    },
    statCard: {
      background: "linear-gradient(145deg, #12121a, #0e0e14)",
      border: "1px solid #1a1a22",
      borderRadius: 10,
      padding: 20,
      position: "relative",
      overflow: "hidden",
    },
    statValue: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 36, fontWeight: 700, color: "#f0ece4", lineHeight: 1, marginBottom: 6,
    },
    statLabel: { fontSize: 12, color: "#5a5850" },
    statAccent: {
      position: "absolute", top: 0, right: 0,
      width: 60, height: 60,
      background: "linear-gradient(135deg, rgba(232,168,76,0.12) 0%, transparent 60%)",
      borderRadius: "0 10px 0 50px",
    },
    liveSection: {
      background: "linear-gradient(145deg, #12121a, #0e0e14)",
      border: "1px solid #1a1a22",
      borderRadius: 10,
      padding: 24,
      marginBottom: 32,
    },
    liveBadge: {
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px",
      background: "rgba(232, 168, 76, 0.1)",
      border: "1px solid rgba(232, 168, 76, 0.3)",
      borderRadius: 4, marginBottom: 16,
    },
    liveDot: {
      width: 5, height: 5, borderRadius: "50%",
      background: "#e8a84c",
      animation: "pulse 1.5s ease-in-out infinite",
    },
    liveLabel: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 9, fontWeight: 500, letterSpacing: 2, color: "#e8a84c",
    },
    quickLinks: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 12,
    },
    quickLink: {
      display: "flex", alignItems: "center", gap: 14,
      padding: 16, background: "#12121a",
      border: "1px solid #1a1a22",
      borderRadius: 8,
      transition: "all 0.2s",
      textDecoration: "none", color: "inherit",
    },
    quickLinkIcon: {
      width: 38, height: 38, borderRadius: 8,
      background: "linear-gradient(145deg, #1a1a20, #222228)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    },
    quickLinkTitle: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 14, fontWeight: 500, color: "#f0ece4", marginBottom: 3,
    },
    quickLinkDesc: { fontSize: 11, color: "#5a5850" },
  };

  return (
    <div style={s.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        a:hover {
          background: #1a1a20;
          color: #e8a84c !important;
        }
        @media (min-width: 640px) {
          .stat-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (min-width: 768px) {
          .quick-links {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .header {
            padding: 20px 32px !important;
          }
          .main {
            padding: 32px !important;
          }
        }
        @media (min-width: 1024px) {
          .quick-links {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
      `}</style>

      <header style={s.header}>
        <Link href="/admin" style={s.logo}>RADIO AI</Link>
        <nav style={s.nav}>
          <Link href="/admin" style={s.navLink}>概览</Link>
          <Link href="/admin/topics" style={s.navLink}>主题</Link>
          <Link href="/admin/personas" style={s.navLink}>人设</Link>
          <Link href="/admin/workflows" style={s.navLink}>工作流</Link>
          <Link href="/admin/messages" style={s.navLink}>留言</Link>
          <Link href="/admin/config" style={s.navLink}>配置</Link>
        </nav>
      </header>

      <main style={s.main}>
        <h2 style={s.sectionTitle}>系统概览</h2>

        <div style={s.statGrid} className="stat-grid stagger-children">
          <div style={s.statCard}>
            <div style={s.statAccent} />
            <div style={s.statValue}>{stats.messages}</div>
            <div style={s.statLabel}>总留言数</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statAccent} />
            <div style={s.statValue}>{stats.personas}</div>
            <div style={s.statLabel}>人设数量</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statAccent} />
            <div style={s.statValue}>{stats.workflows}</div>
            <div style={s.statLabel}>工作流</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statAccent} />
            <div style={s.statValue}>{stats.themes}</div>
            <div style={s.statLabel}>直播主题</div>
          </div>
        </div>

        <div style={s.liveSection}>
          <div style={s.liveBadge}>
            <div style={s.liveDot} />
            <span style={s.liveLabel}>当前直播</span>
          </div>
          {theme ? (
            <div>
              <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                {theme.name}
              </h3>
              <p style={{ color: "#9a958c", marginBottom: 12, fontSize: 13 }}>{theme.description || "无描述"}</p>
              <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#5a5850", flexWrap: "wrap" }}>
                {theme.persona && <span>主持人：{theme.persona.name}</span>}
                {theme.workflow && <span>工作流：{theme.workflow.name}</span>}
              </div>
            </div>
          ) : (
            <div style={{ color: "#5a5850" }}>
              <p>当前无进行中的直播</p>
              <Link href="/admin/topics" style={{ color: "#e8a84c", fontSize: 12, marginTop: 8, display: "inline-block" }}>
                前往主题管理启动直播 →
              </Link>
            </div>
          )}
        </div>

        <h2 style={{ ...s.sectionTitle, marginBottom: 16 }}>快捷入口</h2>
        <div style={s.quickLinks} className="quick-links stagger-children">
          <Link href="/admin/topics" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>直播主题</div>
              <div style={s.quickLinkDesc}>管理直播主题和人设</div>
            </div>
          </Link>

          <Link href="/admin/personas" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>主持人人设</div>
              <div style={s.quickLinkDesc}>创建和管理AI主持人</div>
            </div>
          </Link>

          <Link href="/admin/workflows" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6v6H9z" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>ComfyUI 工作流</div>
              <div style={s.quickLinkDesc}>管理工作流配置</div>
            </div>
          </Link>

          <Link href="/admin/messages" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>留言审核</div>
              <div style={s.quickLinkDesc}>审核听众留言</div>
            </div>
          </Link>

          <Link href="/admin/config" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>系统配置</div>
              <div style={s.quickLinkDesc}>LLM 和 ComfyUI 设置</div>
            </div>
          </Link>

          <Link href="/listen" target="_blank" style={s.quickLink}>
            <div style={s.quickLinkIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <div>
              <div style={s.quickLinkTitle}>前往直播间</div>
              <div style={s.quickLinkDesc}>查看公开直播页面</div>
            </div>
          </Link>
        </div>
      </main>

      <style>{`
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