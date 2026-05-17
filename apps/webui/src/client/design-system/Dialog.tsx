import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";

const SIZE_MAP = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  size?: keyof typeof SIZE_MAP;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, modal = true, size = "md", children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm transition-opacity" />
        <BaseDialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className={`w-full ${SIZE_MAP[size]} bg-surface border border-edge/8 rounded-2xl shadow-lg shadow-void/50 animate-fade-slide`}>
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
