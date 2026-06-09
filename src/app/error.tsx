"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050509] p-4 text-[#e8e6e3]">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-bold text-[#ff4444]">
          Connection Lost
        </h2>
        <p className="mb-6 text-[#a09f9e]">Signal interference detected</p>
        <button
          onClick={() => unstable_retry()}
          className="rounded-lg border border-[#ff4444]/30 bg-[#ff4444]/10 px-6 py-2 text-[#ff4444] transition-colors hover:bg-[#ff4444]/20"
        >
          Reconnect
        </button>
      </div>
    </div>
  );
}
