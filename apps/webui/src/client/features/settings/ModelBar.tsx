import { useState } from "react";
import { useConfigState, useConfigDispatch } from "@/client/entities/config/index.js";
import type { ThinkingLevel, CustomApiFormat } from "@/client/entities/config/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { updateConfig, saveCustomProvider, fetchProviders, FORMAT_OPTIONS } from "@/client/entities/config/index.js";
import { Badge, CollapsiblePanel, Select, FormField, SegmentedControl, TextInput } from "@/client/shared/ui/index.js";

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "off" },
  { value: "low", label: "low" },
  { value: "medium", label: "med" },
  { value: "high", label: "high" },
];

export function ModelBar() {
  const config = useConfigState();
  const configDispatch = useConfigDispatch();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [tempInput, setTempInput] = useState(config.temperature?.toString() ?? "");
  const [maxTokensInput, setMaxTokensInput] = useState(config.maxTokens?.toString() ?? "");
  const [prevTemperature, setPrevTemperature] = useState(config.temperature);
  const [contextWindowInput, setContextWindowInput] = useState(config.contextWindow?.toString() ?? "");
  const [prevMaxTokens, setPrevMaxTokens] = useState(config.maxTokens);
  const [prevContextWindow, setPrevContextWindow] = useState(config.contextWindow);

  if (config.temperature !== prevTemperature) {
    setPrevTemperature(config.temperature);
    setTempInput(config.temperature?.toString() ?? "");
  }
  if (config.maxTokens !== prevMaxTokens) {
    setPrevMaxTokens(config.maxTokens);
    setMaxTokensInput(config.maxTokens?.toString() ?? "");
  }
  if (config.contextWindow !== prevContextWindow) {
    setPrevContextWindow(config.contextWindow);
    setContextWindowInput(config.contextWindow?.toString() ?? "");
  }

  const currentProvider = config.providers.find((p) => p.name === config.provider);
  const isCustom = !!currentProvider?.custom;

  const [customUrl, setCustomUrl] = useState(currentProvider?.custom?.url ?? "");
  const [customFormat, setCustomFormat] = useState<CustomApiFormat>(currentProvider?.custom?.format ?? "openai-completions");
  const [prevProvider, setPrevProvider] = useState(config.provider);

  if (config.provider !== prevProvider) {
    setPrevProvider(config.provider);
    setCustomUrl(currentProvider?.custom?.url ?? "");
    setCustomFormat(currentProvider?.custom?.format ?? "openai-completions");
  }

  const dispatchConfig = (result: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    contextWindow?: number;
    thinkingLevel?: ThinkingLevel;
  }) => {
    configDispatch({
      type: "SET_CONFIG",
      provider: result.provider,
      model: result.model,
      temperature: result.temperature,
      maxTokens: result.maxTokens,
      contextWindow: result.contextWindow,
      thinkingLevel: result.thinkingLevel,
    });
  };

  const handleProviderChange = async (provider: string) => {
    const result = await updateConfig({ provider });
    dispatchConfig(result);
  };

  const handleModelChange = async (model: string) => {
    if (model === config.model) return;
    const result = await updateConfig({ model });
    dispatchConfig(result);
  };

  const handleTemperatureSubmit = async () => {
    const trimmed = tempInput.trim();
    const newVal = trimmed === "" ? null : parseFloat(trimmed);
    if (newVal !== null && (isNaN(newVal) || newVal < 0 || newVal > 2)) return;
    if (newVal === (config.temperature ?? null)) return;
    const result = await updateConfig({ temperature: newVal });
    dispatchConfig(result);
  };

  const handleMaxTokensSubmit = async () => {
    const trimmed = maxTokensInput.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (newVal !== null && (isNaN(newVal) || newVal < 1)) return;
    if (newVal === (config.maxTokens ?? null)) return;
    const result = await updateConfig({ maxTokens: newVal });
    dispatchConfig(result);
  };

  const handleContextWindowSubmit = async () => {
    const trimmed = contextWindowInput.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (newVal !== null && (isNaN(newVal) || newVal < 1024)) return;
    if (newVal === (config.contextWindow ?? null)) return;
    const result = await updateConfig({ contextWindow: newVal });
    dispatchConfig(result);
  };

  const handleThinkingChange = async (level: ThinkingLevel) => {
    if (level === config.thinkingLevel) return;
    const result = await updateConfig({ thinkingLevel: level === "off" ? null : level });
    dispatchConfig(result);
  };

  const submitCustomProvider = async (overrides?: { url?: string; format?: CustomApiFormat }) => {
    if (!currentProvider?.custom) return;
    await saveCustomProvider({
      name: currentProvider.name,
      url: overrides?.url ?? customUrl,
      format: overrides?.format ?? customFormat,
      models: currentProvider.models.map((m) => ({ id: m.id, name: m.name })),
    });
    const providers = await fetchProviders();
    configDispatch({ type: "SET_PROVIDERS", providers });
  };

  const currentModel = currentProvider?.models.find((m) => m.id === config.model);
  const showThinking = isCustom || (currentModel?.reasoning ?? false);

  // Build compact param tags for collapsed view
  const paramTags: { label: string; key: string }[] = [];
  if (config.temperature != null) {
    paramTags.push({ label: `T:${config.temperature}`, key: "temp" });
  }
  if (config.thinkingLevel && config.thinkingLevel !== "off") {
    const short = config.thinkingLevel === "medium" ? "med" : config.thinkingLevel;
    paramTags.push({ label: short, key: "think" });
  }
  if (config.maxTokens != null) {
    paramTags.push({ label: `${config.maxTokens}tok`, key: "tokens" });
  }
  if (config.contextWindow != null) {
    const cwK = Math.round(config.contextWindow / 1000);
    paramTags.push({ label: `${cwK}k ctx`, key: "ctx" });
  }

  return (
    <div className="border-t border-edge/6">
      <CollapsiblePanel
        trigger={
          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full text-left px-3 py-2.5 group transition-all duration-200 cursor-pointer ${
              expanded ? "bg-elevated/40" : "hover:bg-elevated/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-fg-4 bg-elevated px-1.5 py-0.5 rounded flex-shrink-0">
                    {config.provider.slice(0, 3)}
                  </span>
                  <span className="text-[13px] text-fg-2 font-mono truncate">
                    {config.model || "not configured"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!expanded && paramTags.map(({ label, key }) => (
                  <Badge variant="param" key={key}>{label}</Badge>
                ))}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className={`text-fg-4 group-hover:text-fg-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                >
                  <path d="M2.5 3.5L5 6L7.5 3.5" />
                </svg>
              </div>
            </div>
          </button>
        }
        expanded={expanded}
      >
        <div className="px-3 pb-3 pt-2 space-y-3">
          <FormField label={t("provider.label")}>
            <Select
              value={config.provider}
              onChange={handleProviderChange}
              options={config.providers.map((p) => ({ value: p.name, label: p.name }))}
            />
          </FormField>

          {isCustom ? (
            <>
              <FormField label={t("customApi.url")}>
                <TextInput
                  mono
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onBlur={() => submitCustomProvider()}
                  onKeyDown={(e) => e.key === "Enter" && submitCustomProvider()}
                  placeholder={t("customApi.urlPlaceholder")}
                />
              </FormField>
              <FormField label={t("model.label")}>
                <Select
                  value={config.model}
                  onChange={handleModelChange}
                  options={currentProvider?.models.map((m) => ({ value: m.id, label: m.name })) ?? []}
                />
              </FormField>
              <FormField label={t("customApi.format")}>
                <Select
                  value={customFormat}
                  onChange={(v) => { setCustomFormat(v as CustomApiFormat); void submitCustomProvider({ format: v as CustomApiFormat }); }}
                  options={FORMAT_OPTIONS}
                />
              </FormField>
            </>
          ) : (
            <FormField label={t("model.label")}>
              <Select
                value={config.model}
                onChange={handleModelChange}
                options={currentProvider?.models.map((m) => ({ value: m.id, label: m.name })) ?? []}
              />
            </FormField>
          )}

          <div className="h-px bg-edge/4" />

          <FormField label={t("params.temperature")}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0" max="2" step="0.1"
                value={tempInput === "" ? "1" : tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                onMouseUp={handleTemperatureSubmit}
                onTouchEnd={handleTemperatureSubmit}
                className="flex-1 h-1.5 accent-accent bg-elevated rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
              />
              <input
                type="text"
                value={tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                onBlur={handleTemperatureSubmit}
                onKeyDown={(e) => e.key === "Enter" && handleTemperatureSubmit()}
                placeholder="auto"
                className="w-14 px-2 py-1 text-xs text-center bg-elevated border border-edge/8 rounded-md focus:outline-none focus:border-accent/40 text-fg-2 font-mono transition-colors"
              />
            </div>
          </FormField>

          <FormField label={t("params.maxTokens")}>
            <TextInput
              mono
              type="text"
              value={maxTokensInput}
              onChange={(e) => setMaxTokensInput(e.target.value)}
              onBlur={handleMaxTokensSubmit}
              onKeyDown={(e) => e.key === "Enter" && handleMaxTokensSubmit()}
              placeholder="16000"
            />
          </FormField>

          <FormField label={t("params.contextWindow")}>
            <TextInput
              mono
              type="text"
              value={contextWindowInput}
              onChange={(e) => setContextWindowInput(e.target.value)}
              onBlur={handleContextWindowSubmit}
              onKeyDown={(e) => e.key === "Enter" && handleContextWindowSubmit()}
              placeholder="128000"
            />
          </FormField>

          {showThinking && (
            <FormField label={t("params.thinking")}>
              <SegmentedControl
                options={THINKING_LEVELS}
                value={config.thinkingLevel ?? "off"}
                onChange={handleThinkingChange}
              />
            </FormField>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
