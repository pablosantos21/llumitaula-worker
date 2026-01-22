export interface Student {
  id: string;
  name: string;
  classGroup: string; // e.g., "P3 A"
  allergies?: string[];
  photoUrl?: string; // Placeholder
}

export interface MealRecord {
  studentId: string;
  date: string;
  ateFirst: boolean;
  ateSecond: boolean;
  ateGarnish: boolean;
  ateDessert: boolean;
  comments: string;
  status: 'all_good' | 'incident';
}

export const CURRENT_MONITOR = {
  id: 'm1',
  name: 'Laura García',
  assignedClass: 'P3 A',
};

export const MOCK_STUDENTS: Student[] = [
  { id: '1', name: 'Ana Martínez', classGroup: 'P3 A', allergies: ['Gluten'] },
  { id: '2', name: 'Biel Roca', classGroup: 'P3 A' },
  { id: '3', name: 'Carla Soler', classGroup: 'P3 A' },
  { id: '4', name: 'David Vila', classGroup: 'P3 A' },
  { id: '5', name: 'Elena Puig', classGroup: 'P3 A', allergies: ['Lactosa'] },
  { id: '6', name: 'Ferran Mas', classGroup: 'P3 A' },
  { id: '7', name: 'Gemma Pou', classGroup: 'P3 A' },
  { id: '8', name: 'Hugo Sants', classGroup: 'P4 B' }, // Other class
  { id: '9', name: 'Irene Bosch', classGroup: 'P4 B' },
];

export const MOCK_RECORDS: Record<string, MealRecord> = {};
// We will simulate "today's" state on the client side mostly, or assume defaults.
