import { NextRequest, NextResponse } from "next/server";

const KIT_BASE = "https://api.kit.com/v4";

const VALID_TYPES = ["thriving", "sensitive", "struggling", "distressed"];

// Tag names must already exist in Kit (created by the owner).
function tagNameFor(resultType: string): string {
  return `gut-${resultType}`;
}

// Module-scope cache of tag name -> id (persists per serverless instance)
let tagCache: Record<string, number> | null = null;

async function kitFetch(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${KIT_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  });
}

async function getTagId(
  apiKey: string,
  tagName: string
): Promise<number | null> {
  if (tagCache && tagName in tagCache) return tagCache[tagName];

  const cache: Record<string, number> = {};
  let cursor: string | null = null;
  // Paginate defensively (accounts rarely have >few pages of tags)
  for (let i = 0; i < 10; i++) {
    const qs = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
    const res = await kitFetch(`/tags${qs}`, apiKey);
    if (!res.ok) return null;
    const data = await res.json();
    for (const tag of data.tags ?? []) {
      cache[tag.name] = tag.id;
    }
    if (data.pagination?.has_next_page && data.pagination?.end_cursor) {
      cursor = data.pagination.end_cursor;
    } else {
      break;
    }
  }
  tagCache = cache;
  return cache[tagName] ?? null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;

  if (!apiKey || !formId) {
    console.error("subscribe: missing CONVERTKIT env vars");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let body: { firstName?: string; email?: string; resultType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const firstName = (body.firstName ?? "").trim().slice(0, 100);
  const email = (body.email ?? "").trim().slice(0, 254);
  const resultType = (body.resultType ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!VALID_TYPES.includes(resultType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    // 1. Create (or upsert) the subscriber
    const createRes = await kitFetch("/subscribers", apiKey, {
      method: "POST",
      body: JSON.stringify({
        email_address: email,
        first_name: firstName || undefined,
      }),
    });
    if (!createRes.ok && createRes.status !== 409) {
      console.error("subscribe: create subscriber failed", createRes.status);
    }

    // 2. Add to the form
    const formRes = await kitFetch(`/forms/${formId}/subscribers`, apiKey, {
      method: "POST",
      body: JSON.stringify({ email_address: email }),
    });
    if (!formRes.ok) {
      console.error("subscribe: add to form failed", formRes.status);
    }

    // 3. Apply the result-type tag
    const tagId = await getTagId(apiKey, tagNameFor(resultType));
    if (tagId) {
      const tagRes = await kitFetch(`/tags/${tagId}/subscribers`, apiKey, {
        method: "POST",
        body: JSON.stringify({ email_address: email }),
      });
      if (!tagRes.ok) {
        console.error("subscribe: tag apply failed", tagRes.status);
      }
    } else {
      console.error(
        `subscribe: tag "${tagNameFor(resultType)}" not found in Kit`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never surface errors to the client — results render regardless
    console.error("subscribe: unexpected error", err);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
