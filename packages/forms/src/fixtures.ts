import type { ProfileSchema } from '@diggy/shared';

/** A realistic job-application form: 22 fillable controls + submit/reset/hidden. */
export const FIXTURE_HTML = `
<form id="application" action="/apply" method="post">
  <label for="fullName">Full name</label>
  <input id="fullName" name="fullName" type="text" />

  <label for="firstName">First name</label>
  <input id="firstName" name="firstName" type="text" autocomplete="given-name" />

  <label for="lastName">Last name</label>
  <input id="lastName" name="lastName" type="text" autocomplete="family-name" />

  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" />

  <label for="phone">Phone</label>
  <input id="phone" name="phone" type="tel" autocomplete="tel" />

  <label for="dob">Date of birth</label>
  <input id="dob" name="dob" type="date" />

  <label for="address">Address</label>
  <input id="address" name="address" type="text" />

  <label for="city">City</label>
  <input id="city" name="city" type="text" />

  <label for="state">State</label>
  <input id="state" name="state" type="text" />

  <label for="country">Country</label>
  <input id="country" name="country" type="text" />

  <label for="pincode">PIN code</label>
  <input id="pincode" name="pincode" type="text" autocomplete="postal-code" />

  <label for="college">College / University</label>
  <input id="college" name="college" type="text" />

  <label for="degree">Degree</label>
  <input id="degree" name="degree" type="text" />

  <label for="semester">Semester</label>
  <input id="semester" name="semester" type="text" />

  <label for="skills">Skills</label>
  <textarea id="skills" name="skills"></textarea>

  <label for="github">GitHub</label>
  <input id="github" name="github" type="url" />

  <label for="linkedin">LinkedIn</label>
  <input id="linkedin" name="linkedin" type="url" />

  <label for="portfolio">Portfolio</label>
  <input id="portfolio" name="portfolio" type="url" />

  <label for="workType">Work type</label>
  <select id="workType" name="workType">
    <option value="">Choose</option>
    <option value="Remote">Remote</option>
    <option value="Hybrid">Hybrid</option>
    <option value="Onsite">Onsite</option>
  </select>

  <label for="aadhaar">Aadhaar number</label>
  <input id="aadhaar" name="aadhaar" type="text" />

  <label for="resume">Resume</label>
  <input id="resume" name="resume" type="file" />

  <label for="code">Reference number</label>
  <input id="code" name="code" type="text" />

  <button type="submit" id="submit-btn">Submit</button>
  <input type="submit" id="submit-input" value="Send" />
  <input type="reset" id="reset-input" value="Reset" />
  <input type="hidden" name="csrf" value="tok" />
</form>
`;

/** Plaintext behind the locked `aadhaar` field — must never appear in a preview/consumer view. */
export const LOCKED_PLAINTEXT = '1234-5678-9012';

/** The one deliberately ambiguous control (label/name do not name any profile field). */
export const AMBIGUOUS_FIELD = 'code';

/** Expected value written for each control (keyed by the control's `name`). */
export const EXPECTED_VALUES: Record<string, string> = {
  fullName: 'Ada Lovelace',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+1-555-0100',
  dob: '1815-12-10',
  address: '12 Analytical Way',
  city: 'London',
  state: 'England',
  country: 'UK',
  pincode: 'SW1A 1AA',
  college: 'University of London',
  degree: 'BSc Mathematics',
  semester: '6',
  skills: 'mathematics, algorithms',
  github: 'https://github.com/ada',
  linkedin: 'https://linkedin.com/in/ada',
  portfolio: 'https://ada.dev',
  workType: 'Remote',
  aadhaar: '{{LOCKED:aadhaar}}',
  resume: 'ada-resume.pdf',
};

/**
 * A tokenized `ProfileSchema` as a consumer would receive it from the vault:
 * shared values are plaintext; `aadhaar` is a locked token.
 */
export function fixtureProfile(): ProfileSchema {
  return {
    fullName: { key: 'fullName', label: 'Full name', value: 'Ada Lovelace', visibility: 'shared' },
    email: { key: 'email', label: 'Email', value: 'ada@example.com', visibility: 'shared' },
    phone: { key: 'phone', label: 'Phone', value: '+1-555-0100', visibility: 'shared' },
    college: { key: 'college', label: 'College', value: 'University of London', visibility: 'shared' },
    degree: { key: 'degree', label: 'Degree', value: 'BSc Mathematics', visibility: 'shared' },
    semester: { key: 'semester', label: 'Semester', value: '6', visibility: 'shared' },
    skills: {
      key: 'skills',
      label: 'Skills',
      value: ['mathematics', 'algorithms'],
      visibility: 'shared',
    },
    links: {
      key: 'links',
      label: 'Links',
      value: { github: 'https://github.com/ada', linkedin: 'https://linkedin.com/in/ada', website: 'https://ada.dev' },
      visibility: 'shared',
    },
    resumeRef: { key: 'resumeRef', label: 'Resume', value: 'ada-resume.pdf', visibility: 'shared' },
    custom: [
      { key: 'dob', label: 'Date of birth', value: '1815-12-10', visibility: 'shared' },
      { key: 'address', label: 'Address', value: '12 Analytical Way', visibility: 'shared' },
      { key: 'city', label: 'City', value: 'London', visibility: 'shared' },
      { key: 'state', label: 'State', value: 'England', visibility: 'shared' },
      { key: 'country', label: 'Country', value: 'UK', visibility: 'shared' },
      { key: 'postalCode', label: 'PIN code', value: 'SW1A 1AA', visibility: 'shared' },
      { key: 'workType', label: 'Work type', value: 'Remote', visibility: 'shared' },
      { key: 'aadhaar', label: 'Aadhaar number', value: '{{LOCKED:aadhaar}}', visibility: 'locked' },
    ],
  };
}
