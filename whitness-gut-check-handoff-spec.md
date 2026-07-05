# Handoff Spec: Whitness Gut Health Check

**Version:** 1.0 — July 2026
**For:** Executing agent (Claude Cowork / Claude Code)
**Owner:** Chase, Whitness Nutrition

Execute as written. Items marked OUT OF SCOPE must not be built, even if they seem like easy additions. Copy strings are verbatim unless they conflict with rendering constraints. Where a value is marked `[OWNER DECISION]`, stop and ask before proceeding — do not guess.

---

## 1. Purpose and context

Whitness Nutrition is a private dietitian practice (gut health, weight loss, metabolic health). This app is a **free, public lead-magnet quiz** — no paywall, no authentication. Its jobs, in priority order: (1) capture emails into ConvertKit segmented by gut health type, (2) deliver a genuinely useful, personalized result that builds trust, (3) convert Struggling/Distressed results into booked calls.

It will be linked from the tools directory at `apps.whitnessnutrition.com` (separate repo, already specced) as the "Gut Health Check" card. This app must feel like a sibling of that page and of Plate Lab: same tokens, same tone, same shape language.

Related properties:
- **Tools directory** — `https://apps.whitnessnutrition.com`
- **Main site** — WordPress at `https://whitnessnutrition.com` (do not modify)
- **Booking** — `https://whitnessnutrition.practicebetter.io/#/5dc34f842a9c240c209ffabf/bookings?r=64b44f0a2371a1aba8f9e8fb&step=services`

## 2. Stack and repo

- **New GitHub repo** under the `MeanGreen256` account. Suggested name: `whitness-gut-check`
- Next.js (App Router), deployed to Vercel
- Domain: `gutcheck.whitnessnutrition.com` `[OWNER DECISION — confirm subdomain before DNS]`
- Plain CSS or CSS Modules. No UI library, no Tailwind.
- `lucide-react` for all icons. **No emoji anywhere in the UI.**
- Vercel Analytics (`@vercel/analytics`) with custom events (Section 10)
- **No authentication.** No Clerk. No user accounts. No database.
- Two server routes only: `/api/subscribe` (ConvertKit) and `/api/summary` (Claude API). All keys server-side via env vars. Never expose keys to the client.

### Environment variables

```
CONVERTKIT_API_KEY=        [OWNER SUPPLIES]
CONVERTKIT_FORM_ID=        [OWNER SUPPLIES]
ANTHROPIC_API_KEY=         [OWNER SUPPLIES]
```

## 3. Design tokens (canonical — identical to the directory spec, do not substitute)

```css
--paper:      #FDF7F9;  /* page background */
--paper-deep: #F8EEF2;  /* subtle fills */
--ink:        #2B2730;  /* primary text, dark surfaces */
--ink-soft:   #7A7480;  /* secondary text — contrast acceptance criterion, Section 11 */
--pink:       #E91E8C;  /* THE brand pink. Not #EE4F6B, not #E84B8A. */
--pink-deep:  #C91974;  /* hover/pressed */
--blush:      #F6D9E8;  /* badges, soft fills */
--blush-line: #EFC3DC;  /* borders */
--white:      #FFFFFF;
```

### Result-type accent tokens (used ONLY on the results screen)

```css
--type-thriving:   #4C9A6A;  /* muted green, harmonized to palette */
--type-sensitive:  #C98A2B;  /* muted amber */
--type-struggling: #C4574F;  /* muted red */
--type-distressed: #8A5FBF;  /* muted violet */
```

Accents appear as the score-ring stroke, the type badge, and small rules — never as full backgrounds and never on buttons. All CTAs stay `--pink`.

**Type:** Fraunces (display: h1, h2, question text, result type name) + Inter (everything else), via `next/font/google`. h1 `clamp(2.2rem, 5vw, 3.6rem)`, line-height ~1.05, letter-spacing -0.015em. Question text `clamp(1.4rem, 3vw, 1.9rem)`. Body 1rem/1.6.

