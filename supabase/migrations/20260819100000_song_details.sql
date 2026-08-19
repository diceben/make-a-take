-- What a song is, to a musician looking at a list of them.
--
-- Genre, tempo and key are how somebody picks a song out of six on a screen —
-- faster than the title, because the title is a word and these are the sound.
-- They are optional throughout: a song usually exists before its tempo is
-- settled, and demanding a number would only produce placeholders.
--
-- `archived_at` retires a song without deleting it. Nothing in this app deletes
-- work as a matter of course, and a song set aside is still a song you might
-- come back to — the list simply stops leading with it.

alter table public.songs add column genre text check (
  genre is null or length(btrim(genre)) between 1 and 60
);

-- The range is deliberately wide rather than "sensible": 40 covers a drone and
-- 300 covers drum and bass counted the fast way. A tool that argued with a
-- musician about tempo would be wrong more often than they were.
alter table public.songs add column bpm integer check (
  bpm is null or bpm between 20 and 400
);

-- Free text, not an enum. There are twenty-four common keys, and also Dorian,
-- also "F# / Gb", also "modal-ish, ends on the IV". An enum would be a fight.
alter table public.songs add column musical_key text check (
  musical_key is null or length(btrim(musical_key)) between 1 and 30
);

alter table public.songs add column archived_at timestamptz;

create index songs_archived_at_idx on public.songs (archived_at);
