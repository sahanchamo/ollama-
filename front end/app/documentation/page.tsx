"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// API reference details are intentionally not published in the web client.
// They belong in private deployment documentation, not in a route every
// browser can request before client-side authentication finishes.
export default function Documentation() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  return <main className="grid min-h-screen place-items-center bg-[#10131a] text-slate-400">Redirecting…</main>;
}
