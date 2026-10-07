"use client";

import { useState, useMemo } from "react";
import { MOCK_STUDENTS } from "../lib/mocks";
import StudentCard from "./StudentCard";
import type { Student } from "./StudentCard";
import IncidentModal from "./IncidentModal";
import FeedbackToast, { useToast } from "./FeedbackToast";

export default function SearchPageView() {
  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toasts, showToast } = useToast();

  const allStudents = MOCK_STUDENTS;

  const filteredStudents = useMemo(
    () =>
      allStudents.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, allStudents],
  );

  const handleSelect = (student: Student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    showToast('Marcado como "Ha comido bien"', "success");
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </a>
          <div className="flex-1 relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              placeholder="Buscar alumno..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-slate-100/50 border border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-sm"
            />
          </div>
        </div>
      </header>

      <div className="p-4 pb-24">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
          Resultados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      <IncidentModal
        isOpen={isModalOpen}
        student={selectedStudent}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
      <FeedbackToast toasts={toasts} />
    </>
  );
}
