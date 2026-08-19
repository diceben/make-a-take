import { Link } from 'react-router-dom';
import { decidedOf, nextStep, phaseSummaries, type PhaseSummary } from '../../lib/dashboard';
import { PHASE_LABELS, STATE_LABELS, type Phase } from '../../lib/journey';
import { timeAgo } from '../../lib/dashboard';
import type { Song } from '../../lib/model';
import { StateRing } from '../journey/StateRing';
import { Artwork } from './Artwork';
import './SongCard.css';

/**
 * One song, as a row you can read in about a second.
 *
 * The order is deliberate: what it is, then where it is, then what is next. The
 * seven dots are the middle of that — they say which phases are settled and
 * which one wants you, without a number that pretends the two are comparable.
 *
 * There is no percentage. A song's decisions are not equivalent to one another,
 * so the bar counts what is settled and says so in words beside it.
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
  const share = decided.total === 0 ? 0 : Math.round((decided.settled / decided.total) * 100);

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

        {/* The dots are the whole journey at a glance. Each carries its state
            in its accessible name, so the colour is never the only thing
            saying what it is. */}
        <ul className="card__phases" aria-label={`Phases of ${song.title}`}>
          {summaries.map((summary) => (
            <PhaseDot key={summary.key} summary={summary} songId={song.id} />
          ))}
        </ul>

        <div className="card__foot">
          <span className="card__bar" aria-hidden="true">
            <span className="card__fill" style={{ width: `${String(share)}%` }} />
          </span>
          <span className="card__decided">
            {decided.total === 0
              ? 'nothing decided yet'
              : `${decided.settled} of ${decided.total} settled`}
          </span>
          {updatedAt !== null && <span className="card__when">{timeAgo(updatedAt)}</span>}
        </div>

        {next !== null && (
          <p className="card__next">
            <span className="card__next-label">Next</span> {next}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * One phase as a ring and a word.
 *
 * A link and not a status control. The dashboard's job is to say where things
 * stand and then get out of the way — a phase holds many decisions, and there is
 * no single judgement to set from here that would not be a guess about which
 * one you meant. It takes you to the phase, where the judgements are.
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
