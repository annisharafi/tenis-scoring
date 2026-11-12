// All tuning values and test mode. Change these without touching logic.
export const config = {
  ratingVisibility: 'test', // 'hidden' | 'host' | 'test'
  rating: { base: 1000, multiplier: 100, kStart: 60, kStep: 10, kMin: 20 },
  survey: {
    lastPlayed: { thisWeek: 1, lastWeek: 1, longAgo: 0, never: 'base' },
    serve: { doubleFault: 0, usuallyIn: 1, powerOrPlacement: 2 },
    ret: { oftenMiss: 0, usuallyBack: 1, backWithPlacement: 2 },
  },
  schedule: { minutesPerRound: 17, gamesPerMatch: 6 },
  pairing: {
    repeatPartnerPenalty: 80,
    repeatOpponentPenalty: 20,
    exhaustiveMaxPlayers: 12,
    // A court is fair while the favourite's predicted win chance stays at or under this.
    maxWinChance: 0.6,
  },
} as const
