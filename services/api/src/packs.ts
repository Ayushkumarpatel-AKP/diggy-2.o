/**
 * Student + Creator packs: link-only account resources.
 *
 * These providers have no usable OAuth API for Diggy (or their terms forbid
 * automated access), so Diggy stores **account links only — never credentials**.
 * The extension shows them as one-click cards; the API only serves the static
 * registry (plus per-user "linked" flags kept in local extension storage).
 *
 * // INTERFACE FOR INTEGRATION
 * listPacks(kind?: PackKind): readonly PackLink[]  // 'student' | 'creator'
 * // END INTERFACE FOR INTEGRATION
 */

export type PackKind = 'student' | 'creator';

export interface PackLink {
  id: string;
  kind: PackKind;
  name: string;
  description: string;
  /** Where the user manages their account. */
  url: string;
  /** Always `'link'` — Diggy never holds credentials for these. */
  auth: 'link';
}

export const STUDENT_PACK: readonly PackLink[] = [
  {
    id: 'sih',
    kind: 'student',
    name: 'Smart India Hackathon',
    description: 'National hackathon — problem statements, timelines and results.',
    url: 'https://www.sih.gov.in/',
    auth: 'link',
  },
  {
    id: 'leetcode',
    kind: 'student',
    name: 'LeetCode',
    description: 'Track your DSA practice streak and contest rating.',
    url: 'https://leetcode.com/',
    auth: 'link',
  },
  {
    id: 'codeforces',
    kind: 'student',
    name: 'Codeforces',
    description: 'Competitive programming contests and rating history.',
    url: 'https://codeforces.com/',
    auth: 'link',
  },
  {
    id: 'hackathons',
    kind: 'student',
    name: 'Hackathons',
    description: 'Discover hackathons on Unstop and Devfolio.',
    url: 'https://unstop.com/hackathons',
    auth: 'link',
  },
  {
    id: 'scholarships',
    kind: 'student',
    name: 'Scholarships',
    description: 'National Scholarship Portal — schemes, deadlines and status.',
    url: 'https://scholarships.gov.in/',
    auth: 'link',
  },
];

export const CREATOR_PACK: readonly PackLink[] = [
  {
    id: 'youtube-studio',
    kind: 'creator',
    name: 'YouTube Studio',
    description: 'Manage your channel, analytics and uploads.',
    url: 'https://studio.youtube.com/',
    auth: 'link',
  },
  {
    id: 'linkedin',
    kind: 'creator',
    name: 'LinkedIn',
    description: 'Professional posts, profile and page analytics.',
    url: 'https://www.linkedin.com/',
    auth: 'link',
  },
  {
    id: 'x',
    kind: 'creator',
    name: 'X',
    description: 'Posts, followers and engagement.',
    url: 'https://x.com/',
    auth: 'link',
  },
  {
    id: 'reddit',
    kind: 'creator',
    name: 'Reddit',
    description: 'Subreddits, posts and comment karma.',
    url: 'https://www.reddit.com/',
    auth: 'link',
  },
];

export function listPacks(kind?: PackKind): readonly PackLink[] {
  if (kind === 'student') return STUDENT_PACK;
  if (kind === 'creator') return CREATOR_PACK;
  return [...STUDENT_PACK, ...CREATOR_PACK];
}

export function getPackLink(id: string): PackLink | undefined {
  return listPacks().find((link) => link.id === id);
}
