import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const VALID_TYPES = ["thriving", "sensitive", "struggling", "distressed"];

const TYPE_CONTEXT: Record<string, string> = {
  thriving:
    "Thriving Gut (80–100): gut is functioning well; tone is congratulatory and optimization-focused. Low urgency.",
  sensitive:
    "Sensitive Gut (60–79): gut works well most of the time but specific triggers push it off balance. Moderate, encouraging urgency.",
  struggling:
    "Struggling Gut (40–59): symptoms are frequent enough to interfere with daily life; a structured plan is warranted. Elevated urgency without alarm.",
  distressed:
    "Distressed Gut (0–39): significant, frequent symptoms that deserve professional attention. Highest urgency, still warm and non-alarmist.",
};

// Simple in-memory rate limit: 10 requests/minute per IP.
// Per-instance on serverless, which is sufficient basic protection for the key.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  // Opportunistic cleanup
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    resultType?: string;
    score?: number;
    answers?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { resultType, score, answers } = body;
  if (
    !resultType ||
    !VALID_TYPES.includes(resultType) ||
    typeof score !== "number" ||
    score < 0 ||
    score > 100 ||
    !answers ||
    typeof answers !== "object"
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Sanitize the answer pattern: only q1–q10 keys, values truncated.
  const answerLines = Object.entries(answers)
    .filter(([k]) => /^q([1-9]|10)$/.test(k))
    .slice(0, 10)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
    .join("\n");

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: [
        "You write a short personalized gut-health summary for a free educational quiz by Whitness Nutrition, a registered dietitian practice.",
        "Respond with plain text only — no markdown, no headings, no lists.",
        "Write exactly 2–3 sentences, warm and specific.",
        "Reference 1–2 of the user's actual answers concretely (for example low plant variety, high stress, poor sleep, frequent bloating).",
        "Educational tone. Do not diagnose. Do not name any medical condition the user did not select themselves.",
        "Do not contradict the urgency level of the result type described below.",
        "No exclamation points. No health-outcome promises.",
        "",
        `Result type context: ${TYPE_CONTEXT[resultType]}`,
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Result type: ${resultType}\nScore: ${score}/100\n\nAnswer pattern:\n${answerLines}`,
        },
      ],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ summary: text });
  } catch (err) {
    console.error("summary: API error", err);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
