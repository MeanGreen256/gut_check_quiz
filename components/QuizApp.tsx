"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import {
  Activity,
  AlertCircle,
  Brain,
  CloudRain,
  FlaskConical,
  Gauge,
  Leaf,
  Moon,
  Package,
  Repeat,
  Sprout,
  Stethoscope,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  BOOKING_URL,
  computeFinalScore,
  PROFILES,
  QUESTIONS,
  TOOLS_URL,
  typeForScore,
  type ResultTypeId,
} from "@/lib/quiz-data";

const ICONS: Record<string, LucideIcon> = {
  Activity,
  AlertCircle,
  Brain,
  CloudRain,
  FlaskConical,
  Gauge,
  Leaf,
  Moon,
  Package,
  Repeat,
  Sprout,
  Stethoscope,
  UtensilsCrossed,
  Waves,
};

type Stage = "landing" | "questions" | "lead" | "results";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function QuizApp() {
  const searchParams = useSearchParams();
  const devType = searchParams.get("dev") === "results"
    ? (searchParams.get("type") as ResultTypeId | null)
    : null;
  const isDevMode =
    devType !== null && devType in PROFILES;

  const [stage, setStage] = useState<Stage>("landing");
  const [current, setCurrent] = useState(0); // question index 0–9
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(QUESTIONS.length).fill(null)
  );
  const [selectedFlash, setSelectedFlash] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lead form state
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Results state
  const [personalSummary, setPersonalSummary] = useState<string | null>(null);
  const [summaryFading, setSummaryFading] = useState(false);

  const fire = useCallback(
    (event: string, payload?: Record<string, string | number | boolean>) => {
      if (isDevMode) return; // strip dev-mode sessions from analytics
      try {
        track(event, payload);
      } catch {
        /* analytics must never break the app */
      }
    },
    [isDevMode]
  );

  // Dev shortcut: ?dev=results&type=thriving|sensitive|struggling|distressed
  useEffect(() => {
    if (isDevMode) setStage("results");
  }, [isDevMode]);

  const rawScore = useMemo(
    () =>
      answers.reduce<number>(
        (sum, optIdx, qIdx) =>
          optIdx === null ? sum : sum + QUESTIONS[qIdx].options[optIdx].points,
        0
      ),
    [answers]
  );

  const mockScores: Record<ResultTypeId, number> = {
    thriving: 90,
    sensitive: 70,
    struggling: 50,
    distressed: 25,
  };

  const finalScore = isDevMode
    ? mockScores[devType as ResultTypeId]
    : computeFinalScore(rawScore);
  const resultType: ResultTypeId = isDevMode
    ? (devType as ResultTypeId)
    : typeForScore(finalScore);

  // Move focus to question heading on question change
  useEffect(() => {
    if (stage === "questions") {
      questionHeadingRef.current?.focus();
    }
  }, [stage, current]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );

  function handleStart() {
    fire("quiz_start");
    setStage("questions");
  }

  function handleAnswer(optIdx: number) {
    const qNumber = QUESTIONS[current].id;
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = optIdx;
      return next;
    });
    fire("question_answered", { q: qNumber });

    const advance = () => {
      setSelectedFlash(null);
      if (current === QUESTIONS.length - 1) {
        // compute completed score from the updated answers
        const updated = [...answers];
        updated[current] = optIdx;
        const raw = updated.reduce<number>(
          (sum, oi, qi) =>
            oi === null ? sum : sum + QUESTIONS[qi].options[oi].points,
          0
        );
        fire("quiz_completed", { score: computeFinalScore(raw) });
        setStage("lead");
      } else {
        setCurrent((c) => c + 1);
      }
    };

    if (reducedMotion) {
      advance();
    } else {
      setSelectedFlash(optIdx);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(advance, 250);
    }
  }

  function handleBack() {
    if (current > 0) setCurrent((c) => c - 1);
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    let valid = true;
    if (!firstName.trim()) {
      setNameError("Please add your first name.");
      valid = false;
    } else {
      setNameError(null);
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("That email doesn't look right — mind checking it?");
      valid = false;
    } else {
      setEmailError(null);
    }
    if (!valid) return;

    setSubmitting(true);
    fire("email_submitted", { consent });

    // Answer pattern for the summary route — no PII
    const answerPattern: Record<string, string> = {};
    answers.forEach((optIdx, qIdx) => {
      if (optIdx !== null) {
        answerPattern[`q${QUESTIONS[qIdx].id}`] =
          QUESTIONS[qIdx].options[optIdx].text;
      }
    });

    // Fire subscribe (only with consent) — do not block results on it
    if (consent) {
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          email: email.trim(),
          resultType,
        }),
      }).catch(() => {
        /* silent — results always render */
      });
    }

    // Personalized summary, in parallel, 6s budget
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultType,
        score: finalScore,
        answers: answerPattern,
      }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        clearTimeout(timeout);
        if (data && typeof data.summary === "string" && data.summary.trim()) {
          if (reducedMotion) {
            setPersonalSummary(data.summary.trim());
          } else {
            setSummaryFading(true);
            setTimeout(() => {
              setPersonalSummary(data.summary.trim());
              setSummaryFading(false);
            }, 300);
          }
        }
      })
      .catch(() => {
        /* silent — static summary stays */
      });

    // Transition to results immediately
    setStage("results");
    fire("result_viewed", { type: resultType });
    setSubmitting(false);
  }

  function handleRetake() {
    fire("retake_clicked");
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStage("landing");
    setCurrent(0);
    setAnswers(Array(QUESTIONS.length).fill(null));
    setSelectedFlash(null);
    setFirstName("");
    setEmail("");
    setConsent(false);
    setEmailError(null);
    setNameError(null);
    setSubmitting(false);
    setPersonalSummary(null);
    setSummaryFading(false);
    window.scrollTo(0, 0);
  }

  return (
    <div className="shell">
      <a className="brand" href={TOOLS_URL}>
        <span className="brand-dot" aria-hidden="true" />
        Whitness Nutrition
      </a>

      {stage === "landing" && (
        <main className="stage">
          <p className="eyebrow">Free · about 3 minutes · 10 questions</p>
          <h1>What&rsquo;s your gut health type?</h1>
          <p className="lede">
            Answer 10 questions about your symptoms, diet, and lifestyle. Get a
            scored result — Thriving, Sensitive, Struggling, or Distressed —
            with next steps written by a registered dietitian.
          </p>
          <button className="btn-primary" onClick={handleStart}>
            Start the check →
          </button>
          <p className="muted small" style={{ marginTop: 40 }}>
            Educational assessment — not medical advice or a diagnosis.
          </p>
        </main>
      )}

      {stage === "questions" && (
        <main className="stage" style={{ justifyContent: "flex-start" }}>
          <QuestionScreen
            index={current}
            selected={selectedFlash}
            onAnswer={handleAnswer}
            onBack={handleBack}
            headingRef={questionHeadingRef}
          />
        </main>
      )}

      {stage === "lead" && (
        <main className="stage">
          <div className="card">
            <h2>Your results are ready</h2>
            <p style={{ margin: "12px 0 24px" }}>
              Enter your name and email and I&rsquo;ll show your gut health
              type — plus send you the right next steps for your result.
            </p>
            <form onSubmit={handleLeadSubmit} noValidate>
              <div className="field">
                <label htmlFor="first-name">First name</label>
                <input
                  id="first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  aria-describedby={nameError ? "name-error" : undefined}
                  aria-invalid={nameError ? true : undefined}
                  required
                />
                {nameError && (
                  <p className="field-error" id="name-error">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={emailError ? "email-error" : undefined}
                  aria-invalid={emailError ? true : undefined}
                  required
                />
                {emailError && (
                  <p className="field-error" id="email-error">
                    {emailError}
                  </p>
                )}
              </div>
              <div className="check-row">
                <input
                  id="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label htmlFor="consent">
                  Send me gut health tips and tools from Whitness Nutrition.
                  Unsubscribe anytime.
                </label>
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    One sec…
                  </>
                ) : (
                  "Show my results →"
                )}
              </button>
            </form>
            <p className="muted small" style={{ marginTop: 16 }}>
              No spam. Your answers aren&rsquo;t stored anywhere.
            </p>
          </div>
        </main>
      )}

      {stage === "results" && (
        <main className="stage" style={{ justifyContent: "flex-start" }}>
          <ResultsScreen
            score={finalScore}
            type={resultType}
            personalSummary={personalSummary}
            summaryFading={summaryFading}
            reducedMotion={reducedMotion}
            onRetake={handleRetake}
            onCtaClick={() => fire("cta_clicked", { type: resultType })}
            onToolsClick={() => fire("tools_link_clicked")}
          />
        </main>
      )}

      {(stage === "results" || stage === "landing") && (
        <footer className="footer-disclaimer">
          {stage === "results" &&
            "This assessment is educational and does not diagnose any condition. If your symptoms are severe or worsening, talk with your doctor."}
        </footer>
      )}
    </div>
  );
}

