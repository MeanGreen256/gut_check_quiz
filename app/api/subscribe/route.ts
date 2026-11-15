import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "../../../lib/rate-limit";

const limited = createRateLimiter(5);
const VALID_TYPES = ["thriving", "sensitive", "struggling", "distressed"];

export async function POST(req: NextRequest) {
  if (limited(req.headers)) return NextResponse.json({ ok: false, error: "rate_limited" }, {
    status: 429, headers: { "Retry-After": "60" },
  });
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object" || body.consent !== true ||
      typeof body.email !== "string" || body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
      typeof body.firstName !== "string" || body.firstName.length > 100 ||
      !VALID_TYPES.includes(body.resultType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;
  if (!apiKey || !formId) return NextResponse.json({ ok: false }, { status: 503 });

  // One deadline for the entire transaction, including tag pagination and bodies.
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(5000)]);
  const email = body.email.trim();
  async function kit(path: string, payload?: object) {
    const response = await fetch(`https://api.kit.com/v4${path}`, {
      method: payload ? "POST" : "GET", signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey! },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    // A conflict is not proof of acceptance. No automatic retries of partial writes.
    if (!response.ok) throw new Error("provider_rejected");
    return response;
  }
  try {
    // Resolve configuration before writing. Missing/malformed tags cannot succeed.
    let tagId: number | undefined;
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const response = await kit(`/tags${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`);
      const data = await response.json();
      if (!Array.isArray(data.tags)) throw new Error("invalid_tags");
      const tag = data.tags.find((tag: { name?: unknown; id?: unknown }) =>
        tag?.name === `gut-${body.resultType}` && typeof tag.id === "number" && Number.isSafeInteger(tag.id) && tag.id > 0);
      if (tag) { tagId = tag.id; break; }
      if (!data.pagination?.has_next_page) break;
      if (typeof data.pagination.end_cursor !== "string" || !data.pagination.end_cursor) throw new Error("invalid_cursor");
      cursor = data.pagination.end_cursor;
    }
    if (!tagId) throw new Error("missing_tag");
    await kit("/subscribers", { email_address: email, first_name: body.firstName.trim() || undefined });
    await kit(`/forms/${encodeURIComponent(formId!)}/subscribers`, { email_address: email });
    await kit(`/tags/${tagId}/subscribers`, { email_address: email });
    return NextResponse.json({ ok: true });
  } catch {
    // Do not log provider errors/bodies: they may contain email addresses or keys.
    return NextResponse.json({ ok: false, error: "unconfirmed" }, { status: signal.aborted ? 504 : 502 });
  }
}
