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

export type OnboardingStep = 0 | 1;

export function useOnboarding() {
  const config = useConfigState();
  const configDispatch = useConfigDispatch();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(0);
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const advance = () => setStep((s) => Math.min(s + 1, 1) as OnboardingStep);

  const dismiss = async () => {
    await completeOnboarding();
    setWizardOpen(false);
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
    dismiss,
    saveApiKey,
    saving,
    apiKeys,
    hasAnyKey,
    ready,
    providers: config.providers,
  };
}
