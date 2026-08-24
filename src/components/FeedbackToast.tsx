interface Props {
  message: string | null;
  type: "success" | "warning" | "error";
}

export default function FeedbackToast({ message, type }: Props) {
  if (!message) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-6 right-6 z-[60] mx-auto flex w-full max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg ${
        type === "error" ? "bg-red-700" : "bg-gray-900"
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {type === "success" ? "✓" : "!"}
      </span>
      <span className="flex-1 text-sm font-medium">{message}</span>
    </div>
  );
}
