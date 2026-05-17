import { Button, Dialog } from "@/client/design-system/index.js";
import { useI18n } from "@/client/platform/index.js";

interface DeleteConfirmDialogProps {
  path: string | null;
  type?: "file" | "dir";
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ path, type = "file", onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { t } = useI18n();
  const fileName = path?.split("/").pop() ?? "";

  const title = type === "dir" ? t("editMode.deleteFolderConfirmTitle") : t("editMode.deleteConfirmTitle");
  const message = type === "dir"
    ? t("editMode.deleteFolderConfirmMessage", { name: fileName })
    : t("editMode.deleteConfirmMessage", { name: fileName });

  return (
    <Dialog open={path !== null} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <div className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-fg">
          {title}
        </h3>
        <p className="text-sm text-fg-2">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {t("editMode.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t("editMode.deleteFile")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
