import { NavLink } from 'react-router-dom'

export default function Nav() {
  return (
    <header className="nav">
      <div className="nav-brand">⚽ WC2026 Nation Predictor</div>
      <nav className="nav-links">
        <NavLink to="/" end>Leaderboard</NavLink>
        <NavLink to="/schedule">Schedule</NavLink>
        <NavLink to="/admin">Admin</NavLink>
      </nav>
    </header>
  )
}
