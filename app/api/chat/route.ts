import { NextResponse } from "next/server";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";

type ClientMsg = { from: "user" | "bot"; text: string };

// ===================== Config =====================
const REFUSAL_TEXT =
  "I’m Abdulaziz’s chatbot, specialized only in overthinking and how to reduce it.";

const MAX_MESSAGES = 24;
const MEMORY_WINDOW = 12;
const MAX_USER_CHARS = 1400;
const MAX_TOTAL_CHARS = 14000;

const RAG_K = 3;
const MAX_CONTEXT_CHARS = 1400;

// Rate limit: tune these as you like
const RL_PER_MINUTE = 20; // 20 req / minute / IP
const RL_PER_DAY = 200;   // 200 req / day / IP

// ===================== Utils =====================
function norm(s: string) {
  return (s || "").trim().toLowerCase();
}
function safeTruncate(s: string, max: number) {
  if (!s) return "";
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max).trim() + "…";
}
function stripPromptInjection(s: string) {
  return (s || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\b(system|developer|assistant|user)\s*:/gi, "")
    .replace(/\b(ignore|disregard|override|follow these instructions)\b/gi, "")
    .trim();
}
function getIP(req: Request) {
  // Vercel usually provides x-forwarded-for
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// ===================== Upstash Rate Limit (REST, no deps) =====================
async function upstashCmd(path: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const r = await fetch(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

async function rateLimitOrThrow(ip: string) {
  // If Upstash not configured, we can't do true rate limiting
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  const minKey = `rl:m:${ip}`;
  const dayKey = `rl:d:${ip}`;

  // INCR minute + set EXPIRE when first hit
  const minIncr = await upstashCmd(`/incr/${encodeURIComponent(minKey)}`);
  const minVal = Number(minIncr?.result ?? 0);
  if (minVal === 1) await upstashCmd(`/expire/${encodeURIComponent(minKey)}/60`);

  const dayIncr = await upstashCmd(`/incr/${encodeURIComponent(dayKey)}`);
  const dayVal = Number(dayIncr?.result ?? 0);
  if (dayVal === 1) await upstashCmd(`/expire/${encodeURIComponent(dayKey)}/86400`);

  if (minVal > RL_PER_MINUTE || dayVal > RL_PER_DAY) {
    const retry = minVal > RL_PER_MINUTE ? "60 seconds" : "24 hours";
    throw new Error(`RATE_LIMIT:${retry}`);
  }
}

// ===================== Classification =====================

// Exact greetings only (fix "help/more/why" getting treated as greeting)
function isGreeting(msg: string) {
  const t = norm(msg).replace(/[!?.,:;'"`()$begin:math:display$$end:math:display${}<>]/g, "").trim();
  const greetings = new Set([
    "hi","hello","hey","hiya","yo",
    "good morning","good afternoon","good evening",
    "morning","evening"
  ]);
  return greetings.has(t);
}

function isLowSignal(msg: string) {
  const t = norm(msg).replace(/\s+/g, " ");
  const lows = new Set(["ok","okay","k","hmm","hm","yes","no","sure","idk"]);
  return lows.has(t);
}

function isFollowup(msg: string) {
  const t = norm(msg);
  const patterns = [
    /^more$/,
    /^continue$/,
    /^another$/,
    /^else$/,
    /^expand$/,
    /^go on$/,
    /^keep going$/,
    /^more solutions?$/,
    /^more ideas?$/,
    /^more steps?$/,
    /^more detail(s)?$/,
    /^more on step \d+$/,
    /^what else$/,
    /^any other( ideas| tips| ways)?$/,
    /give me more/i,
    /add more/i,
    /go deeper/i,
    /continue from/i,
  ];
  return patterns.some((p) => p instanceof RegExp && p.test(t));
}

function isCrisis(text: string) {
  const t = norm(text);
  const crisis = [
    "suicide",
    "kill myself",
    "end my life",
    "self harm",
    "self-harm",
    "i want to die",
  ];
  return crisis.some((k) => t.includes(k));
}

// Overthinking signals
const OVERTHINKING_HINTS = [
  "overthink","overthinking","rumination","ruminate","worry","worried","fear",
  "anxiety","anxious","spiral","loop","replay","replaying","intrusive","what if",
  "can't stop thinking","cant stop thinking","stuck in my head",
  "analysis paralysis","perfectionism","regret","uncertainty","obsess","obsessing"
];

function hasOverthinkingSignal(text: string) {
  const t = norm(text);
  return OVERTHINKING_HINTS.some((k) => t.includes(k));
}

function framedAsOverthinking(text: string) {
  const t = norm(text);
  return (
    t.includes("i'm overthinking") ||
    t.includes("im overthinking") ||
    t.includes("i am overthinking") ||
    t.includes("i keep overthinking") ||
    t.includes("i keep thinking about") ||
    t.includes("i can't stop thinking about") ||
    t.includes("i cant stop thinking about")
  );
}

// “External advice traps” even if framed (finance/medical/legal/etc.)
function forbiddenExternalAdvice(text: string) {
  const t = norm(text);
  const bad = [
    "which stock", "buy this stock", "crypto", "invest in",
    "diagnose", "prescribe", "medication", "dose",
    "legal advice", "lawsuit", "contract",
    "hack", "exploit", "steal",
  ];
  return bad.some((k) => t.includes(k));
}

// Detect if user is asking for info in another domain (how-to/definition) rather than coaching
function looksLikeNonCoachingInfoRequest(text: string) {
  const t = norm(text);
  const starters = ["what is", "define", "explain", "how to", "tutorial", "steps to build", "code for", "write code"];
  return starters.some((s) => t.startsWith(s)) || t.includes("write code") || t.includes("give me code");
}

function detectStyle(lastUser: string) {
  const t = norm(lastUser);
  if (t.includes("be direct") || t.includes("no bs") || t.includes("brutal")) return "HARD";
  if (t.includes("decide") || t.includes("choose") || t.includes("which one")) return "DECISION";
  if (t.includes("worst") || t.includes("ruined") || t.includes("disaster")) return "INTERRUPT";
  return "CALM";
}

// ===================== Main =====================
export async function POST(req: Request) {
  try {
    // Hard rate limit first
    const ip = getIP(req);
    try {
      await rateLimitOrThrow(ip);
    } catch (e: any) {
      if (String(e?.message || "").startsWith("RATE_LIMIT:")) {
        const retry = String(e.message).split(":")[1] || "a bit";
        return NextResponse.json(
          { reply: `Rate limit reached. Please try again in ${retry}.` },
          { status: 429 }
        );
      }
      // If Upstash errors, we continue (don’t break prod)
    }

    const { messages } = (await req.json()) as { messages?: ClientMsg[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ reply: "No messages provided." }, { status: 400 });
    }

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { reply: "Too many messages in one request. Please clear chat and try again." },
        { status: 413 }
      );
    }

    const totalChars = messages.reduce((sum, m) => sum + (m.text?.length || 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { reply: "Message payload too large. Please shorten your text and try again." },
        { status: 413 }
      );
    }

    const lastUser = messages.filter((m) => m.from === "user").pop()?.text?.trim() || "";

    if (!lastUser) {
      return NextResponse.json({ reply: "Hey. What are you overthinking about right now?" });
    }
    if (lastUser.length > MAX_USER_CHARS) {
      return NextResponse.json(
        { reply: `Your message is too long. Please keep it under ${MAX_USER_CHARS} characters.` },
        { status: 413 }
      );
    }

    // Greetings / low-signal guard
    if (isGreeting(lastUser)) {
      return NextResponse.json({
        reply: "Hey. What are you overthinking about right now? One sentence is enough.",
      });
    }
    if (isLowSignal(lastUser)) {
      return NextResponse.json({
        reply: "Got it. What’s the specific thought you keep looping on right now?",
      });
    }

    // Crisis
    if (isCrisis(lastUser)) {
      return NextResponse.json({
        reply:
          "I can’t help with self-harm. If you feel in immediate danger, call your local emergency number now or contact someone you trust nearby. If you tell me your country, I’ll help you find immediate support options.",
      });
    }

    const followup = isFollowup(lastUser);

    // Strict scope logic (hard)
    const inScope = hasOverthinkingSignal(lastUser) || framedAsOverthinking(lastUser);

    // Reject external advice even if framed
    if (forbiddenExternalAdvice(lastUser)) {
      return NextResponse.json({ reply: REFUSAL_TEXT });
    }

    // If it’s a non-coaching info request and NOT framed as overthinking => refuse
    if (looksLikeNonCoachingInfoRequest(lastUser) && !framedAsOverthinking(lastUser)) {
      return NextResponse.json({ reply: REFUSAL_TEXT });
    }

    // If no overthinking signals and not a follow-up => refuse
    if (!inScope && !followup) {
      return NextResponse.json({ reply: REFUSAL_TEXT });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server misconfigured: GROQ_API_KEY missing." },
        { status: 500 }
      );
    }

    const style = detectStyle(lastUser);
    const lastWindow = messages.slice(-MEMORY_WINDOW);

    // RAG query: if follow-up ("more"), use last meaningful user message
    const lastMeaningfulUser =
      followup
        ? messages
            .filter((m) => m.from === "user")
            .map((m) => m.text.trim())
            .reverse()
            .find((t) => t.length > 25 && !isFollowup(t)) || ""
        : lastUser;

    const ragQuery = lastMeaningfulUser || lastUser;
    const relevant = ragQuery ? retrieveRelevantChunks(ragQuery, RAG_K) : [];

    const contextRaw = relevant.length
      ? relevant
          .map((r) => {
            const cleanTitle = stripPromptInjection(String(r.title || ""));
            const cleanContent = stripPromptInjection(String(r.content || ""));
            return `Title: ${cleanTitle}\nNotes:\n${cleanContent}`;
          })
          .join("\n\n---\n\n")
      : "";

    const contextBlock = safeTruncate(contextRaw, MAX_CONTEXT_CHARS);

    const persona =
      style === "HARD"
        ? "You are sharp and direct. Cut excuses. Be respectful but blunt."
        : style === "DECISION"
        ? "You are a decision coach. Use structured decision frameworks and deadlines."
        : style === "INTERRUPT"
        ? "You interrupt catastrophic thinking firmly and return the user to facts and actions."
        : "You are calm, logical, and focused.";

    const structureCore = `
RESPONSE FORMAT (CORE):
1) One-sentence mirror: state the real worry clearly.
2) Name the pattern briefly (rumination / catastrophizing / analysis paralysis), not clinical.
3) Give 3–6 actionable steps (high signal, not generic).
4) End with ONE forward question.
`.trim();

    const structureFollowup = `
RESPONSE FORMAT (FOLLOW-UP):
- Do NOT repeat the mirror sentence.
- Do NOT repeat the pattern explanation unless the topic changed.
- Provide 4–6 NEW actions/techniques (not rewording).
- End with ONE forward question.
`.trim();

    const system = `
You are Abdulaziz’s private chatbot specialized ONLY in overthinking and how to reduce it.

SCOPE (non-negotiable):
- Only handle overthinking, rumination, anxiety loops, analysis paralysis, catastrophizing, perfectionism loops.
- If the user asks about anything outside overthinking and it is NOT framed as overthinking, reply exactly:
"${REFUSAL_TEXT}"

LANGUAGE:
- Reply in English only.

SAFETY:
- No medical diagnosis.
- No dangerous medical advice.

PERSONA:
${persona}

INTERNAL NOTES (use naturally if relevant; never mention sources/links/URLs):
${contextBlock || "No internal notes found."}

${followup ? structureFollowup : structureCore}

STYLE:
- No fluff.
- Use short paragraphs.
- Prefer concrete actions: timers, scripts, decision rules, tiny experiments.
`.trim();

    const groqMessages = [
      { role: "system", content: system },
      ...lastWindow.map((m) => ({
        role: m.from === "user" ? "user" : "assistant",
        content: m.text,
      })),
    ];

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 650,
        messages: groqMessages,
      }),
    });

    const json = await r.json();

    if (!r.ok) {
      console.log("GROQ ERROR:", r.status, json);
      return NextResponse.json(
        { reply: "Model error. Check server logs." },
        { status: 500 }
      );
    }

    const reply = json?.choices?.[0]?.message?.content?.trim() || "No response.";

    return NextResponse.json({ reply });
  } catch (e) {
    console.log("SERVER ERROR:", e);
    return NextResponse.json({ reply: "Server error." }, { status: 500 });
  }
}