function QuestionScreen({
  index,
  selected,
  onAnswer,
  onBack,
  headingRef,
}: {
  index: number;
  selected: number | null;
  onAnswer: (optIdx: number) => void;
  onBack: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const q = QUESTIONS[index];
  const Icon = ICONS[q.icon];
  const n = index + 1;
  const pct = (n / QUESTIONS.length) * 100;

  return (
    <div>
      <div className="progress-wrap">
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={n}
          aria-valuemin={1}
          aria-valuemax={QUESTIONS.length}
          aria-label={`Question ${n} of ${QUESTIONS.length}`}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="progress-label">
          Question {n} of {QUESTIONS.length}
        </p>
      </div>

      <div className="icon-tile">
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="domain-label">{q.domain}</p>
      <h2 className="question-text" tabIndex={-1} ref={headingRef}>
        {q.text}
      </h2>

      <div className="answers">
        {q.options.map((opt, i) => (
          <button
            key={opt.text}
            className="answer"
            aria-pressed={selected === i}
            onClick={() => onAnswer(i)}
          >
            {opt.text}
          </button>
        ))}
      </div>

      {index > 0 && (
        <button className="text-link" onClick={onBack}>
          ← Back
        </button>
      )}
    </div>
  );
}

function ScoreRing({
  score,
  accent,
  reducedMotion,
}: {
  score: number;
  accent: string;
  reducedMotion: boolean;
}) {
  const size = 180;
  const strokeWidth = 12;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const target = circumference * (1 - score / 100);
  const [offset, setOffset] = useState(
    reducedMotion ? target : circumference
  );

  useEffect(() => {
    if (reducedMotion) {
      setOffset(target);
      return;
    }
    // draw over ~900ms ease-out via CSS transition
    const raf = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion]);

  return (
    <div className="ring-wrap">
      <svg
        className="ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(${accent})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={
            reducedMotion
              ? undefined
              : { transition: "stroke-dashoffset 900ms ease-out" }
          }
        />
      </svg>
      <div className="ring-score">
        <span
          className="ring-score-number"
          style={{ color: `var(${accent})` }}
        >
          {score}
        </span>
        <span className="ring-score-denom">/ 100</span>
      </div>
    </div>
  );
}

