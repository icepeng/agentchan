import { Dialog } from "@/client/shared/ui/Dialog.js";
import { Button } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";

interface UnsavedDialogProps {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedDialog({ open, onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <div className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-fg">
          {t("editMode.unsavedTitle")}
        </h3>
        <p className="text-sm text-fg-2">
          {t("editMode.unsavedMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {t("editMode.cancel")}
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            {t("editMode.discard")}
          </Button>
          <Button variant="accent" onClick={onSave}>
            {t("editMode.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
