import { json } from "@/client/platform/index.js";

export interface OnboardingStatus {
  completed: boolean;
}

export function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return json("/config/onboarding");
}

export function completeOnboarding(): Promise<OnboardingStatus> {
  return json("/config/onboarding", { method: "PUT" });
}