**Shape language:** border-radius 16–22px on cards, pill buttons, soft large-blur charcoal shadows at low opacity. No gradients, no glassmorphism, no dark mode.

**Copy rules:** sentence case for UI, active verbs on buttons, no exclamation points, no "unlock/journey/supercharge" filler. Do not add health-outcome claims beyond the copy in this spec.

## 4. App flow (5 stages, single-page state machine)

```
Landing → Questions (1–10, one per screen) → Lead capture → Results → CTA
```

No routing between stages is required (client state is fine), but the app must support a `?dev=results&type=thriving|sensitive|struggling|distressed` query param that jumps straight to a mocked results screen for QA. Strip this from production analytics.

### 4.1 Landing

- Eyebrow (Inter, small caps, `--ink-soft`): "Free · about 3 minutes · 10 questions"
- h1 (Fraunces): "What's your gut health type?"
- Lede: "Answer 10 questions about your symptoms, diet, and lifestyle. Get a scored result — Thriving, Sensitive, Struggling, or Distressed — with next steps written by a registered dietitian."
- Primary pink pill button: "Start the check →" (fires `quiz_start`)
- Footer line (`--ink-soft`, small): "Educational assessment — not medical advice or a diagnosis."
- Small brand mark top-left: 10px pink dot + "Whitness Nutrition" in Fraunces 600, linking to `https://apps.whitnessnutrition.com`

### 4.2 Questions

- One question per screen. Progress bar at top: thin (4px) track in `--blush`, fill in `--pink`, plus text "Question N of 10" in `--ink-soft`.
- Each screen: Lucide icon in a blush tile (44px), domain label (Inter, small caps, `--ink-soft`), question text (Fraunces), then 4 answer buttons.
- Answer buttons: full-width cards, `--white` bg, `--blush-line` border, 16px radius, left-aligned text. Hover: border `--pink`, bg `--paper-deep`. Selected: border `--pink` 2px, subtle blush fill, then auto-advance after 250ms. No "Next" button needed; provide a "← Back" text link (`--ink-soft`) on Q2–Q10.
- Do not display point values anywhere in the UI.

### 4.3 Lead capture (between Q10 and results)

Hard gate — results render only after submit. Screen copy:

- h2 (Fraunces): "Your results are ready"
- Body: "Enter your name and email and I'll show your gut health type — plus send you the right next steps for your result."
- Fields: First name (required), Email (required, validated)
- Consent line with checkbox (checked by default is NOT allowed — unchecked by default): "Send me gut health tips and tools from Whitness Nutrition. Unsubscribe anytime."
- Primary pink button: "Show my results →"
- Small reassurance line (`--ink-soft`): "No spam. Your answers aren't stored anywhere."

Submit behavior: fire `email_submitted`, POST to `/api/subscribe`, then transition to results immediately — do not block results on the ConvertKit response. If the subscribe call fails, results still show; log the error silently.

### 4.4 Results

Top to bottom:
1. **Score ring** — animated circular progress (SVG stroke draws over ~900ms, ease-out) showing score /100 in the type's accent color. Under `prefers-reduced-motion`, render fully drawn and static. This is the page's only animated flourish.
2. **Type badge + name** — Lucide icon + type name in Fraunces, accent-colored.
3. **Tagline** (one line) and **summary paragraph** — the summary is replaced by the Claude API personalized version when available (Section 8); the static copy in Section 7 is the required fallback.
4. **"Your 3 next steps"** — three numbered steps from the profile.
5. **CTA block** — type-specific button (Section 7), all routing to the Practice Better URL (new tab), plus a secondary text link "Explore more free tools →" to `https://apps.whitnessnutrition.com`.
6. **Retake** — small text link "← Retake the check" (`--ink-soft`), resets all state, fires `retake_clicked`.
7. Footer disclaimer, verbatim: "This assessment is educational and does not diagnose any condition. If your symptoms are severe or worsening, talk with your doctor."

