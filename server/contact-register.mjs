// Contract v1 shared with the Whitness hub contact register. No newsletter or health payloads.
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim(), at = email.lastIndexOf('@');
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (at < 1 || at !== email.indexOf('@') || email.length > 254 || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(domain)) return null;
  return `${local}@${domain.toLowerCase()}`;
}
export function readCaptureConfig(env = process.env) {
  if (env.CONTACT_CAPTURE_APPROVED !== 'true' || (env.VERCEL_ENV === 'preview' && env.CONTACT_CAPTURE_ISOLATED_PREVIEW !== 'true')) return null;
  try {
    const endpoint = new URL(env.CONTACT_REGISTER_URL), origin = new URL(env.CONTACT_CAPTURE_ORIGIN), privacy = new URL(env.CONTACT_CAPTURE_PRIVACY_URL);
    if ([endpoint, origin, privacy].some(u => u.protocol !== 'https:' || u.username || u.password) || endpoint.pathname !== '/api/contact-register/capture' || endpoint.search || endpoint.hash || origin.origin !== env.CONTACT_CAPTURE_ORIGIN || !/^[A-Za-z0-9._~-]{43,512}$/.test(env.CONTACT_REGISTER_TOKEN || '') || !/^[A-Za-z0-9._-]{1,80}$/.test(env.CONTACT_CAPTURE_NOTICE_VERSION || '') || !env.CONTACT_CAPTURE_DISCLOSURE?.trim() || env.CONTACT_CAPTURE_DISCLOSURE.length > 2000) return null;
    return { endpoint: endpoint.href, token: env.CONTACT_REGISTER_TOKEN, origin: origin.origin, noticeVersion: String(env.CONTACT_CAPTURE_NOTICE_VERSION), disclosure: env.CONTACT_CAPTURE_DISCLOSURE.trim(), privacyUrl: privacy.href };
  } catch { return null; }
}
export function publicCaptureConfig(env = process.env) {
  const c = readCaptureConfig(env);
  return c ? { noticeVersion: c.noticeVersion, disclosure: c.disclosure, privacyUrl: c.privacyUrl } : null;
}
export class CaptureError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function parseCapture(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.requestId !== 'string' || Object.keys(body).some(k => !['email', 'requestId', 'noticeVersion'].includes(k)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '')) throw new CaptureError(400, 'Enter a valid email address and retry the form.');
  const email = normalizeEmail(body.email);
  if (!email) throw new CaptureError(400, 'Enter a valid email address.');
  if (body.noticeVersion !== config.noticeVersion) throw new CaptureError(409, 'The email notice changed. Reload this page before continuing.');
  return { email, requestId: body.requestId.toLowerCase(), noticeVersion: config.noticeVersion };
}
export async function captureContact(config, input, fetcher = fetch) {
  try {
    const response = await fetcher(config.endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (response.status === 409) throw new CaptureError(409, 'The submission or email notice changed. Reload this page before continuing.');
    if (response.status === 429) throw new CaptureError(429, 'Too many submissions. Wait a minute and try again.');
    if (!response.ok || (await response.json()).captured !== true) throw new Error('Unconfirmed capture');
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError(503, 'We could not confirm your email was saved. Please try again.');
  }
}
// Quiz route. This limiter is per process; the central register also enforces its app cap.
export function createCaptureRoute({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const windows = new Map();
  return async request => {
    const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
    const config = readCaptureConfig(env);
    if (!config) return reply(503, { error: 'Email capture is not enabled. Reload to continue with the public tool.' });
    try {
      if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
      if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply(403, { error: 'Submit from this tool.' });
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'Send JSON.' });
      if (Number(request.headers.get('content-length')) > 2048) return reply(413, { error: 'Submission too large.' });
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: 'Invalid submission.' });
      let text = '', size = 0; const decoder = new TextDecoder();
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 2048) { await reader.cancel(); return reply(413, { error: 'Submission too large.' }); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
      finally { reader.releaseLock(); }
      let body; try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid submission.' }); }
      const input = parseCapture(body, config);
      // No raw IP or email stored in limiter keys, and no request body logging.
      const { createHash } = await import('node:crypto');
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
      const key = createHash('sha256').update(ip).digest('hex'), time = now();
      for (const [k, w] of windows) if (w.until <= time) windows.delete(k);
      const window = windows.get(key) || { until: time + 60000, count: 0 };
      if ((!windows.has(key) && windows.size >= 10000) || ++window.count > 10) return reply(429, { error: 'Too many attempts. Wait a minute and retry.' });
      windows.set(key, window);
      await captureContact(config, input, fetcher);
      return reply(200, { captured: true });
    } catch (error) { return reply(error instanceof CaptureError ? error.status : 503, { error: error instanceof CaptureError ? error.message : 'We could not confirm your email was saved. Please try again.' }); }
  };
}
