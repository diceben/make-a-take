import { describe, expect, it } from 'vitest';
import { checkEmail, checkPassword, describeProblem, MIN_PASSWORD_LENGTH } from './credentials';

describe('checkEmail', () => {
  it('accepts an ordinary address', () => {
    expect(checkEmail('ben@example.com')).toBeNull();
  });

  it('ignores surrounding whitespace', () => {
    expect(checkEmail('  ben@example.com  ')).toBeNull();
  });

  it('reports an empty field separately from a malformed one', () => {
    expect(checkEmail('')).toBe('email-missing');
    expect(checkEmail('   ')).toBe('email-missing');
    expect(checkEmail('ben')).toBe('email-invalid');
    expect(checkEmail('ben@example')).toBe('email-invalid');
    expect(checkEmail('ben @example.com')).toBe('email-invalid');
  });
});

describe('checkPassword', () => {
  it('accepts a password at the limit', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('rejects one character short', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('password-too-short');
  });
});

describe('describeProblem', () => {
  it('has a message for every problem', () => {
    const problems = ['email-missing', 'email-invalid', 'password-too-short'] as const;
    for (const problem of problems) {
      expect(describeProblem(problem)).toMatch(/\S/);
    }
  });
});
