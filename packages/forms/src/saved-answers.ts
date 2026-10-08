/**
 * Saved-answers library: pattern -> answer rules applied to fields the classifier
 * could not confidently name (e.g. "Why do you want this job?").
 */
import type { SavedAnswer } from './types.js';

/** Find the first rule whose pattern matches `label` (regex, then substring). */
export function findSavedAnswer(label: string, answers: readonly SavedAnswer[] | undefined): SavedAnswer | undefined {
  if (!answers) return undefined;
  const text = label.toLowerCase();
  for (const answer of answers) {
    if (!answer.pattern) continue;
    try {
      if (new RegExp(answer.pattern, 'i').test(label)) return answer;
    } catch {
      if (text.includes(answer.pattern.toLowerCase())) return answer;
    }
  }
  return undefined;
}

/** All rules whose pattern matches `label`. */
export function findSavedAnswers(label: string, answers: readonly SavedAnswer[] | undefined): SavedAnswer[] {
  if (!answers) return [];
  const text = label.toLowerCase();
  return answers.filter((answer) => {
    if (!answer.pattern) return false;
    try {
      return new RegExp(answer.pattern, 'i').test(label);
    } catch {
      return text.includes(answer.pattern.toLowerCase());
    }
  });
}

/** A small mutable library the settings UI can edit. */
export class SavedAnswersLibrary {
  private answers: SavedAnswer[];

  constructor(answers: readonly SavedAnswer[] = []) {
    this.answers = answers.map((answer) => ({ ...answer }));
  }

  list(): SavedAnswer[] {
    return this.answers.map((answer) => ({ ...answer }));
  }

  add(pattern: string, answer: string): void {
    const existing = this.answers.find((item) => item.pattern === pattern);
    if (existing) existing.answer = answer;
    else this.answers.push({ pattern, answer });
  }

  remove(pattern: string): void {
    this.answers = this.answers.filter((item) => item.pattern !== pattern);
  }

  match(label: string): SavedAnswer | undefined {
    return findSavedAnswer(label, this.answers);
  }
}
