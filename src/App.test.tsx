import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { THEME_STORAGE_KEY } from './theme';

describe('App', () => {
  it('renders the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Track every recording step of a song.',
    );
  });

  it('names every state in words, not colour alone', () => {
    render(<App />);
    for (const label of ['To do', 'In progress', 'Needs review', 'Done']) {
      expect(screen.getByText(label, { exact: false })).toBeInTheDocument();
    }
  });

  it('switches the theme and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
  });
});
