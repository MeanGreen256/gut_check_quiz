export type ResultTypeId =
  | "thriving"
  | "sensitive"
  | "struggling"
  | "distressed";

export interface AnswerOption {
  text: string;
  points: number;
}

export interface Question {
  id: number;
  icon: string;
  domain: string;
  text: string;
  options: AnswerOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: 1,
    icon: "Activity",
    domain: "Symptom severity",
    text: "How often do you experience bloating or abdominal discomfort?",
    options: [
      { text: "Rarely or never", points: 3 },
      { text: "1–2 times per week", points: 2 },
      { text: "3–4 times per week", points: 1 },
      { text: "Daily or almost daily", points: 0 },
    ],
  },
  {
    id: 2,
    icon: "Repeat",
    domain: "Symptom severity",
    text: "How would you describe your bowel habits over the last month?",
    options: [
      { text: "Regular, comfortable, well-formed", points: 3 },
      { text: "Occasionally irregular but manageable", points: 2 },
      { text: "Frequently constipated or loose/urgent", points: 1 },
      { text: "Alternating between constipation and diarrhea", points: 0 },
    ],
  },
  {
    id: 3,
    icon: "UtensilsCrossed",
    domain: "Symptom severity",
    text: "After eating, how often do you feel excessively full, gassy, or uncomfortable?",
    options: [
      { text: "Almost never", points: 3 },
      { text: "After certain foods only", points: 2 },
      { text: "After most meals", points: 1 },
      { text: "After nearly every meal", points: 0 },
    ],
  },
  {
    id: 4,
    icon: "Brain",
    domain: "Symptom severity",
    text: "Do you regularly experience any of the following? (Select the best match)",
    options: [
      { text: "None of these", points: 3 },
      { text: "Brain fog or fatigue after eating", points: 2 },
      { text: "Skin issues (acne, eczema, rashes)", points: 1 },
      { text: "Multiple: brain fog + skin issues + joint pain", points: 0 },
    ],
  },
  {
    id: 5,
    icon: "Stethoscope",
    domain: "Symptom severity",
    text: "Have you been diagnosed with or suspect any of the following?",
    options: [
      { text: "None", points: 3 },
      { text: "Food intolerances (gluten, dairy, etc.)", points: 2 },
      { text: "IBS or IBD", points: 1 },
      { text: "SIBO, leaky gut, or an autoimmune condition", points: 0 },
    ],
  },
  {
    id: 6,
    icon: "Leaf",
    domain: "Dietary patterns",
    text: "How many different plant foods do you eat in a typical week?",
    options: [
      { text: "30+ varieties", points: 3 },
      { text: "15–29 varieties", points: 2 },
      { text: "5–14 varieties", points: 1 },
      { text: "Fewer than 5 varieties", points: 0 },
    ],
  },
  {
    id: 7,
    icon: "FlaskConical",
    domain: "Dietary patterns",
    text: "How often do you eat fermented foods (yogurt, kefir, kimchi, sauerkraut, kombucha)?",
    options: [
      { text: "Daily", points: 3 },
      { text: "A few times per week", points: 2 },
      { text: "Occasionally", points: 1 },
      { text: "Rarely or never", points: 0 },
    ],
  },
  {
    id: 8,
    icon: "Package",
    domain: "Dietary patterns",
    text: "How would you describe your relationship with processed foods?",
    options: [
      { text: "I rarely eat them", points: 3 },
      { text: "Occasionally — a few times per week", points: 2 },
      { text: "Most days include some processed foods", points: 1 },
      { text: "They make up most of my daily diet", points: 0 },
    ],
  },
  {
    id: 9,
    icon: "Gauge",
    domain: "Lifestyle factors",
    text: "How would you rate your average stress level over the last month?",
    options: [
      { text: "Low — I feel calm and in control", points: 3 },
      { text: "Moderate — some stress but manageable", points: 2 },
      { text: "High — stress is a constant presence", points: 1 },
      { text: "Very high — I feel overwhelmed most days", points: 0 },
    ],
  },
  {
    id: 10,
    icon: "Moon",
    domain: "Lifestyle factors",
    text: "How many hours of quality sleep do you get most nights?",
    options: [
      { text: "7–9 hours", points: 3 },
      { text: "6–7 hours", points: 2 },
      { text: "5–6 hours", points: 1 },
      { text: "Fewer than 5 hours", points: 0 },
    ],
  },
];

