import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server misconfigured: GROQ_API_KEY missing." },
        { status: 500 }
      );
    }

    const system = `
You are Abdulaziz's private chatbot specialized ONLY in Overthinking.

Rules:
- Reply in English only.
- If the user asks about anything outside Overthinking, say exactly:
"I’m Abdulaziz’s chatbot, specialized only in overthinking and how to reduce it."
- Give practical, step-by-step guidance.
- Be calm and logical. Be direct if the user is catastrophizing.
- Do not give medical diagnoses or dangerous medical advice.
`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(message ?? "") },
        ],
      }),
    });

    const json = await r.json();

    if (!r.ok) {
      console.log("GROQ ERROR:", r.status, json); // مهم جداً للتشخيص
      return NextResponse.json(
        { reply: `Model error (${r.status}). Check server logs.` },
        { status: 500 }
      );
    }

    const reply =
      json?.choices?.[0]?.message?.content?.trim() || "No response from model.";

    return NextResponse.json({ reply });
  } catch (e) {
    console.log("SERVER ERROR:", e);
    return NextResponse.json(
      { reply: "Server error. Check server logs." },
      { status: 500 }
    );
  }
}