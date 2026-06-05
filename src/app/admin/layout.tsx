"use client";
import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(pathname === "/admin/login");

  useEffect(() => {
    if (pathname === "/admin/login") {
      setAuthed(true);
      return;
    }
    // The server-side proxy has already verified the signed cookie
    // and redirected us here if it was missing. We just kick the user
    // back to login if, for any reason, the cookie is gone.
    const hasCookie = document.cookie.includes("admin_session=");
    if (!hasCookie) {
      router.push("/admin/login");
      return;
    }
    setAuthed(true);
  }, [pathname, router]);

  if (!authed) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0c" }}>
        <div style={{ color: "#5a5850", fontSize: 12 }}>加载中...</div>
      </div>
    );
  }

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