"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Msg = { from: "user" | "bot"; text: string };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // ✅ أول رسالة ترحيب (شكل احترافي للعرض)
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          from: "bot",
          text:
            "Hi. I’m Abdulaziz’s Overthinking Assistant.\n\nTell me what you’re overthinking about, and I’ll help you organize it into clear steps.",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto scroll
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { from: "user", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { from: "bot", text: data.error || `Server error (${res.status}).` },
        ]);
      } else {
        setMessages((prev) => [...prev, { from: "bot", text: data.reply ?? "No reply." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { from: "bot", text: "Server error. Check server logs." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen text-zinc-100">
      {/* خلفية جامدة */}
      <div className="fixed inset-0 -z-10 bg-zinc-950" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(800px_circle_at_20%_10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(900px_circle_at_80%_30%,rgba(168,85,247,0.16),transparent_60%),radial-gradient(900px_circle_at_50%_85%,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {/* ✅ تكبير اللوغو: غير h/w هنا */}
            <div className="h-20 w-20 md:h-30 md:w-30 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <Image
                src="/logo.jpeg"
                alt="Logo"
                width={120}
                height={120}
                className="h-full w-full object-cover"
                priority
              />
            </div>

            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Overthinking Bot
              </h1>
              <p className="text-sm md:text-base text-zinc-300/80">
                Abdulaziz’s private assistant — specialized in overthinking only
              </p>

              {/* Badge صغيرة احترافية */}
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200/90">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live demo
              </div>
            </div>
          </div>

          {/* زر صغير للعرض */}
          <div className="hidden md:flex items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200/90">
              Ask in English ✅
            </div>
          </div>
        </div>

        {/* Chat card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="text-sm text-zinc-200/90">
              Focus: Overthinking → clarity → steps
            </div>
            <div className="text-xs text-zinc-300/70">
              If asked outside scope → “I only handle overthinking.”
            </div>
          </div>

          {/* Messages */}
          <div
            ref={boxRef}
            className="h-[520px] overflow-y-auto px-4 md:px-6 py-5 space-y-3"
          >
            {messages.map((m, i) => {
              const isUser = m.from === "user";
              return (
                <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={[
                      "max-w-[88%] rounded-2xl px-4 py-3 border text-sm leading-relaxed",
                      isUser
                        ? "bg-zinc-950/60 border-white/10"
                        : "bg-white/10 border-white/10",
                    ].join(" ")}
                  >
                    <div className="text-[11px] text-zinc-300/70 mb-1">
                      {isUser ? "You" : "Bot"}
                    </div>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="text-zinc-300/70 text-sm">
                Bot is typing…
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 md:p-5 border-t border-white/10">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                className="flex-1 rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 outline-none placeholder:text-zinc-400/70 focus:border-white/20"
                placeholder="Type what you’re overthinking about…"
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="rounded-2xl px-5 py-3 border border-white/10 bg-white/10 hover:bg-white/15 disabled:opacity-60 transition"
              >
                Send
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-300/60">
              Tip: Start with “I keep thinking about…” then paste the situation.
            </div>
          </div>
        </div>

        {/* Footer صغير */}
        <div className="mt-6 text-xs text-zinc-300/50">
          Demo build • Next.js + Groq • Private assistant for Abdulaziz
        </div>
      </div>
    </main>
  );
}