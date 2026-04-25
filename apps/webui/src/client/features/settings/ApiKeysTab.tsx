import { useState } from "react";
import {
  useApiKeys,
  useConfig,
  useConfigMutations,
  useProviders,
} from "@/client/entities/config/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { Badge, Button, FormField, Indicator, SectionHeader, Select } from "@/client/shared/ui/index.js";
import { OAuthProviderCard } from "@/client/features/oauth/index.js";
import { ProviderForm, type ProviderFormData } from "./ProviderForm.js";

export function ApiKeysTab() {
  const { data: config } = useConfig();
  const { data: providers = [] } = useProviders();
  const { data: keys = {} } = useApiKeys();
  const {
    update,
    updateApiKey: mutateApiKey,
    deleteApiKey: mutateDeleteApiKey,
    saveCustomProvider: mutateSaveCustomProvider,
    deleteCustomProvider: mutateDeleteCustomProvider,
  } = useConfigMutations();
  const { t } = useI18n();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormData | null>(null);
  const updateForm = (patch: Partial<ProviderFormData>) => setForm((f) => f && { ...f, ...patch });

  const handleSaveKey = async (provider: string) => {
    const key = inputs[provider];
    if (!key) return;
    setSaving(provider);
    try {
      await mutateApiKey(provider, key);
      setInputs((prev) => ({ ...prev, [provider]: "" }));
    } finally {
      setSaving(null);
    }
  };

  const handleRemoveKey = async (provider: string) => {
    setSaving(provider);
    try {
      await mutateDeleteApiKey(provider);
    } finally {
      setSaving(null);
    }
  };

  const handleProviderChange = (provider: string) => void update({ provider });

  const handleModelChange = (model: string) => {
    if (model === config?.model) return;
    void update({ model });
  };

  const handleSubmitProvider = async () => {
    if (!form) return;
    const models = form.models.split(",").map((s) => s.trim()).filter(Boolean);
    if (!form.url.trim() || models.length === 0) return;
    if (form.mode === "add" && !form.name.trim()) return;
    await mutateSaveCustomProvider({
      name: form.name.trim(),
      url: form.url.trim(),
      format: form.format,
      models: models.map((id) => ({ id, name: id })),
    });
    setForm(null);
  };

  const handleDeleteProvider = async (name: string) => {
    await mutateDeleteCustomProvider(name);
  };

  const currentProvider = providers.find((p) => p.name === config?.provider);

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-10 animate-fade-slide">
      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.activeProvider")} description={t("globalSettings.activeProviderDesc")} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("provider.label")}>
            <Select
              value={config?.provider ?? ""}
              onChange={handleProviderChange}
              options={providers.map((p) => ({ value: p.name, label: p.name }))}
              size="md"
            />
          </FormField>
          <FormField label={t("model.label")}>
            <Select
              value={config?.model ?? ""}
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

      <section className="space-y-4">
        <SectionHeader title={t("customApi.providers")} description={t("customApi.providersDesc")} />
        <div className="space-y-3">
          {providers.filter((p) => p.custom).map((p) => form?.mode === "edit" && form.name === p.name ? (
            <ProviderForm
              key={p.name}
              form={form}
              updateForm={updateForm}
              onSubmit={handleSubmitProvider}
              onCancel={() => setForm(null)}
            />
          ) : (
            <div
              key={p.name}
              className="p-4 rounded-xl border border-edge/8 bg-elevated/30 space-y-2 cursor-pointer hover:border-edge/20 transition-colors"
              onClick={() => p.custom && setForm({
                mode: "edit",
                name: p.name,
                url: p.custom.url,
                models: p.models.map((m) => m.id).join(", "),
                format: p.custom.format,
              })}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{p.name}</span>
                  <span className="text-xs text-fg-4 font-mono">{p.custom!.format}</span>
                </div>
                <Button variant="danger" size="md" onClick={(e) => { e.stopPropagation(); void handleDeleteProvider(p.name); }}>
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
            <ProviderForm
              form={form}
              updateForm={updateForm}
              onSubmit={handleSubmitProvider}
              onCancel={() => setForm(null)}
            />
          ) : (
            <Button
              variant="ghost"
              size="md"
              onClick={() => setForm({ mode: "add", name: "", url: "", models: "", format: "openai-completions" })}
            >
              + {t("customApi.addProvider")}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title={t("globalSettings.apiKeys")} description={t("globalSettings.apiKeysDescription")} />
        <div className="space-y-4">
          {providers.map((p) => {
            if (p.oauth) {
              return <OAuthProviderCard key={p.name} providerName={p.name} />;
            }

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
