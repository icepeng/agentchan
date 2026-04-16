import { useState, useEffect } from "react";
import {
  useConfigState,
  useConfigDispatch,
  fetchApiKeys,
  updateApiKey,
  updateConfig,
  fetchOnboardingStatus,
  completeOnboarding,
} from "@/client/entities/config/index.js";
import type { ApiKeyStatus } from "@/client/entities/config/index.js";
import { useUIDispatch } from "@/client/entities/ui/index.js";
import { useProject } from "@/client/features/project/index.js";

export type OnboardingStep = 0 | 1 | 2;
export const ONBOARDING_STEP_COUNT = 3;

export function useOnboarding() {
  const config = useConfigState();
  const configDispatch = useConfigDispatch();
  const uiDispatch = useUIDispatch();
  const { createProject } = useProject();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(0);
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingSlug, setCreatingSlug] = useState<string | null>(null);

  useEffect(() => {
    const forceShow = new URLSearchParams(window.location.search).has("onboarding");

    void Promise.all([fetchOnboardingStatus(), fetchApiKeys()]).then(
      ([status, keys]) => {
        setApiKeys(keys);
        if (!status.completed || forceShow) {
          setWizardOpen(true);
        }
      },
    ).catch(() => {}).finally(() => setReady(true));
  }, []);

  const hasAnyKey = Object.values(apiKeys).some((v) => v !== "");

  const advance = () =>
    setStep((s) => Math.min(s + 1, ONBOARDING_STEP_COUNT - 1) as OnboardingStep);
  const back = () => setStep((s) => Math.max(s - 1, 0) as OnboardingStep);

  // All dismiss paths land on Templates — avoids the "empty main" failure mode
  // that STRATEGY.md §2-6 flags as an onboarding-to-activation hole.
  const dismiss = async () => {
    await completeOnboarding();
    setWizardOpen(false);
    uiDispatch({ type: "NAVIGATE", route: { page: "templates" } });
  };

  const startWithTemplate = async (slug: string, name: string) => {
    if (creatingSlug) return;
    setCreatingSlug(slug);
    try {
      await createProject(name, slug);
      await completeOnboarding();
      setWizardOpen(false);
      uiDispatch({ type: "NAVIGATE", route: { page: "main" } });
    } finally {
      setCreatingSlug(null);
    }
  };

  const saveApiKey = async (provider: string, key: string) => {
    setSaving(true);
    try {
      const updated = await updateApiKey(provider, key);
      setApiKeys(updated);
      const result = await updateConfig({ provider });
      configDispatch({ type: "SET_CONFIG", provider: result.provider, model: result.model });
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
    hasAnyKey,
    ready,
    providers: config.providers,
  };
}
