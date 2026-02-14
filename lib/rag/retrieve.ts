import { overthinkingSources } from "@/data/overthinking";

// ترجع أفضل 3 مصادر بناءً على Score بسيط (بدون Embeddings)
export function retrieveRelevantChunks(query: string, k: number = 3) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];

  // كلمات مفيدة فقط (نشيل كلمات عامة)
  const STOP = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","is","are","was","were",
    "i","im","i'm","me","my","you","your","we","they","it","this","that","as","at",
    "about","what","how","when","why","can","could","should","would","do","does","did",
  ]);

  const tokens = q
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && !STOP.has(t));

  // لو السؤال قصير وما فيه tokens كفاية، نستخدم query نفسه كـ token واحد
  const finalTokens = tokens.length ? tokens : [q];

  const scored = overthinkingSources
    .map((doc) => {
      const hay = `${doc.title}\n${doc.content}`.toLowerCase();

      // Score:
      // - تطابق في العنوان وزنه أعلى
      // - تكرار كلمات ضمن المحتوى
      // - Phrase match (الجملة كاملة) يعطي Boost
      let score = 0;

      const title = (doc.title || "").toLowerCase();

      for (const t of finalTokens) {
        const inTitle = title.includes(t);
        const count = hay.split(t).length - 1; // عدد مرات ظهور token
        if (inTitle) score += 6;
        score += Math.min(count, 6); // سقف عشان ما يطغى مصدر واحد
      }

      if (hay.includes(q) && q.length >= 8) score += 8;

      return { ...doc, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((d) => ({
      title: d.title,
      content: d.content,
      score: d.score,
    }));

  return scored;
}