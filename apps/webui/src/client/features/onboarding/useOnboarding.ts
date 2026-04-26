import { useState, useEffect } from "react";
import {
  useProviders,
  useApiKeys,
  useOnboarding as useOnboardingStatus,
  useConfigMutations,
} from "@/client/entities/config/index.js";
import { useUIDispatch } from "@/client/entities/ui/index.js";
import { useProject } from "@/client/features/project/index.js";

export type OnboardingStep = 0 | 1 | 2;
export const ONBOARDING_STEP_COUNT = 3;

export function useOnboarding() {
  const { data: providers = [] } = useProviders();
  const { data: apiKeys = {} } = useApiKeys();
  const { data: status } = useOnboardingStatus();
  const {
    update,
    updateApiKey: mutateApiKey,
    completeOnboarding: mutateCompleteOnboarding,
  } = useConfigMutations();
  const uiDispatch = useUIDispatch();
  const { createProject } = useProject();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(0);
  const [oauthSignedIn, setOauthSignedIn] = useState<Record<string, boolean>>({});
  const [decided, setDecided] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingSlug, setCreatingSlug] = useState<string | null>(null);

  // Decide once whether to open the wizard, the moment SWR resolves the status.
  // Re-firing on later refetches would reopen the wizard mid-session.
  useEffect(() => {
    if (decided || status === undefined) return;
    const forceShow = new URLSearchParams(window.location.search).has("onboarding");
    if (!status.completed || forceShow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SWR status가 처음 확정되는 순간 온보딩 표시 여부를 한 번 결정한다.
      setWizardOpen(true);
    }
    setDecided(true);
  }, [status, decided]);

  const ready = decided;
  const hasAnyKey = Object.values(apiKeys).some((v) => v !== "");
  const hasAnySignedIn = Object.values(oauthSignedIn).some(Boolean);
  const hasAnyCredentials = hasAnyKey || hasAnySignedIn;

  const handleOAuthActiveChange = (provider: string, active: boolean) => {
    setOauthSignedIn((prev) => {
      if (prev[provider] === active) return prev;
      return { ...prev, [provider]: active };
    });
  };

  const advance = () =>
    setStep((s) => Math.min(s + 1, ONBOARDING_STEP_COUNT - 1) as OnboardingStep);
  const back = () => setStep((s) => Math.max(s - 1, 0) as OnboardingStep);

  // All dismiss paths land on Templates — avoids the "empty main" failure mode
  // that STRATEGY.md §2-6 flags as an onboarding-to-activation hole.
  const dismiss = async () => {
    await mutateCompleteOnboarding();
    setWizardOpen(false);
    uiDispatch({ type: "NAVIGATE", route: { page: "templates" } });
  };

  const startWithTemplate = async (slug: string, name: string) => {
    if (creatingSlug) return;
    setCreatingSlug(slug);
    try {
      await createProject(name, slug);
      await mutateCompleteOnboarding();
      setWizardOpen(false);
      uiDispatch({ type: "NAVIGATE", route: { page: "main" } });
    } finally {
      setCreatingSlug(null);
    }
  };

  const saveApiKey = async (provider: string, key: string) => {
    setSaving(true);
    try {
      await mutateApiKey(provider, key);
      await update({ provider });
    } finally {
      setSaving(false);
    }
  };

  return {
    wizardOpen,
    step,
    advance,
    back,
    dismiss,
    startWithTemplate,
    creatingSlug,
    saveApiKey,
    saving,
    apiKeys,
    hasAnyCredentials,
    handleOAuthActiveChange,
    ready,
    providers,
  };
}
