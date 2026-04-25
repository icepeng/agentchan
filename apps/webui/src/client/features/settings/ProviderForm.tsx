import { FORMAT_OPTIONS, type CustomApiFormat } from "@/client/entities/config/index.js";
import { useI18n } from "@/client/i18n/index.js";
import { Button, FormField, Select, TextInput } from "@/client/shared/ui/index.js";

export type ProviderFormData = {
  mode: "add" | "edit";
  name: string;
  url: string;
  models: string;
  format: CustomApiFormat;
};

type ProviderFormProps = {
  form: ProviderFormData;
  updateForm: (patch: Partial<ProviderFormData>) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ProviderForm({ form, updateForm, onSubmit, onCancel }: ProviderFormProps) {
  const { t } = useI18n();
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
            <TextInput
              size="md"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder={t("customApi.providerNamePlaceholder")}
            />
          </FormField>
        )}
        <FormField label={t("customApi.url")}>
          <TextInput
            mono
            size="md"
            value={form.url}
            onChange={(e) => updateForm({ url: e.target.value })}
            placeholder={t("customApi.urlPlaceholder")}
          />
        </FormField>
        <FormField label={t("customApi.requestModel")}>
          <TextInput
            mono
            size="md"
            value={form.models}
            onChange={(e) => updateForm({ models: e.target.value })}
            placeholder={t("customApi.requestModelPlaceholder")}
          />
        </FormField>
        <FormField label={t("customApi.format")}>
          <Select
            value={form.format}
            onChange={(v) => updateForm({ format: v as CustomApiFormat })}
            options={FORMAT_OPTIONS}
            size="md"
          />
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
