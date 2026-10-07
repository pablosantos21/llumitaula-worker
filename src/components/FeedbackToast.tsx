"use client";

import { useState, useCallback } from "react";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "warning" | "error";
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: "success" | "warning" | "error" = "success") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [],
  );

  return { toasts, showToast };
}

interface Props {
  toasts?: Toast[];
  // API legacy usada por BusinessApp: un único toast.
  message?: string | null;
  type?: "success" | "warning" | "error";
}

function toastIcon(type: Toast["type"]) {
  if (type === "success") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5 text-emerald-400"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 ${type === "error" ? "text-red-400" : "text-amber-400"}`}
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625l6.28-10.875zM10 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function FeedbackToast({
  toasts,
  message,
  type = "success",
}: Props) {
  const list: Toast[] = [
    ...(toasts ?? []),
    ...(message ? [{ id: 0, message, type }] : []),
  ];
  if (list.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {list.map((toast) => (
        <div
          key={toast.id}
          className="transform transition-all duration-300 translate-y-0 opacity-100 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 w-full max-w-sm mx-auto"
        >
          <div className="shrink-0">{toastIcon(toast.type)}</div>
          <p className="text-sm font-medium flex-1">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
