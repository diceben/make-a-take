import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createProject, createSong, listProjects, listSongs } from '../../lib/data';
import { PHASE_LABELS, type Project, type SongWithSteps } from '../../lib/model';
import { currentPhase, songProgress } from '../../lib/progress';
import { ProgressBar } from './ProgressBar';
import './SongsPage.css';

export function SongsPage() {
  const auth = useAuth();
  const { client } = auth;
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [songs, setSongs] = useState<SongWithSteps[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedProjects, loadedSongs] = await Promise.all([
        listProjects(client),
        listSongs(client),
      ]);
      setProjects(loadedProjects);
      setSongs(loadedSongs);
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your songs.');
      setState('failed');
    }
  }, [client]);

  useEffect(() => {
    // The rule flags any call that can reach setState. Here every setState in
    // load() happens after an await, which is the asynchronous pattern the rule
    // is meant to permit — it simply cannot see through the function call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const addProject = async (name: string) => {
    if (!userId) return;
    const project = await createProject(client, { name, ownerId: userId });
    setProjects((current) => [...current, project]);
  };

  const addSong = async (projectId: string, title: string) => {
    const song = await createSong(client, { projectId, title });
    setSongs((current) => [...current, song]);
  };

  if (state === 'loading') return <p role="status">Loading your songs…</p>;

  if (state === 'failed') {
    return (
      <>
        <h1>Your songs</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Your songs</h1>

      {projects.length === 0 && (
        <p className="app-lead">
          Start with a project — an album, an EP, or just somewhere to put the songs.
        </p>
      )}

      {projects.map((project) => (
        <section key={project.id} className="project">
          <h2 className="project__name">{project.name}</h2>
          <SongTable songs={songs.filter((song) => song.project_id === project.id)} />
          <AddThing
            label="Add a song"
            placeholder="Song title"
            submitLabel="Add song"
            onSubmit={(title) => addSong(project.id, title)}
          />
        </section>
      ))}

      <section className="project project--new">
        <AddThing
          label="New project"
          placeholder="Project name"
          submitLabel="Create project"
          onSubmit={addProject}
        />
      </section>
    </>
  );
}

function SongTable({ songs }: { songs: SongWithSteps[] }) {
  if (songs.length === 0) return <p className="project__empty">No songs in here yet.</p>;

  return (
    <ul className="song-list">
      {songs.map((song) => {
        const progress = songProgress(song.phase_states, song.track_states);
        const phase = currentPhase(song.phase_states, song.track_states);
        return (
          <li key={song.id} className="song-list__row">
            <Link className="song-list__title" to={`/songs/${song.id}`}>
              {song.title}
            </Link>
            <span className="song-list__phase">{phase ? PHASE_LABELS[phase] : 'Finished'}</span>
            <ProgressBar progress={progress} label={`Progress of ${song.title}`} />
          </li>
        );
      })}
    </ul>
  );
}

/** One-field form used for both projects and songs. */
function AddThing({
  label,
  placeholder,
  submitLabel,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-thing" onSubmit={(event) => void submit(event)}>
      <label className="add-thing__label">
        <span className="visually-hidden">{label}</span>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </label>
      <button type="submit" disabled={busy || value.trim() === ''}>
        {busy ? 'Saving…' : submitLabel}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
