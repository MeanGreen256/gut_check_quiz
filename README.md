# Whitness Gut Health Check

Free lead-magnet quiz for Whitness Nutrition. 10 questions → scored gut health type (Thriving / Sensitive / Struggling / Distressed) → email capture into Kit (ConvertKit) → personalized result with booking CTA.

Built per `whitness-gut-check-handoff-spec.md` (v1.0, July 2026).

## Stack

Next.js (App Router) + plain CSS, `lucide-react` icons, Vercel Analytics. Two server routes: `/api/subscribe` (Kit v4 API) and `/api/summary` (Claude Haiku personalized summary with static fallback).

## Environment variables

```
CONVERTKIT_API_KEY=   # Kit v4 API key
CONVERTKIT_FORM_ID=9646978
ANTHROPIC_API_KEY=
```

## Development

```
npm install
npm run dev
```

QA shortcut: `/?dev=results&type=thriving|sensitive|struggling|distressed` renders a mocked results screen. Dev-mode sessions fire no analytics events.

## Notes / deviations from spec

- Contrast audit (spec §11) required two token adjustments: `--ink-soft` #7A7480 → #6E6874 (4.28 → 5.10 vs 4.5:1 AA) and `--type-sensitive` #C98A2B → #A0701A (2.77 → 4.11 vs 3:1 for large text/strokes). All other tokens pass as specced.
- Primary button text renders at 19px/700 so white-on-pink qualifies as WCAG large text (4.18:1 > 3:1), keeping the exact brand pink.
- Kit tags `gut-thriving`, `gut-sensitive`, `gut-struggling`, `gut-distressed` must exist in the Kit account; the subscribe route looks up tag IDs by name at runtime and caches them.
