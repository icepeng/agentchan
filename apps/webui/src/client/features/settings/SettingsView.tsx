import { useState, useEffect } from "react";
import { useUIState, useUIDispatch } from "@/client/app/context/UIContext.js";
import type { PageRoute } from "@/client/app/context/UIContext.js";
import { useConfigState, useConfigDispatch, updateConfig, fetchApiKeys, updateApiKey, deleteApiKey, saveCustomProvider, deleteCustomProvider, fetchProviders, FORMAT_OPTIONS } from "@/client/entities/config/index.js";
import type { ApiKeyStatus, CustomApiFormat, CustomProviderDef } from "@/client/entities/config/index.js";
import { useI18n, type LanguagePreference, type TranslationKey } from "@/client/i18n/index.js";
import { Badge, Button, IconButton, Indicator, SectionHeader, TabBar, Select, FormField, OptionCardGrid, TextInput } from "@/client/shared/ui/index.js";
import { useTheme, useThemeOptions } from "./useTheme.js";

type SettingsTab = "appearance" | "api-keys";

export function SettingsView() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();
  const route = ui.currentPage as Extract<PageRoute, { page: "settings" }>;
  const [tab, setTab] = useState<SettingsTab>(route.tab ?? "appearance");

  const tabLabels: Record<SettingsTab, string> = {
    appearance: t("globalSettings.appearance"),
    "api-keys": t("globalSettings.apiKeys"),
  };

  return (
    <div className="flex flex-col h-full bg-void">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-edge/6 bg-base/60">
        <IconButton
          onClick={() => uiDispatch({ type: "NAVIGATE", route: { page: "main" } })}
          title={t("settings.back")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <h2 className="font-display text-lg font-bold tracking-tight">{t("globalSettings.title")}</h2>
        <TabBar<SettingsTab>
          tabs={[
            { key: "appearance", label: tabLabels.appearance },
            { key: "api-keys", label: tabLabels["api-keys"] },
          ]}
          active={tab}
          onChange={setTab}
          className="ml-4"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "appearance" && <AppearanceTab />}
        {tab === "api-keys" && <ApiKeysTab />}
      </div>
    </div>
  );
}

// --- Appearance Tab ---

function AppearanceTab() {
  const { t } = useI18n();
  const { preference: themePref, setPreference: setThemePref } = useTheme();
  const themeOptions = useThemeOptions();
  const { preference: langPref, setPreference: setLangPref } = useI18n();

  const langOptions: { value: LanguagePreference; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      value: "system",
      label: t("globalSettings.langSystem"),
      desc: t("globalSettings.langSystemDesc"),
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      value: "en",
      label: t("globalSettings.langEn"),
      desc: "English",
      icon: <span className="text-sm font-bold font-mono leading-none select-none">EN</span>,
    },
    {
      value: "ko",
      label: t("globalSettings.langKo"),
      desc: "한국어",
      icon: <span className="text-sm font-bold font-mono leading-none select-none">KO</span>,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10 animate-fade-slide">
      {/* Theme */}
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.theme")} />
        <OptionCardGrid options={themeOptions} active={themePref} onChange={setThemePref} />
      </section>

      {/* Language */}
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.language")} />
        <OptionCardGrid options={langOptions} active={langPref} onChange={setLangPref} />
      </section>
    </div>
  );
}

// --- API Keys Tab ---

