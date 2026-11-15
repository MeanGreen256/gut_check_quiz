import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createRateLimiter } from "../../../lib/rate-limit";

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

const rateLimited = createRateLimiter(10);

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  if (rateLimited(req.headers)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
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

  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { resultType, score, answers } = body;
  if (
    !resultType ||
    !VALID_TYPES.includes(resultType) ||
    typeof score !== "number" ||
    score < 0 ||
    score > 100 ||
    !answers ||
    typeof answers !== "object" || Array.isArray(answers)
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
    const anthropic = new Anthropic({ apiKey, timeout: 4500, maxRetries: 0 });
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
    }, { signal: AbortSignal.any([req.signal, AbortSignal.timeout(4500)]) });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ summary: text });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
