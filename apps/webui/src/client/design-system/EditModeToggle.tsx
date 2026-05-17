import { PenLine, Eye } from "lucide-react";

interface EditModeToggleProps {
  isEdit: boolean;
  switchToChatLabel: string;
  switchToEditLabel: string;
  onToggle: () => void;
}

export function EditModeToggle({
  isEdit,
  switchToChatLabel,
  switchToEditLabel,
  onToggle,
}: EditModeToggleProps) {
  const Icon = isEdit ? Eye : PenLine;
  const label = isEdit ? switchToChatLabel : switchToEditLabel;

  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/8 transition-all"
      title={label}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
