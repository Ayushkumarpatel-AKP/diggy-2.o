import type { KdfParams } from './crypto.js';
import type { VaultData } from './profile.schema.js';

/** Fast Argon2id parameters so tests stay quick (production uses the defaults). */
export const CHEAP_PARAMS: KdfParams = {
  iterations: 1,
  memoryKiB: 1024,
  parallelism: 1,
  hashLength: 32,
};

export const TEST_PASSPHRASE = 'correct horse battery staple';

/** Distinctive plaintext strings that must never appear in the ciphertext blob or a token. */
export const PII_STRINGS = [
  'Ada Lovelace',
  'ada@example.com',
  '+1-555-0100',
  'University of London',
  '1234-5678-9012',
  'ABCDE1234F',
  '000111222333',
  'Why do you want this job',
];

export function sampleVaultData(): VaultData {
  return {
    fields: [
      { key: 'fullName', label: 'Full name', value: 'Ada Lovelace', visibility: 'shared' },
      { key: 'email', label: 'Email', value: 'ada@example.com', visibility: 'shared' },
      { key: 'phone', label: 'Phone', value: '+1-555-0100', visibility: 'shared' },
      { key: 'location', label: 'Location', value: 'London, UK', visibility: 'shared' },
      { key: 'college', label: 'College', value: 'University of London', visibility: 'shared' },
      { key: 'degree', label: 'Degree', value: 'BSc Mathematics', visibility: 'shared' },
      { key: 'semester', label: 'Semester', value: '6', visibility: 'shared' },
      {
        key: 'skills',
        label: 'Skills',
        value: ['mathematics', 'algorithms'],
        visibility: 'shared',
      },
      {
        key: 'links',
        label: 'Links',
        value: { github: 'https://github.com/ada', linkedin: 'https://linkedin.com/in/ada' },
        visibility: 'shared',
      },
      { key: 'aadhaar', label: 'Aadhaar', value: '1234-5678-9012', visibility: 'locked' },
      { key: 'pan', label: 'PAN', value: 'ABCDE1234F', visibility: 'locked' },
      { key: 'bank.account', label: 'Bank account', value: '000111222333', visibility: 'locked' },
    ],
    education: [
      {
        institution: 'University of London',
        degree: 'BSc',
        field: 'Mathematics',
        startYear: '1832',
        endYear: '1836',
      },
    ],
    experience: [
      {
        company: 'Analytical Engines Ltd',
        role: 'Mathematician',
        startDate: '1837',
        current: true,
        description: 'Wrote the first published algorithm',
      },
    ],
    projects: [{ name: 'Notes on the Analytical Engine', tech: ['paper'] }],
    certifications: ['First Programmer'],
    savedAnswers: [{ pattern: 'Why do you want this job', answer: 'To compute.' }],
  };
}
