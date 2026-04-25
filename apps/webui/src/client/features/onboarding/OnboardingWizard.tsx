import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/client/i18n/index.js";
import { Dialog, Button, Badge, Indicator, Select } from "@/client/shared/ui/index.js";
import { BASE } from "@/client/shared/api.js";
import { useTemplates, type TemplateMeta } from "@/client/entities/template/index.js";
import type { ProviderInfo } from "@/client/entities/config/index.js";
import { OAuthProviderCard } from "@/client/features/oauth/index.js";
import {
  useOnboarding,
  type OnboardingStep,
  ONBOARDING_STEP_COUNT,
} from "./useOnboarding.js";

const STEPS: OnboardingStep[] = [0, 1, 2];

// Strategic priority, separate from _order.json (the Templates page sort
// hint). Slugs missing from disk are filtered out so pruned branches or
// template renames don't break the wizard.
const FEATURED_SLUGS: readonly string[] = ["last-vow", "tides-of-moonhaven"];

export function OnboardingWizard() {
  const ob = useOnboarding();
  const { t } = useI18n();

  if (!ob.ready || !ob.wizardOpen) return null;

  const canGoBack = ob.step > 0;

  return (
    <Dialog
      open={ob.wizardOpen}
      onOpenChange={() => void ob.dismiss()}
      modal={false}
      size="lg"
    >
      <div className="relative px-8 py-10 flex flex-col items-center">
        {canGoBack && (
          <button
            type="button"
            onClick={ob.back}
            className="absolute top-4 left-4 flex items-center gap-1 px-2 py-1 text-xs text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
            aria-label={t("onboarding.back")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("onboarding.back")}
          </button>
        )}

        {ob.step === 0 && (
          <WelcomeStep
            onGetStarted={ob.advance}
            onSkip={() => void ob.dismiss()}
          />
        )}
        {ob.step === 1 && (
          <ApiKeyStep
            providers={ob.providers}
            apiKeys={ob.apiKeys}
            saving={ob.saving}
            hasAnyCredentials={ob.hasAnyCredentials}
            onSaveKey={ob.saveApiKey}
            onOAuthActiveChange={ob.handleOAuthActiveChange}
            onContinue={ob.advance}
            onSkip={() => void ob.dismiss()}
          />
        )}
        {ob.step === 2 && (
          <TemplatePickerStep
            creatingSlug={ob.creatingSlug}
            onPick={(slug, name) => void ob.startWithTemplate(slug, name)}
            onBrowseAll={() => void ob.dismiss()}
          />
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mt-8">
          {STEPS.map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                s === ob.step ? "bg-accent" : "bg-fg-4/30"
              }`}
            />
          ))}
          <span className="ml-2 text-[11px] text-fg-4 font-mono tabular-nums">
            {t("onboarding.stepProgress", {
              current: ob.step + 1,
              total: ONBOARDING_STEP_COUNT,
            })}
          </span>
        </div>
      </div>
    </Dialog>
  );
}

// --- Step 0: Welcome ---

function WelcomeStep({
  onGetStarted,
  onSkip,
}: {
  onGetStarted: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="text-center animate-fade">
      <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center">
        <div className="w-5 h-5 rounded-lg bg-accent/20 animate-glow" />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight text-fg mb-2">
        agent<span className="text-accent">chan</span>
      </h2>
      <p className="text-sm text-fg-3 mb-8 max-w-sm mx-auto leading-relaxed">
        {t("onboarding.welcomeDescription")}
      </p>
      <div className="flex items-center justify-center gap-4">
        <Button variant="accent" size="md" onClick={onGetStarted}>
          {t("onboarding.getStarted")}
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
        >
          {t("onboarding.skip")}
        </button>
      </div>
    </div>
  );
}

// --- Step 1: API Key ---

function ApiKeyStep({
  providers,
  apiKeys,
  saving,
  hasAnyCredentials,
  onSaveKey,
  onOAuthActiveChange,
  onContinue,
  onSkip,
}: {
  providers: ProviderInfo[];
  apiKeys: Record<string, string>;
  saving: boolean;
  hasAnyCredentials: boolean;
  onSaveKey: (provider: string, key: string) => Promise<void>;
  onOAuthActiveChange: (provider: string, active: boolean) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState(
    providers[0]?.name ?? "",
  );
  const [keyInput, setKeyInput] = useState("");

  const selectedInfo = providers.find((p) => p.name === selectedProvider);
  const isOAuth = !!selectedInfo?.oauth;
  const currentKeyMasked = apiKeys[selectedProvider] || "";
  const isConfigured = currentKeyMasked !== "";

  const handleSave = async () => {
    if (!keyInput) return;
    await onSaveKey(selectedProvider, keyInput);
    setKeyInput("");
  };

  return (
    <div className="w-full max-w-md animate-fade">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg mb-2 text-center">
        {t("onboarding.apiKeyTitle")}
      </h2>
      <p className="text-sm text-fg-3 mb-6 text-center leading-relaxed">
        {t("onboarding.apiKeyDescription")}
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em]">
            {t("provider.label")}
          </label>
          <Select
            value={selectedProvider}
            onChange={setSelectedProvider}
            options={providers.map((p) => ({ value: p.name, label: p.name }))}
            size="md"
          />
        </div>

        {isOAuth ? (
          <OAuthProviderCard
            providerName={selectedProvider}
            onChange={(active) => onOAuthActiveChange(selectedProvider, active)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={isConfigured ? "accent" : "muted"}>
                <Indicator color={isConfigured ? "accent" : "fg"} />
                {isConfigured
                  ? t("globalSettings.apiKeyConfigured")
                  : t("globalSettings.apiKeyEmpty")}
              </Badge>
              {isConfigured && currentKeyMasked && (
                <span className="text-xs text-fg-3 font-mono">{currentKeyMasked}</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder={t("globalSettings.apiKeyPlaceholder")}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="flex-1 px-4 py-2 text-sm bg-surface border border-edge/8 rounded-lg focus:outline-none focus:border-accent/30 text-fg-2 font-mono transition-colors"
              />
              <Button
                variant="accent"
                size="md"
                onClick={() => void handleSave()}
                disabled={!keyInput || saving}
              >
                {saving ? t("globalSettings.savingKey") : t("globalSettings.saveKey")}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 mt-8">
        {hasAnyCredentials ? (
          <Button variant="accent" size="md" onClick={onContinue}>
            {t("onboarding.continue")}
          </Button>
        ) : (
          <button
            onClick={onSkip}
            className="text-sm text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
          >
            {t("onboarding.skipForNow")}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Step 2: First Project (Template Picker) ---

function TemplatePickerStep({
  creatingSlug,
  onPick,
  onBrowseAll,
}: {
  creatingSlug: string | null;
  onPick: (slug: string, name: string) => void;
  onBrowseAll: () => void;
}) {
  const { t } = useI18n();
  const { data: allTemplates, isLoading } = useTemplates();
  const templates: TemplateMeta[] | null = isLoading
    ? null
    : allTemplates
      ? FEATURED_SLUGS.map((slug) =>
          allTemplates.find((tpl) => tpl.slug === slug),
        ).filter((tpl): tpl is TemplateMeta => tpl !== undefined)
      : [];

  return (
    <div className="w-full max-w-2xl animate-fade">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg mb-2 text-center">
        {t("onboarding.firstProjectTitle")}
      </h2>
      <p className="text-sm text-fg-3 mb-6 text-center leading-relaxed">
        {t("onboarding.firstProjectDescription")}
      </p>

      {templates === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TemplateCardSkeleton />
          <TemplateCardSkeleton />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-fg-3 mb-4">{t("onboarding.noFeaturedTemplates")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <TemplateCard
              key={tpl.slug}
              tpl={tpl}
              busy={creatingSlug !== null}
              pending={creatingSlug === tpl.slug}
              onPick={() => onPick(tpl.slug, tpl.name)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-center mt-8">
        <button
          onClick={onBrowseAll}
          className="text-sm text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
        >
          {t("onboarding.moreTemplates")}
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  tpl,
  busy,
  pending,
  onPick,
}: {
  tpl: TemplateMeta;
  busy: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const coverUrl = tpl.hasCover
    ? `${BASE}/templates/${encodeURIComponent(tpl.slug)}/cover`
    : null;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className="group text-left flex flex-col bg-base border border-edge/8 rounded-xl overflow-hidden hover:border-accent/30 hover:bg-surface transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
    >
      <div className="aspect-[16/9] bg-surface/60 overflow-hidden relative">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-3xl text-fg-4/60 uppercase">
              {tpl.name.slice(0, 1)}
            </span>
          </div>
        )}
        {pending && (
          <div className="absolute inset-0 bg-void/60 flex items-center justify-center">
            <span className="text-xs text-fg-2 font-mono">
              {t("onboarding.creatingProject")}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-base font-semibold text-fg mb-1 group-hover:text-accent transition-colors">
          {tpl.name}
        </h3>
        {tpl.description && (
          <p className="text-xs text-fg-3 leading-relaxed line-clamp-2">
            {tpl.description}
          </p>
        )}
      </div>
    </button>
  );
}

function TemplateCardSkeleton() {
  return (
    <div className="flex flex-col bg-base border border-edge/8 rounded-xl overflow-hidden">
      <div className="aspect-[16/9] bg-surface/60 animate-pulse" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-surface/60 rounded w-2/3 animate-pulse" />
        <div className="h-3 bg-surface/60 rounded w-full animate-pulse" />
      </div>
    </div>
  );
}
