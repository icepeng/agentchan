import useSWR from "swr";
import { qk } from "@/client/platform/index.js";
import { fetchOnboardingStatus, type OnboardingStatus } from "./onboarding.api.js";

export function useOnboardingStatus() {
  return useSWR<OnboardingStatus>(qk.onboarding(), fetchOnboardingStatus);
}
