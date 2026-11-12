# Fair and Fun

A mobile web app for running social doubles tennis sessions. A host creates a session and shares the link. Players join from their phones, and the app keeps every court balanced round after round, so games stay close and fun regardless of skill mix.

## How it works

1. **Host creates a session**: name, number of courts, length in minutes, and scoring system (sudden death or advantage).
2. **Players join by link**: `/s/<code>` (codes look like `fun-4k7q`). No account needed; a name is enough.
3. **Quick survey**: three questions (when you last played, your serve, your return) set a starting rating.
4. **Host starts the game**: every round for the session is planned up front.
5. **Live scoring**: tap points on court; the counter calls 15/30/40, deuce or deciding point, and games.
6. **Ratings update, rounds re-pair**: each saved score updates ratings, and every round not yet played is re-paired.
7. **Results and share card**: standings at the end, plus an image card to share.

## Fairness rules

- **Ratings**: doubles Elo on team averages, scored by share of games won. K-factor starts high and settles as a player plays more.
- **Pairing**: each court aims for a favourite win chance of at most 60%. Repeat partners (especially from the previous round) and repeat opponents are penalised. Up to 12 players every split is tried; above that, a greedy high–low pairing is used.
- **Resting**: when players exceed court spots, nobody rests twice in a row. Those who have played most rest first.
- **Late joiners**: someone joining mid-session sits out the round in progress, and later rounds are re-planned to include them.

All tuning values (rating base, K, survey points, minutes per round, games per match, pairing penalties) live in [`src/config.ts`](src/config.ts).

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Vitest, Oxlint.

## Getting started

```bash
npm install
npm run dev       # start dev server
npm test          # run unit tests
npm run lint      # lint with Oxlint
npm run build     # type-check and build for production
npm run preview   # preview the production build
```

## Project structure

```
src/
  logic/       Pure game rules with unit tests: tennis scoring, rating, pairing, schedule, survey, standings
  data/        In-memory stand-ins for the backend (sessions, game, points, auth)
  screens/     One component per route (splash, settings, join, survey, players, game, live score, result, share)
  components/  Shared UI pieces
  share/       Share-card image drawing
  config.ts    Tuning values
```

## Status

The backend is mocked in memory (`src/data/`) and is planned to move to Supabase (anonymous auth, tables, realtime points). Until then, data lives only in the current browser tab, and opening an unknown session link loads a sample session.
