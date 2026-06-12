import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Leaderboard from './pages/Leaderboard'
import Schedule from './pages/Schedule'
import Admin from './pages/Admin'
import './App.css'

export default function App() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </>
  )
}
