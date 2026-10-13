/**
 * Voice-approval tests: turning a spoken reply into an allow/deny decision.
 */
import { describe, expect, it } from 'vitest';
import { approvalQuestion, interpretApproval, speechDurationMs } from '../src/voice-approval.js';

describe('interpretApproval', () => {
  it('reads obvious yeses and noes', () => {
    for (const yes of ['yes', 'Yeah', 'ok', 'sure', 'do it', 'go ahead', 'haan', 'theek hai']) {
      expect(interpretApproval(yes), yes).toBe(true);
    }
    for (const no of ['no', 'nope', 'cancel', 'stop', 'not now', "don't", 'nahi']) {
      expect(interpretApproval(no), no).toBe(false);
    }
  });

  it('returns null for anything that is not an answer', () => {
    expect(interpretApproval('')).toBeNull();
    expect(interpretApproval('   ')).toBeNull();
    expect(interpretApproval('what time is it')).toBeNull();
    expect(interpretApproval(undefined)).toBeNull();
  });

  it('a deny beats a yes in the same sentence', () => {
    expect(interpretApproval('yes but no, cancel')).toBe(false);
    expect(interpretApproval('don\u2019t do it')).toBe(false);
  });
});

describe('approvalQuestion', () => {
  it('joins the title and detail and asks for a yes/no', () => {
    expect(approvalQuestion('Send this?', 'Say hi to Priyanka.')).toBe(
      'Send this? Say hi to Priyanka. Say yes to allow, or no to stop.',
    );
  });

  it('handles a missing detail', () => {
    expect(approvalQuestion('Open bing.com?')).toContain('Say yes to allow, or no to stop.');
  });
});

describe('speechDurationMs', () => {
  it('grows with the sentence and is bounded', () => {
    expect(speechDurationMs('hi')).toBeLessThan(speechDurationMs('a much longer sentence to speak'));
    expect(speechDurationMs('x'.repeat(10_000))).toBe(6000);
  });
});
