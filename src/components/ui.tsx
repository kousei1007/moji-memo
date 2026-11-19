"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean };

/** MD3 standard icon button (48px target). The label doubles as tooltip and accessible name. */
export function IconButton({ label, active, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        active
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-on-surface/8 active:bg-on-surface/12"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "filled" | "tonal" | "text" | "danger";
  icon?: ReactNode;
};

/** MD3 common button. */
export function Button({ variant = "text", icon, className = "", children, ...rest }: ButtonProps) {
  const styles = {
    filled: "bg-primary text-on-primary hover:brightness-110",
    tonal: "bg-secondary-container text-on-secondary-container hover:brightness-95",
    text: "text-primary hover:bg-primary/8",
    danger: "text-error hover:bg-error/8",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:opacity-40 ${
        icon ? "pl-4" : ""
      } ${styles} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
};

/** MD3 basic dialog on a scrim. Closes on Escape or scrim click. */
export function Dialog({ title, onClose, children, actions, wide }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select");
    (focusable ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col rounded-[28px] bg-surface-container-high shadow-xl outline-none ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between gap-2 pt-4 pr-3 pl-6">
          <h2 id={titleId} className="text-xl font-medium">
            {title}
          </h2>
          <IconButton label="閉じる" onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 text-sm text-on-surface-variant">{children}</div>
        {actions && <div className="flex flex-wrap justify-end gap-2 px-6 pt-2 pb-5">{actions}</div>}
        {!actions && <div className="pb-4" />}
      </div>
    </div>
  );
}

/** MD3 outlined text field with a persistent label. */
export const fieldClass =
  "w-full rounded-lg border border-outline bg-transparent px-4 py-3 text-base text-on-surface outline-none placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary";
