-- The built-in template every song starts from, one set per phase.
--
-- The split follows one rule and nothing else: if two people listening
-- separately would agree on the answer, it is a step. Otherwise it is a
-- decision. "Comped" is a step. "Vocal sits in mix" never will be.
--
-- The wording is a first draft written by somebody who does not make records.
-- It is meant to be edited: a template with owner_id set overrides this one
-- phase by phase, and per-song additions are saved as source 'custom'. Nothing
-- here is load-bearing.

do $$
declare
  v_template uuid;
  v_decision uuid;
  v_spec jsonb := '[
    {
      "key": "capture",
      "decisions": [
        {"title": "The idea exists somewhere", "subtitle": "Off the phone and into the project",
         "steps": ["Recorded", "Backed up"]},
        {"title": "Key and tempo", "subtitle": "Written down, not remembered",
         "steps": ["Noted"]}
      ]
    },
    {
      "key": "write",
      "decisions": [
        {"title": "Structure", "subtitle": "The order of the sections",
         "steps": ["Sections named"]},
        {"title": "Lyrics", "subtitle": "A full pass, start to finish",
         "steps": ["Draft written", "Read aloud"]},
        {"title": "Top line", "subtitle": "The melody over the chords", "steps": []}
      ]
    },
    {
      "key": "produce",
      "decisions": [
        {"title": "Arrangement", "subtitle": "What plays when",
         "steps": ["Sections blocked out"]},
        {"title": "Sounds", "subtitle": "Instruments and patches chosen", "steps": []},
        {"title": "Reference", "subtitle": "A record to hold this one against",
         "steps": ["Chosen", "Listened on monitors"]}
      ]
    },
    {
      "key": "track",
      "decisions": [
        {"title": "Drums", "subtitle": "Takes that hold the song up",
         "steps": ["Comped", "Timing checked"]},
        {"title": "Bass", "subtitle": "Locked to the drums",
         "steps": ["Comped", "Timing checked", "Tuning checked"]},
        {"title": "Guitars", "subtitle": "Parts and layers",
         "steps": ["Comped", "Tuning checked"]},
        {"title": "Keys", "subtitle": "Parts and layers", "steps": ["Comped"]},
        {"title": "Lead vocals", "subtitle": "The take the song stands on",
         "steps": ["Comped", "Timing checked", "Tuning checked"]},
        {"title": "Backing vocals", "subtitle": "Stacks and doubles",
         "steps": ["Comped", "Tuning checked"]}
      ]
    },
    {
      "key": "edit",
      "decisions": [
        {"title": "Timing", "subtitle": "Everything where it should sit",
         "steps": ["Drums", "Bass", "Guitars"]},
        {"title": "Tuning", "subtitle": "Corrected where it needs to be",
         "steps": ["Lead vocal", "Backing vocals"]},
        {"title": "Noise and breaths", "subtitle": "Cleaned without flattening",
         "steps": ["Passed through"]}
      ]
    },
    {
      "key": "mix",
      "decisions": [
        {"title": "Static balance", "subtitle": "Faders set for a starting point",
         "steps": ["Levels set", "Panning set"]},
        {"title": "Vocal sits in mix", "subtitle": "Level, EQ, compression",
         "steps": ["Level", "EQ", "Compression", "De-essing"]},
        {"title": "Vocal compression", "subtitle": "Amount dialled in",
         "steps": ["Threshold", "Ratio", "Attack", "Release"]},
        {"title": "Low end", "subtitle": "Kick and bass out of each other''s way",
         "steps": ["Checked on headphones"]},
        {"title": "Effects balance", "subtitle": "Reverb, delay, FX levels",
         "steps": ["Reverb", "Delay", "Modulation"]},
        {"title": "Automation pass", "subtitle": "Faders ridden", "steps": []}
      ]
    },
    {
      "key": "master",
      "decisions": [
        {"title": "Tonal balance", "subtitle": "Against the reference", "steps": []},
        {"title": "Loudness", "subtitle": "Sits with the records it will play next to",
         "steps": ["Reference matched", "True peak checked"]},
        {"title": "Final listen", "subtitle": "The last one before it is out",
         "steps": ["Slept on it"]}
      ]
    }
  ]'::jsonb;
  v_phase jsonb;
  v_dec jsonb;
  v_step text;
  v_dec_pos integer;
  v_step_pos integer;
begin
  for v_phase in select * from jsonb_array_elements(v_spec)
  loop
    insert into public.phase_templates (owner_id, key)
    values (null, (v_phase ->> 'key')::public.phase_key)
    returning id into v_template;

    v_dec_pos := 0;
    for v_dec in select * from jsonb_array_elements(v_phase -> 'decisions')
    loop
      insert into public.template_decisions (template_id, title, subtitle, position)
      values (v_template, v_dec ->> 'title', v_dec ->> 'subtitle', v_dec_pos)
      returning id into v_decision;

      v_step_pos := 0;
      for v_step in select * from jsonb_array_elements_text(v_dec -> 'steps')
      loop
        insert into public.template_steps (template_decision_id, label, position)
        values (v_decision, v_step, v_step_pos);
        v_step_pos := v_step_pos + 1;
      end loop;

      v_dec_pos := v_dec_pos + 1;
    end loop;
  end loop;
end;
$$;
