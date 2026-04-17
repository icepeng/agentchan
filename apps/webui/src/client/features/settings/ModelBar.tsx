import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useConfig, useProviders, useConfigMutations } from "@/client/entities/config/index.js";
import type { ThinkingLevel } from "@/client/entities/config/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { Badge, CollapsiblePanel, Select, FormField, SegmentedControl, TextInput } from "@/client/shared/ui/index.js";

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "off" },
  { value: "low", label: "low" },
  { value: "medium", label: "med" },
  { value: "high", label: "high" },
];

export function ModelBar() {
  const { data: config } = useConfig();
  const { data: providers = [] } = useProviders();
  const { update } = useConfigMutations();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [tempInput, setTempInput] = useState(config?.temperature?.toString() ?? "");
  const [maxTokensInput, setMaxTokensInput] = useState(config?.maxTokens?.toString() ?? "");
  const [prevTemperature, setPrevTemperature] = useState(config?.temperature);
  const [contextWindowInput, setContextWindowInput] = useState(config?.contextWindow?.toString() ?? "");
  const [prevMaxTokens, setPrevMaxTokens] = useState(config?.maxTokens);
  const [prevContextWindow, setPrevContextWindow] = useState(config?.contextWindow);

  if (config && config.temperature !== prevTemperature) {
    setPrevTemperature(config.temperature);
    setTempInput(config.temperature?.toString() ?? "");
  }
  if (config && config.maxTokens !== prevMaxTokens) {
    setPrevMaxTokens(config.maxTokens);
    setMaxTokensInput(config.maxTokens?.toString() ?? "");
  }
  if (config && config.contextWindow !== prevContextWindow) {
    setPrevContextWindow(config.contextWindow);
    setContextWindowInput(config.contextWindow?.toString() ?? "");
  }

  // Until the first config GET resolves there's nothing to render — render a
  // placeholder rather than a spurious "google/" line.
  const provider = config?.provider ?? "";
  const model = config?.model ?? "";
  const currentProvider = providers.find((p) => p.name === provider);

  const handleProviderChange = (next: string) => void update({ provider: next });
  const handleModelChange = (next: string) => {
    if (next === model) return;
    void update({ model: next });
  };

  const handleTemperatureSubmit = () => {
    const trimmed = tempInput.trim();
    const newVal = trimmed === "" ? null : parseFloat(trimmed);
    if (newVal !== null && (isNaN(newVal) || newVal < 0 || newVal > 2)) return;
    if (newVal === (config?.temperature ?? null)) return;
    void update({ temperature: newVal });
  };

  const handleMaxTokensSubmit = () => {
    const trimmed = maxTokensInput.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (newVal !== null && (isNaN(newVal) || newVal < 1)) return;
    if (newVal === (config?.maxTokens ?? null)) return;
    void update({ maxTokens: newVal });
  };

  const handleContextWindowSubmit = () => {
    const trimmed = contextWindowInput.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (newVal !== null && (isNaN(newVal) || newVal < 1024)) return;
    if (newVal === (config?.contextWindow ?? null)) return;
    void update({ contextWindow: newVal });
  };

  const handleThinkingChange = (level: ThinkingLevel) => {
    if (level === config?.thinkingLevel) return;
    void update({ thinkingLevel: level === "off" ? null : level });
  };

  const currentModel = currentProvider?.models.find((m) => m.id === model);
  const showThinking = !!currentProvider?.custom || (currentModel?.reasoning ?? false);

  // Build compact param tags for collapsed view
  const paramTags: { label: string; key: string }[] = [];
  if (config?.temperature != null) {
    paramTags.push({ label: `T:${config.temperature}`, key: "temp" });
  }
  if (config?.thinkingLevel && config.thinkingLevel !== "off") {
    const short = config.thinkingLevel === "medium" ? "med" : config.thinkingLevel;
    paramTags.push({ label: short, key: "think" });
  }
  if (config?.maxTokens != null) {
    paramTags.push({ label: `${config.maxTokens}tok`, key: "tokens" });
  }
  if (config?.contextWindow != null) {
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
                    {provider.slice(0, 3)}
                  </span>
                  <span className="text-[13px] text-fg-2 font-mono truncate">
                    {model || "not configured"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!expanded && paramTags.map(({ label, key }) => (
                  <Badge variant="param" key={key}>{label}</Badge>
                ))}
                <ChevronDown
                  size={10}
                  strokeWidth={1.5}
                  className={`text-fg-4 group-hover:text-fg-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </button>
        }
        expanded={expanded}
      >
        <div className="px-3 pb-3 pt-2 space-y-3">
          <FormField label={t("provider.label")}>
            <Select
              value={provider}
              onChange={handleProviderChange}
              options={providers.map((p) => ({ value: p.name, label: p.name }))}
            />
          </FormField>

          <FormField label={t("model.label")}>
            <Select
              value={model}
              onChange={handleModelChange}
              options={currentProvider?.models.map((m) => ({ value: m.id, label: m.name })) ?? []}
            />
          </FormField>

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
                value={config?.thinkingLevel ?? "off"}
                onChange={handleThinkingChange}
              />
            </FormField>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
