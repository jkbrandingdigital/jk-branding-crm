// src/components/attendance/words.ts
//
// What a punch is CALLED on screen — and it is NOT what the database
// calls it. Read this before changing anything here.
//
// The database names a punch by where the person went:
//     'Lunch out' = left the office for lunch
//     'Lunch in'  = came back in
//
// The office names it by what the person is entering:
//     "Lunch in"  = going in to lunch
//     "Lunch out" = coming out of lunch
//
// So for the two lunch punches the two vocabularies are EXACTLY
// REVERSED. Both are fair; the office's is the one people say out
// loud, so that is what the screens show, and the database keeps its
// own names because thousands of scans are already recorded under them.
//
// Everything that shows a punch to a person imports from here. One
// reversed map in one file is a thing you can check; three copies of it
// across three screens is a bug nobody will find, because each one
// looks right on its own.

export const KIND_WORDS: Record<string, string> = {
  In: 'In',
  'Lunch out': 'Lunch in',    // ← reversed on purpose
  'Lunch in': 'Lunch out',    // ← reversed on purpose
  'Step out': 'Stepped out',
  Back: 'Back',
  Out: 'Out',
}

/** The office's word for a database kind. */
export const says = (kind: string | null | undefined) =>
  kind ? KIND_WORDS[kind] ?? kind : '—'

/** What the big button says when this punch is next. */
export const BUTTON_WORDS: Record<string, string> = {
  In: 'Scan in',
  'Lunch out': 'Lunch in',
  'Lunch in': 'Lunch out',
  'Step out': 'Step out',
  Back: 'Back',
  Out: 'Scan out',
}

/** The order a normal day runs in, in the office's words. */
export const DAY_ORDER = ['In', 'Lunch in', 'Lunch out', 'Out'] as const