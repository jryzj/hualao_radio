"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            backgroundColor: "#050509",
            color: "#e8e6e3",
            padding: "1rem",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                marginBottom: "1rem",
                color: "#ff4444",
              }}
            >
              Connection Lost
            </h2>
            <p style={{ marginBottom: "1.5rem", color: "#a09f9e" }}>
              Signal interference detected
            </p>
            <button
              onClick={() => unstable_retry()}
              // minHeight: 44px — Apple HIG requires ≥ 44pt touch target
              // for primary actions on iOS/iPadOS; smaller buttons are
              // hard to hit on touch devices and Safari may auto-zoom
              // the page when double-tap-zooming near a tiny target.
              style={{
                minHeight: "44px",
                padding: "0.75rem 1.5rem",
                backgroundColor: "rgba(255,68,68,0.1)",
                border: "1px solid rgba(255,68,68,0.3)",
                borderRadius: "0.5rem",
                color: "#ff4444",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
                touchAction: "manipulation",
              }}
            >
              Reconnect
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
