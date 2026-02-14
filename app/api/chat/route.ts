import { NextResponse } from "next/server";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";

type ClientMsg = { from: "user" | "bot"; text: string };

// -------------------- Helpers --------------------

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

function tokenize(s: string) {
  return norm(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string, b: string) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// -------------------- Intent --------------------

function classifyIntent(messages: ClientMsg[], lastUser: string) {
  const convo = norm(messages.map((m) => m.text).join(" "));
  const lu = norm(lastUser);

  const crisis = ["suicide", "kill myself", "end my life", "self harm"];
  if (crisis.some((k) => convo.includes(k))) return "CRISIS";

  const overthinking = [
    "overthinking",
    "rumination",
    "worry",
    "fear",
    "anxiety",
    "stuck",
    "replay",
    "loop",
    "catastroph",
    "what if",
    "can't stop thinking",
  ];

  const hasOverthinking = overthinking.some(
    (k) => convo.includes(k) || lu.includes(k)
  );

  const followup = ["more", "else", "another", "continue"];
  const isFollowUp =
    lu.length < 40 &&
    followup.some((k) => lu === k || lu.includes(k));

  if (!hasOverthinking && !isFollowUp) return "OUT";
  if (isFollowUp) return "FOLLOWUP";
  return "CORE";
}

// -------------------- Style --------------------

function detectStyle(lastUser: string) {
  const lu = norm(lastUser);

  if (lu.includes("be direct") || lu.includes("no bs"))
    return "HARD";

  if (lu.includes("decide") || lu.includes("choose"))
    return "DECISION";

  if (lu.includes("worst") || lu.includes("ruined"))
    return "INTERRUPT";

  return "CALM";
}

// -------------------- Main --------------------

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages?: ClientMsg[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ reply: "No messages provided." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server misconfigured: GROQ_API_KEY missing." },
        { status: 500 }
      );
    }

    const lastUser =
      messages.filter((m) => m.from === "user").pop()?.text || "";

    const intent = classifyIntent(messages, lastUser);

    if (intent === "CRISIS") {
      return NextResponse.json({
        reply:
          "If you feel unsafe, contact emergency services immediately or a trusted person near you. If you want, tell me your country and I’ll help you find immediate support options.",
      });
    }

    if (intent === "OUT") {
      return NextResponse.json({
        reply:
          "I’m Abdulaziz’s chatbot, specialized only in overthinking and how to reduce it.",
      });
    }

    const style = detectStyle(lastUser);

    const last = messages.slice(-12);

    const relevant = retrieveRelevantChunks(lastUser, 4);
    const contextBlock = relevant.length
      ? relevant.map((r) => `${r.title}:\n${r.content}`).join("\n\n---\n\n")
      : "";

    const previousBotReplies = messages
      .filter((m) => m.from === "bot")
      .slice(-2)
      .map((m) => m.text);

    const repetitionFlag =
      previousBotReplies.length === 2 &&
      jaccard(previousBotReplies[0], previousBotReplies[1]) > 0.6;

    const persona =
      style === "HARD"
        ? "You are sharp and direct. Cut excuses."
        : style === "DECISION"
        ? "You are a decision coach. Use structured decision frameworks."
        : style === "INTERRUPT"
        ? "You interrupt catastrophic thinking firmly."
        : "You are calm and logical.";

    const antiRepeat = repetitionFlag
      ? "Your last replies were too similar. You MUST use different techniques and structure."
      : "Avoid repeating the same technique. If user asks for more, give new strategies.";

    const system = `
You are Abdulaziz’s advanced overthinking coach.

SCOPE:
Only handle overthinking, rumination, anxiety loops, analysis paralysis.

${persona}

INTERNAL NOTES:
${contextBlock}

${antiRepeat}

STRUCTURE YOUR RESPONSE:
1. Mirror the real fear in one sentence.
2. Identify the cognitive pattern.
3. Give 3–6 actionable steps.
4. If follow-up, deepen — do not repeat.
5. End with ONE forward question.

No fluff. No medical diagnosis.
`.trim();

    const groqMessages = [
      { role: "system", content: system },
      ...last.map((m) => ({
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
      return NextResponse.json(
        { reply: "Model error. Check server logs." },
        { status: 500 }
      );
    }

    const reply =
      json?.choices?.[0]?.message?.content?.trim() || "No response.";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { reply: "Server error." },
      { status: 500 }
    );
  }
}