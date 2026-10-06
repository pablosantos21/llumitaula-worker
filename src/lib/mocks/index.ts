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

export interface DailySummary {
  totalKids: number;
  ateCount: number;
  incidentCount: number;
  pendingCount: number;
  allergiesCount: number;
  allergiesList: string[];
}

export interface Incident {
  id: string;
  studentId: string;
  studentName: string;
  classGroup: string;
  date: string;
  noFirst: boolean;
  noSecond: boolean;
  noGarnish: boolean;
  noDessert: boolean;
  comments: string;
  reviewed: boolean;
  requiresFamilySignature: boolean;
  sendNotification: boolean;
  createdBy: string;
  createdAt: string;
  familySeen: boolean;
  familyResponse: string;
  familyRespondedAt: string | null;
  monitorValidated: boolean;
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
  { id: '8', name: 'Hugo Sants', classGroup: 'P4 B' },
  { id: '9', name: 'Irene Bosch', classGroup: 'P4 B' },
];

export const MOCK_RECORDS: Record<string, MealRecord> = {};

export const MOCK_DAILY_SUMMARY: DailySummary = {
  totalKids: 9,
  ateCount: 5,
  incidentCount: 2,
  pendingCount: 2,
  allergiesCount: 2,
  allergiesList: ['Gluten', 'Lactosa'],
};

const today = new Date().toISOString().split('T')[0];

export const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'i1',
    studentId: '1',
    studentName: 'Ana Martínez',
    classGroup: 'P3 A',
    date: today,
    noFirst: true,
    noSecond: false,
    noGarnish: false,
    noDessert: true,
    comments: 'No li agrada el menjar d\'avui',
    reviewed: false,
    requiresFamilySignature: true,
    sendNotification: false,
    createdBy: 'm1',
    createdAt: new Date().toISOString(),
    familySeen: false,
    familyResponse: '',
    familyRespondedAt: null,
    monitorValidated: false,
  },
  {
    id: 'i2',
    studentId: '4',
    studentName: 'David Vila',
    classGroup: 'P3 A',
    date: today,
    noFirst: false,
    noSecond: true,
    noGarnish: true,
    noDessert: false,
    comments: 'Ha menjat poc',
    reviewed: false,
    requiresFamilySignature: false,
    sendNotification: true,
    createdBy: 'm1',
    createdAt: new Date().toISOString(),
    familySeen: false,
    familyResponse: '',
    familyRespondedAt: null,
    monitorValidated: false,
  },
  {
    id: 'i3',
    studentId: '8',
    studentName: 'Hugo Sants',
    classGroup: 'P4 B',
    date: today,
    noFirst: false,
    noSecond: false,
    noGarnish: false,
    noDessert: false,
    comments: '',
    reviewed: true,
    requiresFamilySignature: false,
    sendNotification: false,
    createdBy: 'm1',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    familySeen: false,
    familyResponse: '',
    familyRespondedAt: null,
    monitorValidated: false,
  },
  {
    id: 'i4',
    studentId: '3',
    studentName: 'Carla Soler',
    classGroup: 'P3 A',
    date: today,
    noFirst: false,
    noSecond: false,
    noGarnish: false,
    noDessert: false,
    comments: 'No ha volgut menjar el peix',
    reviewed: false,
    requiresFamilySignature: true,
    sendNotification: true,
    createdBy: 'm1',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    familySeen: true,
    familyResponse: 'Ho parlarem a casa, gràcies.',
    familyRespondedAt: new Date(Date.now() - 3600000).toISOString(),
    monitorValidated: false,
  },
];
