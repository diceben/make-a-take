/**
 * Client-side checks on the sign-in form. They exist to give a fast, clear
 * answer — never as a security measure. Supabase enforces its own rules server
 * side, and row level security is what actually protects anything.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type CredentialProblem = 'email-missing' | 'email-invalid' | 'password-too-short';

// Deliberately loose: the only authority on whether an address works is whether
// mail arrives. This catches typos like a missing @, nothing more.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkEmail(email: string): CredentialProblem | null {
  const trimmed = email.trim();
  if (trimmed === '') return 'email-missing';
  if (!EMAIL_SHAPE.test(trimmed)) return 'email-invalid';
  return null;
}

export function checkPassword(password: string): CredentialProblem | null {
  return password.length < MIN_PASSWORD_LENGTH ? 'password-too-short' : null;
}

export function describeProblem(problem: CredentialProblem): string {
  switch (problem) {
    case 'email-missing':
      return 'Enter your email address.';
    case 'email-invalid':
      return 'That does not look like an email address.';
    case 'password-too-short':
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
}
