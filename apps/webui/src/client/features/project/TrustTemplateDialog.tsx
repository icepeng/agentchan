import { useState } from "react";
import { Dialog } from "@/client/shared/ui/Dialog.js";
import { Button } from "@/client/shared/ui/index.js";
import { useI18n } from "@/client/i18n/index.js";

interface TrustTemplateDialogProps {
  open: boolean;
  templateName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function TrustTemplateDialog({
  open,
  templateName,
  onCancel,
  onConfirm,
}: TrustTemplateDialogProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !confirming) onCancel(); }}>
      <div className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-fg">
          {t("templates.trustTitle", { name: templateName })}
        </h3>
        <p className="text-sm text-fg-2 leading-relaxed">
          {t("templates.trustDescription")}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={confirming}>
            {t("templates.trustCancel")}
          </Button>
          <Button variant="accent" onClick={handleConfirm} disabled={confirming}>
            {confirming ? t("templates.loading") : t("templates.trustConfirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
