"use client";

import { useState, useEffect } from "react";
import PrimaryButton from "./PrimaryButton";
import Textarea from "./Textarea";

interface Props {
  isOpen: boolean;
  student: { id: string; name: string } | null;
  onClose: () => void;
  onSave: (data: {
    studentId: string;
    noFirst: boolean;
    noSecond: boolean;
    noGarnish: boolean;
    noDessert: boolean;
    comments: string;
  }) => void;
}

export default function IncidentModal({
  isOpen,
  student,
  onClose,
  onSave,
}: Props) {
  const [noFirst, setNoFirst] = useState(false);
  const [noSecond, setNoSecond] = useState(false);
  const [noGarnish, setNoGarnish] = useState(false);
  const [noDessert, setNoDessert] = useState(false);
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (isOpen && student) {
      setNoFirst(false);
      setNoSecond(false);
      setNoGarnish(false);
      setNoDessert(false);
      setComments("");
    }
  }, [isOpen, student]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    onSave({
      studentId: student.id,
      noFirst,
      noSecond,
      noGarnish,
      noDessert,
      comments,
    });
  };

  const handleMarkAllGood = () => {
    if (!student) return;
    onSave({
      studentId: student.id,
      noFirst: false,
      noSecond: false,
      noGarnish: false,
      noDessert: false,
      comments: "",
    });
  };

  if (!isOpen || !student) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="bg-white rounded-t-3xl md:rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto w-full md:w-[600px] md:max-w-[90vw] relative">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{student.name}</h2>
          <button
            type="button"
            className="text-slate-400 p-2 -mr-2"
            onClick={onClose}
          >
            <span className="sr-only">Cerrar</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            {[
              {
                label: "No ha comido primero",
                key: "noFirst",
                value: noFirst,
                setter: setNoFirst,
              },
              {
                label: "No ha comido segundo",
                key: "noSecond",
                value: noSecond,
                setter: setNoSecond,
              },
              {
                label: "No ha comido guarnición",
                key: "noGarnish",
                value: noGarnish,
                setter: setNoGarnish,
              },
              {
                label: "No ha comido postre",
                key: "noDessert",
                value: noDessert,
                setter: setNoDessert,
              },
            ].map((item) => (
              <label
                key={item.key}
                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer touch-manipulation transition-colors ${
                  item.value
                    ? "border-red-100 bg-red-50"
                    : "border-slate-100"
                }`}
              >
                <span className="font-medium text-slate-700">
                  {item.label}
                </span>
                <input
                  type="checkbox"
                  checked={item.value}
                  onChange={(e) => item.setter(e.target.checked)}
                  className="w-6 h-6 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
              </label>
            ))}
          </div>

          <Textarea
            name="comments"
            label="Comentarios adicionales"
            placeholder="Detalla si es necesario..."
            value={comments}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setComments(e.target.value)
            }
          />

          <div className="pt-2 flex gap-3">
            <PrimaryButton
              variant="outline"
              className="flex-1"
              onClick={handleMarkAllGood}
            >
              Todo bien
            </PrimaryButton>
            <PrimaryButton type="submit" variant="primary" className="flex-[2]">
              Guardar Cambios
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
