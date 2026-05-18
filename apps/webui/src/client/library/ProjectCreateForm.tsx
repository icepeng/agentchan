import { useRef, useState } from "react";
import { useI18n } from "@/client/platform/index.js";

interface ProjectCreateFormProps {
  templateSlug: string;
  createFromTemplate: (projectName: string, templateSlug: string) => Promise<unknown>;
}

export function ProjectCreateForm({ templateSlug, createFromTemplate }: ProjectCreateFormProps) {
  const { t } = useI18n();
  const [nameInput, setNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (creating) return;
    const name = nameInput.trim();
    if (!name) {
      nameInputRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      await createFromTemplate(name, templateSlug);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-14 pt-8 border-t border-edge/8">
      <label
        className="block text-[10px] uppercase tracking-[0.24em] text-fg-4 font-mono mb-3"
        htmlFor="new-project-name"
      >
        {t("templates.nameLabel")}
      </label>
      <div className="flex items-end gap-4">
        <input
          id="new-project-name"
          ref={nameInputRef}
          data-testid="templates-name-input"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder={t("templates.namePlaceholder")}
          className="flex-1 bg-transparent border-b border-edge/12 focus:border-accent outline-none font-display text-xl text-fg placeholder:text-fg-4 py-2 px-0 transition-colors"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          data-testid="templates-begin-button"
          disabled={creating || !nameInput.trim()}
          className="group shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-void text-sm font-semibold uppercase tracking-[0.18em] hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {creating ? t("templates.loading") : t("templates.begin")}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            &rarr;
          </span>
        </button>
      </div>
    </div>
  );
}
