"use client";
import { ReactNode } from "react";

// Tailwind v4 migration: the 12 style={{}} props are replaced with
// utility classes. The admin uses a gold (#e8a84c) accent — not part
// of the cyberpunk listener theme — so the colors are arbitrary values
// for now rather than @theme tokens.
export default function AdminLayout({ children }: { children: ReactNode }) {
  // Auth is enforced by src/proxy.ts: an unauthenticated request never
  // reaches the /admin tree at all (it gets redirected to /admin/login
  // server-side). A previous version of this file tried to double-check
  // via `document.cookie.includes("admin_session=")`, but the cookie is
  // httpOnly (see /api/admin/login) and is therefore invisible to
  // JavaScript — that check always fired and bounced the user straight
  // back to /admin/login. Just render.
  return (
    <div className="flex min-h-screen">
      <nav className="w-[200px] bg-[#1a1a20] p-5">
        <h3 className="mb-4 text-[#e8a84c]">管理后台</h3>
        <ul className="list-none p-0">
          <li><a href="/admin" className="block py-2 text-[#9a958c] no-underline">概览</a></li>
          <li><a href="/admin/topics" className="block py-2 text-[#9a958c] no-underline">主题</a></li>
          <li><a href="/admin/personas" className="block py-2 text-[#9a958c] no-underline">人设</a></li>
          <li><a href="/admin/workflows" className="block py-2 text-[#9a958c] no-underline">工作流</a></li>
          <li><a href="/admin/messages" className="block py-2 text-[#9a958c] no-underline">留言</a></li>
          <li><a href="/admin/news" className="block py-2 text-[#9a958c] no-underline">资讯</a></li>
          <li><a href="/admin/config" className="block py-2 text-[#9a958c] no-underline">配置</a></li>
        </ul>
      </nav>
      <main className="flex-1 p-5">{children}</main>
    </div>
  );
}
