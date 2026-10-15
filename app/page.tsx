import { publicCaptureConfig } from "@/server/contact-register.mjs";
export const dynamic = "force-dynamic";
import { Suspense } from "react";
import QuizApp from "@/components/QuizApp";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuizApp contactNotice={publicCaptureConfig()} />
    </Suspense>
  );
}
