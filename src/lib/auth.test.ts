import { describe, it, expect } from 'vitest';
import { displayNameFor, peekName, clearNameCheckCache } from './auth';

describe('displayNameFor', () => {
  it('uses profile name when set', () => {
    expect(displayNameFor({ id: '1', email: 'x@y.com', name: 'rajeev' })).toBe('Rajeev');
  });

  it('falls back to email local-part', () => {
    expect(displayNameFor({ id: '1', email: 'mrrajeev18@gmail.com' })).toBe('Mrrajeev18');
  });

  it('returns empty for null user', () => {
    expect(displayNameFor(null)).toBe('');
  });
});

describe('name check cache', () => {
  it('clearNameCheckCache resets peek results', () => {
    clearNameCheckCache();
    expect(peekName('cached-name')).toBeNull();
  });
});
