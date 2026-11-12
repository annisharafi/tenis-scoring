import { describe, expect, it } from 'vitest'
import { startingRating, surveyPoints } from './survey'

describe('survey', () => {
  it('starts the weakest answers at base and the strongest at base + 5 × multiplier', () => {
    expect(startingRating({ lastPlayed: 'longAgo', serve: 'doubleFault', ret: 'oftenMiss' })).toBe(1000)
    expect(startingRating({ lastPlayed: 'thisWeek', serve: 'powerOrPlacement', ret: 'backWithPlacement' })).toBe(1500)
    expect(startingRating({ lastPlayed: 'lastWeek', serve: 'usuallyIn', ret: 'usuallyBack' })).toBe(1300)
  })

  it('fixes "never played before" at base whatever the other answers', () => {
    const survey = { lastPlayed: 'never', serve: 'powerOrPlacement', ret: 'backWithPlacement' } as const
    expect(startingRating(survey)).toBe(1000)
    expect(surveyPoints(survey)).toBe(4)
  })
})
