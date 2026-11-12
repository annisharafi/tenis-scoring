import { config } from '../config'

type SurveyConfig = typeof config.survey

export type Survey = {
  lastPlayed: keyof SurveyConfig['lastPlayed']
  serve: keyof SurveyConfig['serve']
  ret: keyof SurveyConfig['ret']
}

/** Sum of the points for each answer. "Never played before" counts as 0 here. */
export function surveyPoints(survey: Survey): number {
  const lastPlayed = config.survey.lastPlayed[survey.lastPlayed]
  return (
    (lastPlayed === 'base' ? 0 : lastPlayed) + config.survey.serve[survey.serve] + config.survey.ret[survey.ret]
  )
}

/** base + multiplier × points; "Never played before" fixes the rating at base. */
export function startingRating(survey: Survey): number {
  const { base, multiplier } = config.rating
  if (config.survey.lastPlayed[survey.lastPlayed] === 'base') return base
  return base + multiplier * surveyPoints(survey)
}
