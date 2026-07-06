import { describe, it, expect } from 'vitest';
import { nearestDeckValue } from './estimate';

const deck = ['1', '2', '3', '5', '8', '13', '21'];

describe('nearestDeckValue', () => {
  it('snaps a median to the nearest deck value', () => {
    expect(nearestDeckValue(4, deck)).toBe('3'); // tie 3/5 → keeps first (3)
    expect(nearestDeckValue(6, deck)).toBe('5');
    expect(nearestDeckValue(11, deck)).toBe('13');
    expect(nearestDeckValue(2, deck)).toBe('2');
    expect(nearestDeckValue(100, deck)).toBe('21');
  });

  it('returns the first card when median is null', () => {
    expect(nearestDeckValue(null, deck)).toBe('1');
  });

  it('returns empty string for an empty deck', () => {
    expect(nearestDeckValue(5, [])).toBe('');
  });
});
