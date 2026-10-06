import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger";
  fullWidth?: boolean;
  children: ReactNode;
}

export default function PrimaryButton({
  variant = "primary",
  fullWidth = false,
  children,
  className = "",
  ...rest
}: Props) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed h-12 px-6 rounded-xl text-lg active:scale-[0.98]";

  const variants: Record<string, string> = {
    primary:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500",
    outline:
      "border-2 border-slate-200 text-slate-700 bg-white hover:border-slate-300 focus:ring-slate-400",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger:
      "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 focus:ring-red-500",
  };

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button
      type="button"
      className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