## 5. The 10 questions (verbatim, with hidden point values)

Score = sum of points. Max raw score 30. `finalScore = Math.round((raw / 30) * 100)`.

### Domain 1: Symptom severity (Q1–Q5)

**Q1** — icon `Activity` — "How often do you experience bloating or abdominal discomfort?"
- Rarely or never (3) / 1–2 times per week (2) / 3–4 times per week (1) / Daily or almost daily (0)

**Q2** — icon `Repeat` — "How would you describe your bowel habits over the last month?"
- Regular, comfortable, well-formed (3) / Occasionally irregular but manageable (2) / Frequently constipated or loose/urgent (1) / Alternating between constipation and diarrhea (0)

**Q3** — icon `UtensilsCrossed` — "After eating, how often do you feel excessively full, gassy, or uncomfortable?"
- Almost never (3) / After certain foods only (2) / After most meals (1) / After nearly every meal (0)

**Q4** — icon `Brain` — "Do you regularly experience any of the following? (Select the best match)"
- None of these (3) / Brain fog or fatigue after eating (2) / Skin issues (acne, eczema, rashes) (1) / Multiple: brain fog + skin issues + joint pain (0)

**Q5** — icon `Stethoscope` — "Have you been diagnosed with or suspect any of the following?"
- None (3) / Food intolerances (gluten, dairy, etc.) (2) / IBS or IBD (1) / SIBO, leaky gut, or an autoimmune condition (0)

### Domain 2: Dietary patterns (Q6–Q8)

**Q6** — icon `Leaf` — "How many different plant foods do you eat in a typical week?"
- 30+ varieties (3) / 15–29 varieties (2) / 5–14 varieties (1) / Fewer than 5 varieties (0)

**Q7** — icon `FlaskConical` — "How often do you eat fermented foods (yogurt, kefir, kimchi, sauerkraut, kombucha)?"
- Daily (3) / A few times per week (2) / Occasionally (1) / Rarely or never (0)

**Q8** — icon `Package` — "How would you describe your relationship with processed foods?"
- I rarely eat them (3) / Occasionally — a few times per week (2) / Most days include some processed foods (1) / They make up most of my daily diet (0)

### Domain 3: Lifestyle factors (Q9–Q10)

**Q9** — icon `Gauge` — "How would you rate your average stress level over the last month?"
- Low — I feel calm and in control (3) / Moderate — some stress but manageable (2) / High — stress is a constant presence (1) / Very high — I feel overwhelmed most days (0)

**Q10** — icon `Moon` — "How many hours of quality sleep do you get most nights?"
- 7–9 hours (3) / 6–7 hours (2) / 5–6 hours (1) / Fewer than 5 hours (0)

## 6. Scoring brackets

| Score | Type | Accent token | Lucide icon |
|---|---|---|---|
| 80–100 | Thriving Gut | `--type-thriving` | `Sprout` |
| 60–79 | Sensitive Gut | `--type-sensitive` | `Waves` |
| 40–59 | Struggling Gut | `--type-struggling` | `CloudRain` |
| 0–39 | Distressed Gut | `--type-distressed` | `AlertCircle` |

## 7. Result profiles (static copy — the Claude summary replaces ONLY the summary paragraph)

> **[OWNER REVIEW REQUIRED]** Chase reviews all four profiles below for clinical accuracy and tone before launch. The Thriving summary is locked from prior planning; the other three are drafts written to match it.

### Thriving Gut (80–100)
- **Tagline:** "Your gut is in great shape — here's how to keep it that way."
- **Summary:** "Your gut microbiome is functioning beautifully. You're eating a diverse range of plants, managing stress well, and supporting your digestive health. The goal now is optimization — fine-tuning sleep, adding targeted prebiotics, and building on what's already working."
- **Next steps:** 1) Keep your plant variety at 30+ per week and rotate seasonally. 2) Add one new prebiotic-rich food (leeks, asparagus, green banana) each week. 3) Protect your 7–9 hours of sleep — it's doing more for your gut than any supplement.
- **CTA button:** "Book a supplement & optimization review →"

