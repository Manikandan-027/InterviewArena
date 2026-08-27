export type CategoryKey =
  | "grammar"
  | "verbal"
  | "logical"
  | "reading"
  | "listening";

export interface Question {
  id: number;
  category: CategoryKey;
  difficulty: number;
  prompt: string;
  options: string[];
  timeLimit: number;
  passageKey: string | null;
  passageText: string | null;
  correctIndex: number;
  explanation: string;
}

export interface RoundResponse {
  category: CategoryKey;
  questions: Question[];
}

export interface GradedResult {
  questionId: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

export interface SubmitResponse {
  attempt: {
    id: number;
    score: number;
    correct: number;
    total: number;
    accuracy: number;
    durationMs: number;
    rating: string;
    emailSent: boolean;
  };
  results: GradedResult[];
}

export interface CategoryStat {
  category: CategoryKey;
  rounds: number;
  correct: number;
  total: number;
  accuracy: number;
  bestScore: number;
  xp: number;
  lastPlayedAt: string | null;
}

export interface AttemptBrief {
  id: number;
  category: CategoryKey;
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  rating: string;
  completedAt: string;
}

export interface Badge {
  id: string;
  label: string;
  desc: string;
  earned: boolean;
}

export interface Stats {
  totals: {
    xp: number;
    rounds: number;
    accuracy: number;
    correct: number;
    total: number;
    bestScore: number;
    streak: number;
  };
  byCategory: CategoryStat[];
  recent: AttemptBrief[];
  badges: Badge[];
}

export interface NotebookItem {
  id: number;
  category: CategoryKey;
  question: string;
  options: string[];
  correctIndex: number;
  userAnswer: number;
  createdAt: string;
}

export interface EmailItem {
  id: number;
  event: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}
