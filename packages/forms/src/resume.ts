/**
 * Résumé / projects / skills / links formatting.
 *
 * Turns the vault's structured sections into the strings a form expects. Accepts
 * loosely-typed sections (the caller may pass `@diggy/vault`'s `VaultData`), so
 * every read is duck-typed and defensive.
 */
import type { FieldKind } from './types.js';

export interface ResumeData {
  education?: readonly unknown[];
  experience?: readonly unknown[];
  projects?: readonly unknown[];
  certifications?: readonly string[];
}

function str(entry: unknown, key: string): string {
  if (!entry || typeof entry !== 'object') return '';
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function arr(entry: unknown, key: string): string[] {
  if (!entry || typeof entry !== 'object') return [];
  const value = (entry as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function range(start: string, end: string, current?: boolean): string {
  if (current) return start ? `${start} – present` : 'present';
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function formatEducation(education: readonly unknown[] | undefined): string {
  if (!education) return '';
  return education
    .map((entry) => {
      const name = str(entry, 'institution');
      const degree = str(entry, 'degree');
      const field = str(entry, 'field');
      const years = range(str(entry, 'startYear'), str(entry, 'endYear'));
      const detail = [degree, field].filter(Boolean).join(', ');
      return [name, detail, years ? `(${years})` : ''].filter(Boolean).join(' ').trim();
    })
    .filter(Boolean)
    .join('; ');
}

export function formatExperience(experience: readonly unknown[] | undefined): string {
  if (!experience) return '';
  return experience
    .map((entry) => {
      const role = str(entry, 'role');
      const company = str(entry, 'company');
      const title = role && company ? `${role} at ${company}` : role || company;
      const dates = range(str(entry, 'startDate'), str(entry, 'endDate'), Boolean((entry as Record<string, unknown>)?.current));
      return [title, dates ? `(${dates})` : ''].filter(Boolean).join(' ').trim();
    })
    .filter(Boolean)
    .join('; ');
}

export function formatProjects(projects: readonly unknown[] | undefined): string {
  if (!projects) return '';
  return projects
    .map((entry) => {
      const name = str(entry, 'name');
      const description = str(entry, 'description');
      const tech = arr(entry, 'tech');
      const techText = tech.length > 0 ? ` [${tech.join(', ')}]` : '';
      return [name, description].filter(Boolean).join(' — ') + techText;
    })
    .filter(Boolean)
    .join('; ');
}

export function formatSkills(skills: readonly string[] | undefined): string {
  return (skills ?? []).filter((skill) => typeof skill === 'string' && skill.length > 0).join(', ');
}

export function formatLinks(links: Record<string, string> | undefined): string {
  if (!links) return '';
  return Object.entries(links)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

/** A formatted string for a résumé-backed field kind, or `null` when empty. */
export function formatResumeValue(kind: FieldKind, resume: ResumeData): string | null {
  let text = '';
  switch (kind) {
    case 'education':
      text = formatEducation(resume.education);
      break;
    case 'experience':
      text = formatExperience(resume.experience);
      break;
    case 'projects':
      text = formatProjects(resume.projects);
      break;
    case 'certifications':
      text = formatSkills(resume.certifications);
      break;
    default:
      return null;
  }
  return text.length > 0 ? text : null;
}