function ApiKeysTab() {
  const config = useConfigState();
  const configDispatch = useConfigDispatch();
  const { t } = useI18n();

  const [keys, setKeys] = useState<ApiKeyStatus>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [form, setForm] = useState<{ mode: "add" | "edit"; name: string; url: string; models: string; format: CustomApiFormat } | null>(null);
  const updateForm = (patch: Partial<NonNullable<typeof form>>) => setForm((f) => f && { ...f, ...patch });

  useEffect(() => {
    void fetchApiKeys().then(setKeys);
  }, []);

  const handleSaveKey = async (provider: string) => {
    const key = inputs[provider];
    if (!key) return;
    setSaving(provider);
    const updated = await updateApiKey(provider, key);
    setKeys(updated);
    setInputs((prev) => ({ ...prev, [provider]: "" }));
    setSaving(null);
  };

  const handleRemoveKey = async (provider: string) => {
    setSaving(provider);
    const updated = await deleteApiKey(provider);
    setKeys(updated);
    setSaving(null);
  };

  const handleProviderChange = async (provider: string) => {
    const result = await updateConfig({ provider });
    configDispatch({ type: "SET_CONFIG", provider: result.provider, model: result.model });
  };

  const handleModelChange = async (model: string) => {
    if (model === config.model) return;
    const result = await updateConfig({ model });
    configDispatch({ type: "SET_CONFIG", provider: result.provider, model: result.model });
  };

  const refreshProviders = async () => {
    const providers = await fetchProviders();
    configDispatch({ type: "SET_PROVIDERS", providers });
  };

  const handleSubmitProvider = async () => {
    if (!form) return;
    const models = form.models.split(",").map((s) => s.trim()).filter(Boolean);
    if (!form.url.trim() || models.length === 0) return;
    if (form.mode === "add" && !form.name.trim()) return;
    await saveCustomProvider({
      name: form.name.trim(),
      url: form.url.trim(),
      format: form.format,
      models: models.map((id) => ({ id, name: id })),
    });
    await refreshProviders();
    setForm(null);
  };

  const handleDeleteProvider = async (name: string) => {
    await deleteCustomProvider(name);
    await refreshProviders();
  };

  const currentProvider = config.providers.find((p) => p.name === config.provider);

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10 animate-fade-slide">
      {/* Active Provider & Model */}
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.activeProvider")} description={t("globalSettings.activeProviderDesc")} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("provider.label")}>
            <Select
              value={config.provider}
              onChange={handleProviderChange}
              options={config.providers.map((p) => ({ value: p.name, label: p.name }))}
              size="md"
            />
          </FormField>
          <FormField label={t("model.label")}>
            <Select
              value={config.model}
              onChange={handleModelChange}
              options={currentProvider?.models.map((m) => ({ value: m.id, label: m.name })) ?? []}
              size="md"
            />
          </FormField>
        </div>
        {currentProvider?.custom && (
          <div className="text-xs text-fg-3 font-mono px-1">
            {currentProvider.custom.url} · {currentProvider.custom.format}
          </div>
        )}
      </section>

      {/* Custom Providers */}
      <section className="space-y-4">
        <SectionHeader title={t("customApi.providers")} description={t("customApi.providersDesc")} />
        <div className="space-y-3">
          {config.providers.filter((p) => p.custom).map((p) => form?.mode === "edit" && form.name === p.name ? (
            <ProviderForm key={p.name} form={form} updateForm={updateForm} onSubmit={handleSubmitProvider} onCancel={() => setForm(null)} t={t} />
          ) : (
            <div key={p.name} className="p-4 rounded-xl border border-edge/8 bg-elevated/30 space-y-2 cursor-pointer hover:border-edge/20 transition-colors" onClick={() => p.custom && setForm({ mode: "edit", name: p.name, url: p.custom.url, models: p.models.map((m) => m.id).join(", "), format: p.custom.format })}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{p.name}</span>
                  <span className="text-xs text-fg-4 font-mono">{p.custom!.format}</span>
                </div>
                <Button variant="danger" size="md" onClick={(e) => { e.stopPropagation(); handleDeleteProvider(p.name); }}>
                  {t("globalSettings.removeKey")}
                </Button>
              </div>
              <div className="text-xs text-fg-3 font-mono truncate">{p.custom!.url}</div>
              <div className="text-xs text-fg-4">
                {p.models.map((m) => m.name).join(", ")}
              </div>
            </div>
          ))}

          {form?.mode === "add" ? (
            <ProviderForm form={form} updateForm={updateForm} onSubmit={handleSubmitProvider} onCancel={() => setForm(null)} t={t} />
          ) : (
            <Button variant="ghost" size="md" onClick={() => setForm({ mode: "add", name: "", url: "", models: "", format: "openai-completions" })}>
              + {t("customApi.addProvider")}
            </Button>
          )}
        </div>
      </section>

      {/* API Keys per Provider */}
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.apiKeys")} description={t("globalSettings.apiKeysDescription")} />
        <div className="space-y-4">
          {config.providers.map((p) => {
            const masked = keys[p.name] || "";
            const isConfigured = masked !== "";
            const isSaving = saving === p.name;

            return (
              <div
                key={p.name}
                className="p-4 rounded-xl border border-edge/8 bg-elevated/30 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-fg">{p.name}</span>
                    <Badge variant={isConfigured ? "accent" : "muted"}>
                      <Indicator color={isConfigured ? "accent" : "fg"} />
                      {isConfigured ? t("globalSettings.apiKeyConfigured") : t("globalSettings.apiKeyEmpty")}
                    </Badge>
                  </div>
                  {isConfigured && masked && (
                    <span className="text-xs text-fg-3 font-mono">{masked}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={t("globalSettings.apiKeyPlaceholder")}
                    value={inputs[p.name] || ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveKey(p.name)}
                    className="flex-1 px-4 py-2 text-sm bg-surface border border-edge/8 rounded-lg focus:outline-none focus:border-accent/30 text-fg-2 font-mono transition-colors"
                  />
                  <Button
                    variant="accent"
                    size="md"
                    onClick={() => handleSaveKey(p.name)}
                    disabled={!inputs[p.name] || isSaving}
                  >
                    {isSaving ? t("globalSettings.savingKey") : t("globalSettings.saveKey")}
                  </Button>
                  {isConfigured && (
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => handleRemoveKey(p.name)}
                      disabled={isSaving}
                    >
                      {t("globalSettings.removeKey")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// --- Shared form for add/edit custom provider ---

type ProviderFormData = { mode: "add" | "edit"; name: string; url: string; models: string; format: CustomApiFormat };

function ProviderForm({ form, updateForm, onSubmit, onCancel, t }: {
  form: ProviderFormData;
  updateForm: (patch: Partial<ProviderFormData>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  t: (key: TranslationKey) => string;
}) {
  const disabled = !form.url.trim() || !form.models.trim() || (form.mode === "add" && !form.name.trim());
  return (
    <div className="p-4 rounded-xl border border-accent/20 bg-elevated/30 space-y-3">
      {form.mode === "edit" && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-fg">{form.name}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {form.mode === "add" && (
          <FormField label={t("customApi.providerName")}>
            <TextInput size="md" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder={t("customApi.providerNamePlaceholder")} />
          </FormField>
        )}
        <FormField label={t("customApi.url")}>
          <TextInput mono size="md" value={form.url} onChange={(e) => updateForm({ url: e.target.value })} placeholder={t("customApi.urlPlaceholder")} />
        </FormField>
        <FormField label={t("customApi.requestModel")}>
          <TextInput mono size="md" value={form.models} onChange={(e) => updateForm({ models: e.target.value })} placeholder={t("customApi.requestModelPlaceholder")} />
        </FormField>
        <FormField label={t("customApi.format")}>
          <Select value={form.format} onChange={(v) => updateForm({ format: v as CustomApiFormat })} options={FORMAT_OPTIONS} size="md" />
        </FormField>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button variant="accent" size="md" onClick={() => void onSubmit()} disabled={disabled}>
          {form.mode === "add" ? t("common.create") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
