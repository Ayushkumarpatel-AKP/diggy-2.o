/**
 * Gate — sensitive sites + irreversible approval (Node, always runs).
 *
 * The policy layer must deny banks/payments/password-managers/health portals by
 * default (for reads *and* actions), honour a per-site allow list, and require
 * confirmation for irreversible verbs. Unknown tools are denied (no default-open).
 */
import { decide, sensitiveSiteCategory, isSensitiveSite, isSiteAllowlisted } from '@diggy/policy';
import { assert, assertEqual } from '../harness.mjs';

export const name = 'gate-policy';
export const description = 'sensitive-site blocklist denies by default and irreversible actions require approval';
export const kind = 'node';

export async function run() {
  // Sensitive-site classification.
  assertEqual(sensitiveSiteCategory('https://www.hdfcbank.com/netbanking'), 'bank', 'HDFC netbanking');
  assertEqual(sensitiveSiteCategory('https://paypal.com/checkout'), 'payment', 'PayPal checkout');
  assertEqual(sensitiveSiteCategory('https://1password.com/vault'), 'password-manager', '1Password vault');
  assertEqual(sensitiveSiteCategory('https://mychart.example.org/'), 'health', 'MyChart');
  assertEqual(sensitiveSiteCategory('https://example.com/blog'), null, 'an ordinary site is not sensitive');
  assert(isSensitiveSite('https://secure.chase.com'), 'subdomain of a bank must match');

  // Deny for reads too — reading a bank is as dangerous as acting on it.
  const bankRead = decide('readPage', {}, { url: 'https://www.hdfcbank.com/netbanking' });
  assertEqual(bankRead.decision, 'deny', 'reading a bank must be denied');
  assert(/sensitive/i.test(bankRead.reason), 'the reason must cite the sensitive-site rule');

  const bankSend = decide('sendEmail', { to: 'a@b.com' }, { url: 'https://www.hdfcbank.com' });
  assertEqual(bankSend.decision, 'deny', 'acting on a bank must be denied');

  // The per-site allow list is the only escape hatch.
  assert(isSiteAllowlisted('https://www.hdfcbank.com', ['hdfcbank.com']), 'allowlist must match subdomains');
  const allowed = decide('readPage', {}, { url: 'https://www.hdfcbank.com/netbanking', siteAllowlist: ['hdfcbank.com'] });
  assertEqual(allowed.decision, 'allow', 'an allow-listed bank read may proceed');

  // Irreversible verbs → confirm.
  for (const tool of ['sendEmail', 'send', 'submit', 'submitForm', 'delete', 'purchase', 'pay', 'transfer']) {
    const result = decide(tool, { to: 'x@y.com' });
    assertEqual(result.decision, 'confirm', `${tool} must require confirmation`);
    assertEqual(result.category, 'irreversible', `${tool} must be irreversible`);
  }

  // Reversible tools may proceed.
  assertEqual(decide('readPage', {}).decision, 'allow', 'readPage is allowed');
  assertEqual(decide('createReminder', { title: 'x', dueAt: 'z' }).decision, 'allow', 'createReminder is a local write');

  // Unknown tools are denied — never default-open.
  const unknown = decide('frobnicate', {});
  assertEqual(unknown.decision, 'deny', 'an unknown tool must be denied');
  assertEqual(unknown.category, 'unknown', 'an unknown tool has category unknown');

  return 'sensitive sites denied (with allowlist override), irreversible verbs gated, unknown tools denied';
}
