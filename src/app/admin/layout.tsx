"use client";
import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  // Auth is enforced by src/proxy.ts: an unauthenticated request never
  // reaches the /admin tree at all (it gets redirected to /admin/login
  // server-side). A previous version of this file tried to double-check
  // via `document.cookie.includes("admin_session=")`, but the cookie is
  // httpOnly (see /api/admin/login) and is therefore invisible to
  // JavaScript — that check always fired and bounced the user straight
  // back to /admin/login. Just render.
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{ width: 200, background: "#1a1a20", padding: 20 }}>
        <h3 style={{ color: "#e8a84c", marginBottom: 16 }}>管理后台</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li><a href="/admin" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>概览</a></li>
          <li><a href="/admin/topics" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>主题</a></li>
          <li><a href="/admin/personas" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>人设</a></li>
          <li><a href="/admin/workflows" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>工作流</a></li>
          <li><a href="/admin/messages" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>留言</a></li>
          <li><a href="/admin/news" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>资讯</a></li>
          <li><a href="/admin/config" style={{ color: "#9a958c", textDecoration: "none", display: "block", padding: "8px 0" }}>配置</a></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 20 }}>{children}</main>
    </div>
  );
}