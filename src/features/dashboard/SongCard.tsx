import { Link } from 'react-router-dom';
import {
  decidedOf,
  nextStep,
  phaseSummaries,
  timeAgo,
  type PhaseSummary,
} from '../../lib/dashboard';
import { PHASE_LABELS, PHASE_VERBS, STATE_LABELS, type Phase } from '../../lib/journey';
import type { Song } from '../../lib/model';
import { StateRing } from '../journey/StateRing';
import { Artwork } from './Artwork';
import './SongCard.css';

/**
 * One song, and the next thing it wants.
 *
 * The card leads with where the song is and what to do about it, not with what
 * it is made of — the tempo and the key are how you tell two cards apart, and
 * they sit beside the title doing that job and no other. Everything below is
 * about getting on with it.
 *
 * No percentage. A song's decisions are not equivalent — one in mastering
 * against thirty-one in the mix — so the figure is counted and named:
 * "2 / 12 decisions made".
 */
export function SongCard({
  song,
  phases,
  updatedAt,
}: {
  song: Song;
  phases: Phase[];
  /** When the song was last judged, which is the only "modified" that matters. */
  updatedAt: string | null;
}) {
  const summaries = phaseSummaries(phases);
  const decided = decidedOf(phases);
  const next = nextStep(phases);
  // The phase comes from the same answer as the words beside it. Working it out
  // separately is how the card came to label a mixing decision as writing.
  const here = next?.phase ?? 'capture';
  const state = summaries.find((one) => one.key === here)?.state ?? 'not_touched';
  const share = decided.total === 0 ? 0 : (decided.settled / decided.total) * 100;

  return (
    <li className="card">
      <Link className="card__hit" to={`/songs/${song.id}`}>
        <span className="visually-hidden">Open {song.title}</span>
      </Link>

      <Artwork song={song} className="card__art" />

      <div className="card__body">
        <div className="card__top">
          <h3 className="card__title">{song.title}</h3>
          <p className="card__facts">
            {[
              song.artist,
              song.genre,
              song.bpm === null ? null : `${String(song.bpm)} BPM`,
              song.musical_key,
            ]
              .filter((one): one is string => one !== null && one !== '')
              .map((fact, index) => (
                <span key={fact}>
                  {index > 0 && <span className="card__dot"> · </span>}
                  {fact}
                </span>
              ))}
          </p>
        </div>

        {/* Where it is, and what it wants — the two things you came for. */}
        <p className="card__where">
          <span className="card__phase" data-state={state}>
            {PHASE_LABELS[here]}
          </span>
          {next !== null && <span className="card__next">{next.what}</span>}
        </p>

        <div className="card__foot">
          <span className="card__bar" aria-hidden="true">
            <span className="card__fill" style={{ width: `${String(share)}%` }} />
          </span>
          <span className="card__decided">
            {decided.total === 0
              ? 'no decisions yet'
              : `${decided.settled} / ${decided.total} decisions made`}
          </span>
          {updatedAt !== null && <span className="card__when">{timeAgo(updatedAt)}</span>}
        </div>

        {/* The journey stays: it is the fastest answer to "what have I done and
            what is left", and each phase is its own way in. */}
        <ul className="card__phases" aria-label={`Journey of ${song.title}`}>
          {summaries.map((summary) => (
            <PhaseDot key={summary.key} summary={summary} songId={song.id} />
          ))}
        </ul>
      </div>

      {next !== null && (
        <Link className="card__go" to={`/songs/${song.id}/${here}`}>
          Continue {PHASE_VERBS[here]} <span aria-hidden="true">→</span>
        </Link>
      )}
    </li>
  );
}

/**
 * One phase as a ring and a word.
 *
 * A link and not a status control. A phase holds many decisions, and there is no
 * single judgement to set from a list that would not be a guess about which one
 * you meant. It takes you to the phase, where the judgements are.
 */
function PhaseDot({ summary, songId }: { summary: PhaseSummary; songId: string }) {
  return (
    <li className="dot">
      <Link
        className="dot__link"
        to={`/songs/${songId}/${summary.key}`}
        data-state={summary.state}
        aria-label={`${PHASE_LABELS[summary.key]}: ${
          summary.signedOff ? 'signed off' : STATE_LABELS[summary.state]
        }`}
      >
        <StateRing state={summary.state} />
        <span className="dot__label">{PHASE_LABELS[summary.key]}</span>
      </Link>
    </li>
  );
}
