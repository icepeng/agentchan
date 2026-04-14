import { PenLine, Eye } from "lucide-react";
import { useUIState, type ViewMode } from "./UIContext.js";
import { useI18n } from "@/client/i18n/index.js";

interface EditModeToggleProps {
  // Parent owns the guarded toggle behavior (e.g. prompting on unsaved
  // changes); required to prevent accidental unguarded dispatches.
  onToggle: (nextMode: ViewMode) => void;
}

export function EditModeToggle({ onToggle }: EditModeToggleProps) {
  const ui = useUIState();
  const { t } = useI18n();

  const isEdit = ui.viewMode === "edit";
  const nextMode: ViewMode = isEdit ? "chat" : "edit";
  const Icon = isEdit ? Eye : PenLine;
  const label = isEdit ? t("editMode.switchToChat") : t("editMode.switchToEdit");

  return (
    <button
      onClick={() => onToggle(nextMode)}
      className="p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
      title={label}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
