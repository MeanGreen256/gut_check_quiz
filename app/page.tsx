import { Suspense } from "react";
import QuizApp from "@/components/QuizApp";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuizApp />
    </Suspense>
  );
}
