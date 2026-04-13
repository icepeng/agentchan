import { Dialog } from "@/client/shared/ui/Dialog.js";
import { Button } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";

interface CheckpointDialogProps {
  open: boolean;
  onConversationOnly: () => void;
  onWithFiles: () => void;
  onCancel: () => void;
}

export function CheckpointDialog({
  open,
  onConversationOnly,
  onWithFiles,
  onCancel,
}: CheckpointDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <div className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-fg">
          {t("checkpoint.title")}
        </h3>
        <p className="text-sm text-fg-2">
          {t("checkpoint.message")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="ghost" onClick={onConversationOnly}>
            {t("checkpoint.conversationOnly")}
          </Button>
          <Button variant="accent" onClick={onWithFiles}>
            {t("checkpoint.withFiles")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