### Sensitive Gut (60–79)
- **Tagline:** "Your gut is talking — certain foods and stress are setting it off."
- **Summary:** "Your gut works well most of the time, but specific triggers — certain foods, stressful weeks, short nights — push it off balance. This is the easiest stage to act on: identifying your personal triggers now prevents symptoms from becoming your baseline."
- **Next steps:** 1) Keep a simple two-week food and symptom note to spot your top trigger. 2) Add one fermented food most days to build resilience. 3) Anchor a wind-down routine — your gut and your sleep share a nervous system.
- **CTA button:** "Get help finding your triggers →"

### Struggling Gut (40–59)
- **Tagline:** "Your symptoms are frequent enough to interfere with daily life — that's worth addressing."
- **Summary:** "Bloating, irregularity, or post-meal discomfort is showing up often enough that it's shaping what you eat and how you feel day to day. Symptoms at this level usually have identifiable drivers, and a structured plan — not more restriction — is what moves the needle."
- **Next steps:** 1) Stop guessing with elimination diets — unstructured cutting often makes things worse. 2) Prioritize regular meals and 25g+ of fiber, added gradually. 3) Work with a professional to test, not guess, what's driving your symptoms.
- **CTA button:** "Book a gut health consultation →"

### Distressed Gut (0–39)
- **Tagline:** "Your gut needs real support — and you don't have to figure it out alone."
- **Summary:** "Your answers suggest significant, frequent symptoms that deserve proper attention. This result isn't a diagnosis, but symptoms at this level often have an underlying cause worth investigating with a professional. The right plan can change how you feel far faster than trying to white-knuckle it alone."
- **Next steps:** 1) Bring this result to your doctor or dietitian — persistent symptoms warrant a real workup. 2) Focus on gentle consistency (regular meals, hydration, sleep) rather than aggressive restriction. 3) Book a consultation so we can map symptoms to a plan built for your situation.
- **CTA button:** "Book a consultation this week →"

## 8. Claude API personalized summary (`/api/summary`)

- Server route. Model: `claude-haiku-4-5-20251001` (cost control; quality is sufficient for a 3-sentence summary).
- **Input:** result type, score, and the answer pattern (question id → chosen option text). No name, no email — never send PII to this route.
- **System prompt requirements:** respond with plain text only, 2–3 sentences, warm and specific, referencing 1–2 of the user's actual answers (e.g., low plant variety, high stress); educational tone; must not diagnose, must not name medical conditions the user didn't select, must not contradict the static profile's urgency level; no exclamation points.
- **Behavior:** call after lead-capture submit, in parallel with `/api/subscribe`. Show the static summary immediately; if the API returns within 6 seconds, swap in the personalized text with a gentle fade. On timeout or any error, keep the static summary — no error surfaced to the user.
- Basic rate limit on the route (e.g., 10 requests/minute per IP) to protect the key.

## 9. ConvertKit integration (`/api/subscribe`)

- Server route. POST first name + email to the ConvertKit form (`CONVERTKIT_FORM_ID`) via API v3/v4.
- Apply a tag matching the result type — create these four tags in ConvertKit first: `gut-thriving`, `gut-sensitive`, `gut-struggling`, `gut-distressed`.
- Only submit if the consent checkbox is checked. If unchecked, skip ConvertKit entirely but still show results, and fire `email_submitted` with `{ consent: false }`.
- Do not store answers or emails anywhere else. No database, no logging of PII.

## 10. Analytics events (Vercel Analytics custom events)

