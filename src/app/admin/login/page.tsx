"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setIsLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setIsLoading(false);
    if (res.ok) router.push("/admin");
    else setError("密码错误，请重试");
  }

  // Tailwind v4 migration: the 12 style={{}} props and the 15-line
  // <style> block (input:focus / ::placeholder / button:hover / :active)
  // are replaced with utility classes. Pseudo-class styles move to
  // Tailwind's state variants (focus: / placeholder: / hover: / active:).
  // The gold #e8a84c accent is an arbitrary value — admin doesn't share
  // the cyberpunk listener theme.

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0c] p-5">
      <div className="pointer-events-none absolute top-[15%] left-[10%] h-[min(350px,80vw)] w-[min(350px,80vw)] rounded-full bg-[#e8a84c] opacity-15 blur-[100px]" />
      <div className="pointer-events-none absolute right-[10%] bottom-[15%] h-[min(280px,60vw)] w-[min(280px,60vw)] rounded-full bg-[#c77b4a] opacity-15 blur-[100px]" />

      <div className="relative z-[1] w-full max-w-[380px] rounded-2xl border border-[#2a2a32] [background:linear-gradient(180deg,#12121a_0%,#0e0e14_100%)] p-10 px-8">
        <div className="mb-8 text-center font-display text-xs font-medium uppercase tracking-[4px] text-[#9a958c]">
          Radio AI — Admin
        </div>
        <h1 className="mb-1.5 text-center font-display text-[26px] font-bold tracking-[2px] text-[#f0ece4]">
          登录
        </h1>
        <p className="mb-8 text-center text-[13px] text-[#5a5850]">输入管理员密码以继续</p>

        {error && (
          <div className="mb-3.5 rounded-md border border-[rgba(212,92,92,0.3)] bg-[rgba(212,92,92,0.1)] px-3.5 py-2.5 text-center text-xs text-[#d45c5c]">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoFocus
            className="mb-3.5 w-full rounded-lg border border-[#2a2a32] bg-[#1a1a20] px-4 py-3.5 text-sm text-[#f0ece4] transition-all duration-200 placeholder:text-[#5a5850] focus:border-[#e8a84c] focus:shadow-[0_0_0_3px_rgba(232,168,76,0.1)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="mt-1.5 w-full cursor-pointer rounded-lg border-0 [background:linear-gradient(145deg,#e8a84c,#c77b4a)] px-4 py-3.5 font-display text-[13px] font-semibold tracking-[2px] text-[#0a0a0c] transition-all duration-200 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-[0_8px_24px_rgba(232,168,76,0.3)] active:not-disabled:translate-y-0 disabled:cursor-default disabled:opacity-70"
          >
            {isLoading ? "验证中..." : "进入后台"}
          </button>
        </form>

        <div className="mt-7 text-center text-[11px] tracking-[1px] text-[#5a5850]">Radio AI 管理系统</div>
      </div>
    </div>
  );
}