function ResultsScreen({
  score,
  type,
  personalSummary,
  summaryFading,
  reducedMotion,
  onRetake,
  onCtaClick,
  onToolsClick,
}: {
  score: number;
  type: ResultTypeId;
  personalSummary: string | null;
  summaryFading: boolean;
  reducedMotion: boolean;
  onRetake: () => void;
  onCtaClick: () => void;
  onToolsClick: () => void;
}) {
  const profile = PROFILES[type];
  const Icon = ICONS[profile.icon];

  return (
    <div className="results">
      <ScoreRing
        score={score}
        accent={profile.accentVar}
        reducedMotion={reducedMotion}
      />
      <div aria-live="polite">
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
          }}
        >
          Your score: {score} out of 100. Your gut health type: {profile.name}.
        </span>
        <div className="type-badge">
          <Icon
            size={28}
            aria-hidden="true"
            style={{ color: `var(${profile.accentVar})` }}
          />
          <span
            className="type-name"
            style={{ color: `var(${profile.accentVar})` }}
          >
            {profile.name}
          </span>
        </div>
        <p className="tagline">{profile.tagline}</p>
        <p className={`summary${summaryFading ? " fading" : ""}`}>
          {personalSummary ?? profile.summary}
        </p>
      </div>

      <div className="steps-block">
        <hr
          className="steps-rule"
          style={{ background: `var(${profile.accentVar})` }}
        />
        <h3 className="steps-title">Your 3 next steps</h3>
        <ol className="steps-list">
          {profile.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="cta-block">
        <a
          className="btn-primary"
          href={BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onCtaClick}
        >
          {profile.ctaLabel}
        </a>
        <a
          className="text-link text-link--pink"
          href={TOOLS_URL}
          onClick={onToolsClick}
        >
          Explore more free tools →
        </a>
        <button className="text-link" onClick={onRetake}>
          ← Retake the check
        </button>
      </div>
    </div>
  );
}