export const MAX_RAW_SCORE = 30;

export function computeFinalScore(rawScore: number): number {
  return Math.round((rawScore / MAX_RAW_SCORE) * 100);
}

export function typeForScore(finalScore: number): ResultTypeId {
  if (finalScore >= 80) return "thriving";
  if (finalScore >= 60) return "sensitive";
  if (finalScore >= 40) return "struggling";
  return "distressed";
}

export interface ResultProfile {
  id: ResultTypeId;
  name: string;
  icon: string;
  accentVar: string;
  tagline: string;
  summary: string;
  steps: [string, string, string];
  ctaLabel: string;
}

export const BOOKING_URL =
  "https://whitnessnutrition.practicebetter.io/#/5dc34f842a9c240c209ffabf/bookings?r=64b44f0a2371a1aba8f9e8fb&step=services";

export const TOOLS_URL = "https://apps.whitnessnutrition.com";

export const PROFILES: Record<ResultTypeId, ResultProfile> = {
  thriving: {
    id: "thriving",
    name: "Thriving Gut",
    icon: "Sprout",
    accentVar: "--type-thriving",
    tagline: "Your gut is in great shape — here's how to keep it that way.",
    summary:
      "Your gut microbiome is functioning beautifully. You're eating a diverse range of plants, managing stress well, and supporting your digestive health. The goal now is optimization — fine-tuning sleep, adding targeted prebiotics, and building on what's already working.",
    steps: [
      "Keep your plant variety at 30+ per week and rotate seasonally.",
      "Add one new prebiotic-rich food (leeks, asparagus, green banana) each week.",
      "Protect your 7–9 hours of sleep — it's doing more for your gut than any supplement.",
    ],
    ctaLabel: "Book a supplement & optimization review →",
  },
  sensitive: {
    id: "sensitive",
    name: "Sensitive Gut",
    icon: "Waves",
    accentVar: "--type-sensitive",
    tagline: "Your gut is talking — certain foods and stress are setting it off.",
    summary:
      "Your gut works well most of the time, but specific triggers — certain foods, stressful weeks, short nights — push it off balance. This is the easiest stage to act on: identifying your personal triggers now prevents symptoms from becoming your baseline.",
    steps: [
      "Keep a simple two-week food and symptom note to spot your top trigger.",
      "Add one fermented food most days to build resilience.",
      "Anchor a wind-down routine — your gut and your sleep share a nervous system.",
    ],
    ctaLabel: "Get help finding your triggers →",
  },
  struggling: {
    id: "struggling",
    name: "Struggling Gut",
    icon: "CloudRain",
    accentVar: "--type-struggling",
    tagline:
      "Your symptoms are frequent enough to interfere with daily life — that's worth addressing.",
    summary:
      "Bloating, irregularity, or post-meal discomfort is showing up often enough that it's shaping what you eat and how you feel day to day. Symptoms at this level usually have identifiable drivers, and a structured plan — not more restriction — is what moves the needle.",
    steps: [
      "Stop guessing with elimination diets — unstructured cutting often makes things worse.",
      "Prioritize regular meals and 25g+ of fiber, added gradually.",
      "Work with a professional to test, not guess, what's driving your symptoms.",
    ],
    ctaLabel: "Book a gut health consultation →",
  },
  distressed: {
    id: "distressed",
    name: "Distressed Gut",
    icon: "AlertCircle",
    accentVar: "--type-distressed",
    tagline:
      "Your gut needs real support — and you don't have to figure it out alone.",
    summary:
      "Your answers suggest significant, frequent symptoms that deserve proper attention. This result isn't a diagnosis, but symptoms at this level often have an underlying cause worth investigating with a professional. The right plan can change how you feel far faster than trying to white-knuckle it alone.",
    steps: [
      "Bring this result to your doctor or dietitian — persistent symptoms warrant a real workup.",
      "Focus on gentle consistency (regular meals, hydration, sleep) rather than aggressive restriction.",
      "Book a consultation so we can map symptoms to a plan built for your situation.",
    ],
    ctaLabel: "Book a consultation this week →",
  },
};
