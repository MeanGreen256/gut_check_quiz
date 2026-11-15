import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const create = vi.hoisted(() => vi.fn());
const ctor = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  constructor(options: unknown) { ctor(options); }
  messages = { create };
} }));
const payload = { firstName: "Test", email: "test@example.invalid", resultType: "thriving", consent: true };
const req = (body: unknown) => new NextRequest("https://example.invalid/api", { method: "POST", body: JSON.stringify(body) });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("CONVERTKIT_API_KEY", "mock-only"); vi.stubEnv("CONVERTKIT_FORM_ID", "123");
  vi.stubEnv("ANTHROPIC_API_KEY", "mock-only");
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tags = { tags: [{ name: "gut-thriving", id: 1 }] };
describe("subscribe", () => {
  it.each([null, {}, { ...payload, consent: false }, { ...payload, email: 1 }, { ...payload, resultType: "bad" }])("rejects invalid input without provider calls: %j", async body => {
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(body))).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when unconfigured", async () => {
    vi.stubEnv("CONVERTKIT_API_KEY", "");
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(payload))).status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("confirms only after tag lookup and all three writes succeed", async () => {
    fetchMock.mockResolvedValueOnce(json(tags)).mockImplementation(() => Promise.resolve(json({})));
    const { POST } = await import("../app/api/subscribe/route");
    expect(await (await POST(req(payload))).json()).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      "https://api.kit.com/v4/tags", "https://api.kit.com/v4/subscribers",
      "https://api.kit.com/v4/forms/123/subscribers", "https://api.kit.com/v4/tags/1/subscribers",
    ]);
    expect(fetchMock.mock.calls.every(call => call[1].signal instanceof AbortSignal)).toBe(true);
  });
  it.each([0, 1, 2, 3])("stops on rejected step %i", async step => {
    let index = 0;
    fetchMock.mockImplementation(() => Promise.resolve(index++ === step ? json({}, 500) : json(tags)));
    const { POST } = await import("../app/api/subscribe/route");
    const response = await POST(req(payload));
    expect(response.status).toBe(502); expect((await response.json()).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(step + 1);
  });
  it("does not interpret a conflict as success", async () => {
    fetchMock.mockResolvedValueOnce(json(tags)).mockResolvedValueOnce(json({}, 409));
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(payload))).status).toBe(502); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([{ tags: [] }, {}, { tags: [{ name: "gut-thriving", id: "bad" }] }])("rejects missing or malformed tags before writes", async tags => {
    fetchMock.mockResolvedValue(json(tags));
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(payload))).status).toBe(502); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("paginates tags", async () => {
    fetchMock.mockResolvedValueOnce(json({ tags: [], pagination: { has_next_page: true, end_cursor: "a b" } }))
      .mockResolvedValueOnce(json(tags)).mockImplementation(() => Promise.resolve(json({})));
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(payload))).status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toContain("after=a%20b");
  });
  it("aborts a stalled provider within the total deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    fetchMock.mockImplementation((_url, init) => { init.signal.throwIfAborted(); });
    const { POST } = await import("../app/api/subscribe/route");
    expect((await POST(req(payload))).status).toBe(504); expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });
  it("limits submissions before contacting Kit", async () => {
    fetchMock.mockResolvedValue(json({ tags: [] }));
    const { POST } = await import("../app/api/subscribe/route");
    for (let i = 0; i < 5; i++) await POST(req(payload));
    const response = await POST(req(payload));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
describe("summary", () => {
  const body = { resultType: "thriving", score: 90, answers: { q1: "test" } };
  it.each([null, {}, { ...body, answers: [] }])("rejects invalid input", async body => {
    const { POST } = await import("../app/api/summary/route");
    expect((await POST(req(body))).status).toBe(400); expect(create).not.toHaveBeenCalled();
  });
  it("sets timeout, disables retries, and passes cancellation", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "Mock summary" }] });
    const { POST } = await import("../app/api/summary/route");
    expect(await (await POST(req(body))).json()).toEqual({ summary: "Mock summary" });
    expect(ctor).toHaveBeenCalledWith({ apiKey: "mock-only", timeout: 4500, maxRetries: 0 });
    expect(create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("returns failure without leaking provider errors", async () => {
    create.mockRejectedValue(new Error("sensitive provider detail"));
    const { POST } = await import("../app/api/summary/route");
    const response = await POST(req(body)); expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("sensitive");
  });
});
