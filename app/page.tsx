"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Msg = { from: "user" | "bot"; text: string };

const QUICK_PROMPTS = [
  "I keep overthinking before I sleep. Give me a 3-step plan for tonight.",
  "I replay conversations in my head. How do I stop the loop?",
  "I’m stuck between two decisions and can’t choose. Help me decide logically.",
  "I fear the worst outcome even with no evidence. What should I do?",
];

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const WELCOME: Msg = {
    from: "bot",
    text:
      "Hi. I’m Abdulaziz’s Overthinking Assistant.\n\nTell me what you’re overthinking about, and I’ll help you organize it into clear steps.",
  };

  // Welcome message
  useEffect(() => {
    if (messages.length === 0) setMessages([WELCOME]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto scroll
  useEffect(() => {
    boxRef.current?.scrollTo({
      top: boxRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;

    // ✅ المهم: نبني الرسائل الجديدة مرة وحدة ونستخدمها للواجهة + للـ API
    const nextMessages: Msg[] = [...messages, { from: "user", text: clean }];

    setInput("");
    setLoading(true);
    setMessages(nextMessages);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            from: "bot",
            text: data.error || data.reply || `Server error (${res.status}).`,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { from: "bot", text: data.reply ?? "No reply." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: "Server error. Check server logs." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const clearChat = () => {
    setMessages([WELCOME]);
    setInput("");
  };

  return (
    <main className="min-h-screen text-zinc-100">
      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-zinc-950" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(800px_circle_at_20%_10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(900px_circle_at_80%_30%,rgba(168,85,247,0.16),transparent_60%),radial-gradient(900px_circle_at_50%_85%,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
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

              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200/90">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live demo
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={clearChat}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200/90 hover:bg-white/10 transition"
            >
              Clear chat
            </button>
          </div>
        </div>

        {/* Quick prompts */}
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              disabled={loading}
              className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm text-zinc-200/90 transition disabled:opacity-60"
              title="Send prompt"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chat card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="text-sm text-zinc-200/90">
              Context memory: last 12 messages
            </div>
            <div className="text-xs text-zinc-300/70">
              English only • Overthinking only
            </div>
          </div>

          <div
            ref={boxRef}
            className="h-[520px] overflow-y-auto px-4 md:px-6 py-5 space-y-3"
          >
            {messages.map((m, i) => {
              const isUser = m.from === "user";
              return (
                <div
                  key={i}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
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
              <div className="text-zinc-300/70 text-sm">Bot is typing…</div>
            )}
          </div>

          <div className="p-4 md:p-5 border-t border-white/10">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                className="flex-1 resize-none rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 outline-none placeholder:text-zinc-400/70 focus:border-white/20"
                placeholder="Type what you’re overthinking about… (Enter to send, Shift+Enter for new line)"
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="rounded-2xl px-5 py-3 border border-white/10 bg-white/10 hover:bg-white/15 disabled:opacity-60 transition"
              >
                Send
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-300/60 flex items-center justify-between">
              <span>
                Tip: Start with “I keep thinking about…” then paste the situation.
              </span>
              <button
                onClick={clearChat}
                className="md:hidden underline text-zinc-200/80 hover:text-zinc-100"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-zinc-300/50">
          Demo build • Next.js + Groq • Private assistant for Abdulaziz
        </div>
      </div>
    </main>
  );
}