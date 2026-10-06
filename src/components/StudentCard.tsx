"use client";

import MealStatusBadge from "./MealStatusBadge";

export interface Student {
  id: string;
  name: string;
  classGroup: string;
  allergies?: string[];
  photoUrl?: string;
}

export interface MealRecord {
  studentId: string;
  date: string;
  ateFirst: boolean;
  ateSecond: boolean;
  ateGarnish: boolean;
  ateDessert: boolean;
  comments: string;
  status: "all_good" | "incident";
}

interface Props {
  student: Student;
  record?: MealRecord;
  onSelect?: (student: Student) => void;
}

export default function StudentCard({ student, record, onSelect }: Props) {
  const status = record?.status || "all_good";

  return (
    <article
      className="student-card bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-[0.98] transition-transform touch-manipulation cursor-pointer"
      data-student-id={student.id}
      data-student-name={student.name}
      data-current-status={status}
      onClick={() => onSelect?.(student)}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-lg overflow-hidden shrink-0">
          {student.photoUrl ? (
            <img
              src={student.photoUrl}
              alt={student.name}
              className="w-full h-full object-cover"
            />
          ) : (
            student.name.substring(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <h3 className="font-bold text-slate-900 leading-tight">
            {student.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {student.allergies && student.allergies.length > 0 && (
              <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                {student.allergies.join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="status-indicator">
        <MealStatusBadge status={status} />
      </div>
    </article>
  );
}
