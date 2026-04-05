import type { ReactNode } from "react";
import { Field } from "@base-ui/react/field";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, children, className }: FormFieldProps) {
  return (
    <Field.Root className={className}>
      <Field.Label className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.12em] mb-1.5 block">
        {label}
      </Field.Label>
      {children}
    </Field.Root>
  );
}
