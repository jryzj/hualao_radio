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

  const s: Record<string, React.CSSProperties> = {
    container: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a0c",
      position: "relative",
      overflow: "hidden",
      padding: "20px",
    },
    bgOrb: {
      position: "absolute",
      borderRadius: "50%",
      filter: "blur(100px)",
      opacity: 0.15,
      pointerEvents: "none",
    },
    card: {
      width: "100%",
      maxWidth: 380,
      padding: "40px 32px",
      background: "linear-gradient(180deg, #12121a 0%, #0e0e14 100%)",
      border: "1px solid #2a2a32",
      borderRadius: 16,
      position: "relative",
      zIndex: 1,
    },
    logo: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: 4,
      color: "#9a958c",
      textAlign: "center",
      marginBottom: 32,
      textTransform: "uppercase",
    },
    title: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 26,
      fontWeight: 700,
      color: "#f0ece4",
      textAlign: "center",
      marginBottom: 6,
      letterSpacing: 2,
    },
    subtitle: {
      fontSize: 13,
      color: "#5a5850",
      textAlign: "center",
      marginBottom: 32,
    },
    input: {
      width: "100%",
      padding: "14px 16px",
      background: "#1a1a20",
      border: "1px solid #2a2a32",
      borderRadius: 8,
      color: "#f0ece4",
      fontSize: 14,
      marginBottom: 14,
      transition: "all 0.2s",
    },
    button: {
      width: "100%",
      padding: "14px",
      background: "linear-gradient(145deg, #e8a84c, #c77b4a)",
      border: "none",
      borderRadius: 8,
      color: "#0a0a0c",
      fontFamily: "'Oswald', sans-serif",
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 2,
      cursor: "pointer",
      transition: "all 0.2s",
      marginTop: 6,
    },
    error: {
      padding: "10px 14px",
      background: "rgba(212, 92, 92, 0.1)",
      border: "1px solid rgba(212, 92, 92, 0.3)",
      borderRadius: 6,
      color: "#d45c5c",
      fontSize: 12,
      textAlign: "center",
      marginBottom: 14,
    },
    footer: {
      marginTop: 28,
      textAlign: "center",
      fontSize: 11,
      color: "#5a5850",
      letterSpacing: 1,
    },
  };

  return (
    <div style={s.container}>
      <div style={{
        ...s.bgOrb, width: "min(350px, 80vw)", height: "min(350px, 80vw)",
        background: "#e8a84c", top: "15%", left: "10%"
      }} />
      <div style={{
        ...s.bgOrb, width: "min(280px, 60vw)", height: "min(280px, 60vw)",
        background: "#c77b4a", bottom: "15%", right: "10%"
      }} />

      <div style={s.card}>
        <div style={s.logo}>Radio AI — Admin</div>
        <h1 style={s.title}>登录</h1>
        <p style={s.subtitle}>输入管理员密码以继续</p>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={s.input}
            autoFocus
          />
          <button
            type="submit"
            style={{
              ...s.button,
              opacity: isLoading ? 0.7 : 1,
            }}
            disabled={isLoading}
          >
            {isLoading ? "验证中..." : "进入后台"}
          </button>
        </form>

        <div style={s.footer}>Radio AI 管理系统</div>
      </div>

      <style>{`
        input:focus {
          border-color: #e8a84c !important;
          box-shadow: 0 0 0 3px rgba(232, 168, 76, 0.1);
        }
        input::placeholder {
          color: #5a5850;
        }
        button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(232, 168, 76, 0.3);
        }
        button:active:not(:disabled) {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}