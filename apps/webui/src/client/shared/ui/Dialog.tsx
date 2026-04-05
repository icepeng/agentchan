import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, modal = true, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm transition-opacity" />
        <BaseDialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface border border-edge/8 rounded-2xl shadow-lg shadow-void/50 animate-fade-slide">
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
