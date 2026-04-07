import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useI18n, type TranslationKey } from "@/client/i18n/index.js";
import { Button, TextInput } from "@/client/shared/ui/index.js";
import { type EditorLanguage } from "@/client/shared/ui/TextEditor.js";
import { SkillEditor } from "./SkillEditor.js";

export interface LibraryEditorConfig<T> {
  fetchList: () => Promise<T[]>;
  fetchItem: (name: string) => Promise<string>;
  createItem: (name: string, content: string) => Promise<void>;
  updateItem: (name: string, content: string) => Promise<void>;
  deleteItem: (name: string) => Promise<void>;
  getTemplate: (name: string) => string;
  getName: (item: T) => string;
  language?: EditorLanguage;
  showTokenCount?: boolean;
  enableSkillToggles?: boolean;
  labels: {
    newButton: TranslationKey;
    newTitle: TranslationKey;
    namePlaceholder: TranslationKey;
    selectToEdit: TranslationKey;
  };
}

export function LibraryEditorView<T>({
  config,
  renderItem,
}: {
  config: LibraryEditorConfig<T>;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<T[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadItems = useCallback(async () => {
    const list = await config.fetchList();
    setItems(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on fetchList identity, not entire config object
  }, [config.fetchList]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleSelect = async (name: string) => {
    const data = await config.fetchItem(name);
    setSelected(name);
    setContent(data);
    setCreating(false);
  };

  const handleSave = async (newContent: string) => {
    if (!selected) return;
    await config.updateItem(selected, newContent);
    await loadItems();
  };

  const handleDelete = async () => {
    if (!selected) return;
    await config.deleteItem(selected);
    setSelected(null);
    setContent("");
    await loadItems();
  };

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    await config.createItem(name, config.getTemplate(name));
    setCreating(false);
    setNewName("");
    await loadItems();
    await handleSelect(name);
  };

  return (
    <div className="flex h-full">
      {/* Left: List */}
      <div className="w-72 flex-shrink-0 border-r border-edge/6 flex flex-col bg-base/40">
        <div className="p-3">
          <button
            onClick={() => {
              setCreating(true);
              setSelected(null);
            }}
            className="w-full px-3 py-2 rounded-xl text-sm border border-dashed border-edge/10 hover:border-accent/30 hover:bg-accent/5 text-fg-3 hover:text-accent transition-all flex items-center gap-2"
          >
            <Plus size={12} strokeWidth={2.5} />
            {t(config.labels.newButton)}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {items.map((item) => {
            const name = config.getName(item);
            const isSelected = selected === name;
            return (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isSelected
                    ? "bg-elevated text-accent"
                    : "text-fg-2 hover:text-fg hover:bg-elevated/50"
                }`}
              >
                {renderItem(item, isSelected)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Editor */}
      <div className="flex-1 p-4">
        {creating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <h3 className="text-sm font-medium text-fg-2">{t(config.labels.newTitle)}</h3>
            <TextInput
              mono
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder={t(config.labels.namePlaceholder)}
              autoFocus
              className="w-64"
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                {t("library.cancel")}
              </Button>
              <Button
                variant="accent"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                {t("library.create")}
              </Button>
            </div>
          </div>
        ) : selected ? (
          <SkillEditor
            key={selected}
            content={content}
            onSave={handleSave}
            onDelete={handleDelete}
            language={config.language}
            showTokenCount={config.showTokenCount}
            enableSkillToggles={config.enableSkillToggles}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-3 text-sm">
            {t(config.labels.selectToEdit)}
          </div>
        )}
      </div>
    </div>
  );
}
