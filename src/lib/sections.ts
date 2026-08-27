import type { CategoryKey } from "./types";

export interface SectionMeta {
  key: CategoryKey;
  label: string;
  short: string;
  blurb: string;
  icon: string;
  accent: string;
  soft: string;
  questionCount: number;
}

export const SECTIONS: SectionMeta[] = [
  {
    key: "grammar",
    label: "Grammar",
    short: "Grammar",
    blurb: "Tenses, error spotting, articles and interview-grade sentence drills.",
    icon: "pen",
    accent: "#34d399",
    soft: "rgba(52, 211, 153, 0.14)",
    questionCount: 5,
  },
  {
    key: "verbal",
    label: "Verbal & Vocabulary",
    short: "Verbal",
    blurb: "Synonyms, antonyms, idioms and one-word substitutions.",
    icon: "book",
    accent: "#f5b64a",
    soft: "rgba(245, 182, 74, 0.14)",
    questionCount: 5,
  },
  {
    key: "logical",
    label: "Logical Reasoning",
    short: "Logic",
    blurb: "Series, coding-decoding, syllogisms and everyday data puzzles.",
    icon: "shapes",
    accent: "#5cc8f5",
    soft: "rgba(92, 200, 245, 0.14)",
    questionCount: 5,
  },
  {
    key: "reading",
    label: "Reading Comprehension",
    short: "Reading",
    blurb: "A short passage, three questions — main idea to inference.",
    icon: "doc",
    accent: "#f472b6",
    soft: "rgba(244, 114, 182, 0.14)",
    questionCount: 3,
  },
  {
    key: "listening",
    label: "Listening Comprehension",
    short: "Listening",
    blurb: "An audio brief read aloud — answer from memory, no transcript.",
    icon: "ear",
    accent: "#a78bfa",
    soft: "rgba(167, 139, 250, 0.14)",
    questionCount: 3,
  },
];

export function sectionByKey(key: string | null | undefined): SectionMeta {
  return SECTIONS.find((s) => s.key === key) ?? SECTIONS[0];
}
