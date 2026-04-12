import { PenLine, Eye } from "lucide-react";
import { useUIState, useUIDispatch, type ViewMode } from "./UIContext.js";
import { useI18n } from "@/client/i18n/index.js";

export function EditModeToggle() {
  const ui = useUIState();
  const uiDispatch = useUIDispatch();
  const { t } = useI18n();

  const isEdit = ui.viewMode === "edit";
  const nextMode: ViewMode = isEdit ? "chat" : "edit";
  const Icon = isEdit ? Eye : PenLine;
  const label = isEdit ? t("editMode.switchToChat") : t("editMode.switchToEdit");

  return (
    <button
      onClick={() => uiDispatch({ type: "SET_VIEW_MODE", mode: nextMode })}
      className="p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
      title={label}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