| Event | Payload | Fires when |
|---|---|---|
| `quiz_start` | — | Landing CTA clicked |
| `question_answered` | `{ q: 1–10 }` | Each answer selected |
| `quiz_completed` | `{ score }` | Q10 answered |
| `email_submitted` | `{ consent: boolean }` | Lead form submitted |
| `result_viewed` | `{ type }` | Results screen rendered |
| `cta_clicked` | `{ type }` | Result CTA button clicked |
| `tools_link_clicked` | — | "Explore more free tools" clicked |
| `retake_clicked` | — | Retake link clicked |

Never include name, email, or free-text answers in any event payload.

## 11. Accessibility acceptance criteria

- Full keyboard operability: answers are real `<button>`s, logical focus order, visible focus ring (2px `--pink` offset ring).
- Progress announced: progress bar has `role="progressbar"` with `aria-valuenow`; question changes move focus to the new question heading.
- Results screen: score and type announced via an `aria-live="polite"` region; the score ring has a text alternative ("Your score: 72 out of 100").
- All Lucide icons `aria-hidden="true"` with adjacent text labels.
- `prefers-reduced-motion`: no auto-advance animation, ring renders static, fades become instant swaps.
- Contrast audit is an acceptance criterion, not an assumption: verify `--ink-soft` on `--paper`, all four accent tokens as text/stroke on `--paper`, and button text at their rendered sizes against WCAG AA. Adjust token lightness if any fail — do not ship failing pairs.
- Form errors: inline text below the field (not color-only), associated via `aria-describedby`.

## 12. Responsive requirements

- Max content width 720px (this is a focused single-column flow, narrower than the directory's 1080px), 24px side padding.
- Verify explicitly at 320, 380, 680, 768, 1024. No overlap, clipping, or horizontal scroll at any of them. Answer buttons remain full-width and ≥44px tall at 320px.

## 13. States

| Element | State | Behavior |
|---|---|---|
| Answer button | Hover / focus | Border `--pink`, bg `--paper-deep` |
| Answer button | Selected | 2px `--pink` border, blush fill, auto-advance 250ms |
| Lead form | Submitting | Button shows spinner + "One sec…", disabled |
| Lead form | Invalid email | Inline error: "That email doesn't look right — mind checking it?" |
| Summary | Personalizing | Static summary visible; swap on API success only |
| Subscribe API | Error | Silent — results always render |
| Summary API | Error/timeout | Silent — static summary stays |

## 14. OUT OF SCOPE for v1 (do not build)

- The 5-email nurture sequence (lives in ConvertKit, not this repo)
- Social share images / OG-image generation per result type
- Saving or emailing results PDFs
- Any database, user accounts, or result history
- A results URL that encodes answers (shareable results)
- The Type 1/Type 2 metabolic quiz (separate future app)
- Changes to the tools directory repo (its Gut Health Check card gets wired to this URL later, in that repo)
- Dark mode

## 15. Open items for the owner (resolve before or during build)

1. **Subdomain** — confirm `gutcheck.whitnessnutrition.com` (or choose another) and add the CNAME in DNS + Vercel domain settings.
2. **ConvertKit** — create the form and four tags; supply `CONVERTKIT_API_KEY` and `CONVERTKIT_FORM_ID` as Vercel env vars.
3. **Anthropic key** — supply `ANTHROPIC_API_KEY` as a Vercel env var.
4. **Clinical copy review** — approve or edit the four result profiles and the two disclaimer lines (Section 7 and 4.4). You are the RD; the agent must not alter clinical meaning.
5. **Directory wiring** — after launch, update the Gut Health Check card CTA in `whitness-apps-directory` from `#` to the live URL.

## 16. Definition of done

- Deployed to Vercel on the confirmed subdomain, all env vars set
- All 10 questions, scoring, and four result profiles match this spec exactly
- Lead capture posts to ConvertKit with correct type tag; consent logic respected
- Claude summary works with graceful static fallback (test by breaking the key locally)
- All analytics events verified firing in Vercel Analytics
- Accessibility criteria in Section 11 pass, including the contrast audit
- Responsive checks pass at all six widths
- Lighthouse: accessibility ≥ 95, performance ≥ 90 on mobile
