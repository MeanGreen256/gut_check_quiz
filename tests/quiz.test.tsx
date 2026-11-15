// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QuizApp from "../components/QuizApp";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
let resolveCapture: (value: unknown) => void;
let resolveSummary: (value: unknown) => void;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  fetchMock = vi.fn((url: string) => new Promise(resolve => {
    if (url === "/api/subscribe") resolveCapture = resolve;
    else resolveSummary = resolve;
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function completeQuiz(consent = false) {
  fireEvent.click(screen.getByText("Start the check →"));
  for (let i = 0; i < 10; i++) {
    fireEvent.click(document.querySelector(".answer")!);
    await act(() => vi.advanceTimersByTimeAsync(500));
  }
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Test" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.invalid" } });
  if (consent) fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(document.querySelector("form")!);
}
it("renders static results without newsletter consent or a subscribe call", async () => {
  render(<QuizApp />); await completeQuiz();
  expect(screen.getByText("← Retake the check")).toBeTruthy();
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/summary"]);
  expect(screen.queryByRole("status")).toBeNull();
});
it("reports provider rejection without blocking results", async () => {
  render(<QuizApp />); await completeQuiz(true);
  expect(screen.getByRole("status").textContent).toContain("Submitting");
  await act(async () => resolveCapture({ ok: false }));
  expect(screen.getByRole("status").textContent).toContain("couldn’t confirm");
  expect(screen.getByText("← Retake the check")).toBeTruthy();
});
it("ignores late signup and summary responses after retake", async () => {
  render(<QuizApp />); await completeQuiz(true);
  fireEvent.click(screen.getByText("← Retake the check"));
  await act(async () => {
    resolveCapture({ ok: true, json: async () => ({ ok: true }) });
    resolveSummary({ ok: true, json: async () => ({ summary: "STALE SUMMARY" }) });
  });
  await completeQuiz(false);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("STALE SUMMARY")).toBeNull();
});
it("works when the browser has no AbortSignal.timeout", async () => {
  const original = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  try {
    render(<QuizApp />); await completeQuiz(true);
    expect(screen.getByText("← Retake the check")).toBeTruthy();
  } finally { Object.defineProperty(AbortSignal, "timeout", { value: original, configurable: true }); }
});
