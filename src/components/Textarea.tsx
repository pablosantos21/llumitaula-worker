import type { TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export default function Textarea({
  name,
  id = name,
  label,
  placeholder,
  rows = 3,
  className = "",
  ...rest
}: Props) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700 ml-1">
          {label}
        </label>
      )}
      <textarea
        name={name}
        id={id}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none"
        {...rest}
      />
    </div>
  );
}
