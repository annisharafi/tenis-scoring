import { Route, Routes } from 'react-router'
import { GamePlayed } from './screens/GamePlayed'
import { GameSettings } from './screens/GameSettings'
import { Join } from './screens/Join'
import { Players } from './screens/Players'
import { Result } from './screens/Result'
import { ScoreCounter } from './screens/ScoreCounter'
import { ShareGame } from './screens/ShareGame'
import { ShareMemory } from './screens/ShareMemory'
import { Survey } from './screens/Survey'
import { Splash } from './screens/Splash'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/host/new" element={<GameSettings />} />
      <Route path="/s/:code" element={<Join />} />
      <Route path="/s/:code/share" element={<ShareGame />} />
      <Route path="/s/:code/about-you" element={<Survey />} />
      <Route path="/s/:code/players" element={<Players />} />
      <Route path="/s/:code/game" element={<GamePlayed />} />
      <Route path="/s/:code/match/:matchId/live" element={<ScoreCounter />} />
      <Route path="/s/:code/result" element={<Result />} />
      <Route path="/s/:code/share-card" element={<ShareMemory />} />
    </Routes>
  )
}
