import { GRAMMAR } from "./grammar";
import { VERBAL } from "./verbal";
import { LOGICAL } from "./logical";
import { READING, LISTENING } from "./passages";

export type BankQ = {
  category: string;
  difficulty: number;
  passageKey?: string;
  passageText?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  timeLimit: number;
};

export const ALL_QUESTIONS: BankQ[] = [
  ...GRAMMAR,
  ...VERBAL,
  ...LOGICAL,
  ...READING,
  ...LISTENING,
];
