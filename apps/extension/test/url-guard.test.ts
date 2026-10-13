/**
 * URL/site-guard tests: `openVideo` must never treat a website — a URL *or* a
 * site name like "YouTube" — as something to play.
 */
import { describe, expect, it } from 'vitest';
import { looksLikeSite, looksLikeUrl, looksLikeWebsite } from '../src/agent-tools.js';

describe('looksLikeUrl', () => {
  it('recognises addresses that must go to openUrl, not openVideo', () => {
    for (const value of [
      'https://www.linkedin.com',
      'http://example.com',
      'www.linkedin.com',
      'linkedin.com',
      'github.com/orgs',
      'openai.com',
    ]) {
      expect(looksLikeUrl(value), value).toBe(true);
    }
  });

  it('leaves genuine video searches alone', () => {
    for (const value of ['MrBeast latest video', 'lofi beats', 'how to make a website', '']) {
      expect(looksLikeUrl(value), value).toBe(false);
    }
  });
});

describe('looksLikeSite', () => {
  it('catches site names, including with a leading verb', () => {
    for (const value of [
      'YouTube',
      'youtube',
      'open YouTube',
      'play youtube',
      'Go to YouTube',
      'youtube music',
      'yt shorts',
      'Instagram',
      'linkedin',
      'gmail',
      'google maps',
    ]) {
      expect(looksLikeSite(value), value).toBe(true);
    }
  });

  it('does not mistake a real video query for a site', () => {
    for (const value of ['MrBeast latest video', 'lofi beats', 'play Drive trailer', 'top 10 songs', '']) {
      expect(looksLikeSite(value), value).toBe(false);
    }
  });
});

describe('looksLikeWebsite', () => {
  it('is true for both a URL and a site name', () => {
    expect(looksLikeWebsite('www.linkedin.com')).toBe(true);
    expect(looksLikeWebsite('open YouTube')).toBe(true);
    expect(looksLikeWebsite("play MrBeast's latest video")).toBe(false);
  });
});
