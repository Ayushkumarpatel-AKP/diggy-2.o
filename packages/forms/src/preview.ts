/**
 * Preview: the human-facing plan shown *before* anything is written.
 * Entries carry plaintext for shared fields and `{{LOCKED:key}}` tokens for
 * locked ones, so the preview itself never reveals a secret.
 */
import type { FieldDescriptor, FieldMatch, FormPreview, PreviewEntry, PreviewOptions } from './types.js';

function labelOf(field: FieldDescriptor): string {
  return field.label || field.ariaLabel || field.placeholder || field.name || field.id;
}

/** Build a preview from a match result. Never submits. */
export function buildPreview(matches: FieldMatch[], options: PreviewOptions = {}): FormPreview {
  const entries: PreviewEntry[] = [];
  const questions = [];

  for (const match of matches) {
    if (match.instruction) {
      entries.push({
        fieldId: match.field.id,
        label: labelOf(match.field),
        kind: match.instruction.kind,
        value: match.instruction.value,
        locked: match.instruction.locked,
        confidence: match.instruction.confidence,
        source: match.instruction.source,
      });
    }
    if (match.question) questions.push(match.question);
  }

  return {
    url: options.url,
    total: matches.length,
    fillable: entries.length,
    locked: entries.filter((entry) => entry.locked).length,
    entries,
    questions,
    submit: false,
  };
}
