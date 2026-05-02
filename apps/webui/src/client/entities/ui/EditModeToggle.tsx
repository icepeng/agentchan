import { PenLine, Eye } from "lucide-react";
import {
  useViewState,
  useViewDispatch,
  type ViewMode,
} from "@/client/entities/view/index.js";
import { useI18n } from "@/client/i18n/index.js";

export function EditModeToggle() {
  const view = useViewState();
  const dispatch = useViewDispatch();
  const { t } = useI18n();

  if (view.view.kind !== "project") return null;

  const isEdit = view.view.mode === "edit";
  const nextMode: ViewMode = isEdit ? "chat" : "edit";
  const Icon = isEdit ? Eye : PenLine;
  const label = isEdit ? t("editMode.switchToChat") : t("editMode.switchToEdit");

  return (
    <button
      onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: nextMode })}
      className="p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
      title={label}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
