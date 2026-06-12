import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TEAMS } from '../lib/teams'

const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || 'admin2026'

export default function Admin({ matches, nationPositions, onUpdate }) {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [tab, setTab] = useState('results')
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  // Manual match entry state
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [matchForm, setMatchForm] = useState({
    home_score: '', away_score: '', home_yellows: '', away_yellows: ''
  })
  const [goalForm, setGoalForm] = useState({ team: '', player_name: '', minute: '', is_own_goal: false })
  const [matchGoals, setMatchGoals] = useState([])

  // Position entry state
  const [posNation, setPosNation] = useState('')
  const [posValue, setPosValue] = useState('')

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  if (!authed) {
    return (
      <div className="page">
        <h2>⚙️ Admin</h2>
        <div className="admin-login">
          <input type="password" placeholder="Admin password" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && pw === ADMIN_PW) setAuthed(true) }} />
          <button className="btn-primary" onClick={() => { if (pw === ADMIN_PW) setAuthed(true); else setMsg('Wrong password') }}>
            Enter
          </button>
          {msg && <p className="form-error">{msg}</p>}
        </div>
      </div>
    )
  }

  const pendingMatches = matches.filter(m => m.status !== 'finished')
  const finishedMatches = matches.filter(m => m.status === 'finished')

  const selectMatch = async (match) => {
    setSelectedMatch(match)
    setMatchForm({
      home_score: match.home_score ?? '',
      away_score: match.away_score ?? '',
      home_yellows: match.home_yellows ?? '',
      away_yellows: match.away_yellows ?? ''
    })
    // Load existing goals for this match
    const { data } = await supabase.from('goal_scorers').select('*').eq('match_id', match.id)
    setMatchGoals(data || [])
  }

  const saveMatchResult = async () => {
    if (!selectedMatch) return
    setSaving(true)
    setMsg('')

    const { error } = await supabase.from('matches').update({
      home_score: parseInt(matchForm.home_score) || 0,
      away_score: parseInt(matchForm.away_score) || 0,
      home_yellows: parseInt(matchForm.home_yellows) || 0,
      away_yellows: parseInt(matchForm.away_yellows) || 0,
      status: 'finished'
    }).eq('id', selectedMatch.id)

    setSaving(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Match result saved')
    onUpdate()
  }

  const addGoal = async () => {
    if (!selectedMatch || !goalForm.player_name || !goalForm.team) return
    setSaving(true)
    const { data, error } = await supabase.from('goal_scorers').insert({
      match_id: selectedMatch.id,
      team: goalForm.team,
      player_name: goalForm.player_name,
      minute: parseInt(goalForm.minute) || 0,
      is_own_goal: goalForm.is_own_goal
    }).select()
    setSaving(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMatchGoals([...matchGoals, ...(data || [])])
    setGoalForm({ team: '', player_name: '', minute: '', is_own_goal: false })
    onUpdate()
  }

  const removeGoal = async (goalId) => {
    await supabase.from('goal_scorers').delete().eq('id', goalId)
    setMatchGoals(matchGoals.filter(g => g.id !== goalId))
    onUpdate()
  }

  const savePosition = async () => {
    if (!posNation || !posValue) return
    setSaving(true)
    const { error } = await supabase.from('nation_positions').upsert({
      nation: posNation,
      position: parseInt(posValue)
    }, { onConflict: 'nation' })
    setSaving(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg(`${posNation} set to position ${posValue}`)
    setPosNation('')
    setPosValue('')
    onUpdate()
  }

  const fetchFromApi = async () => {
    setFetching(true)
    setFetchMsg('Fetching from API-Football...')
    try {
      const res = await fetch('/api/football?endpoint=fixtures&params=league=1&season=2026')
      const data = await res.json()

      if (!data.response || data.response.length === 0) {
        setFetchMsg('No data returned from API. Check your API key.')
        setFetching(false)
        return
      }

      let updated = 0
      for (const fixture of data.response) {
        const f = fixture.fixture
        const teams = fixture.teams
        const goals = fixture.goals
        const score = fixture.score

        if (f.status.short !== 'FT' && f.status.short !== 'AET' && f.status.short !== 'PEN') continue

        // Find matching match in our DB by teams
        const homeTeam = teams.home.name
        const awayTeam = teams.away.name

        // Update match if we have it
        const { error } = await supabase.from('matches').update({
          home_score: goals.home ?? 0,
          away_score: goals.away ?? 0,
          status: 'finished',
          api_fixture_id: f.id
        }).match({ home_team: homeTeam, away_team: awayTeam })

        if (!error) updated++
      }

      // Also fetch events for finished matches
      const eventsRes = await fetch('/api/football?endpoint=fixtures/events&params=league=1&season=2026')
      // Note: events endpoint requires fixture ID, so this would need per-match calls
      // For now, admin can add goals manually or we can enhance later

      setFetchMsg(`Updated ${updated} match results. Goal scorers and yellow cards may need manual entry — API events endpoint requires per-match calls.`)
    } catch (err) {
      setFetchMsg(`Fetch error: ${err.message}`)
    }
    setFetching(false)
    onUpdate()
  }

  return (
    <div className="page">
      <h2>⚙️ Admin Panel</h2>

      <div className="admin-tabs">
        <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Match Results</button>
        <button className={tab === 'positions' ? 'active' : ''} onClick={() => setTab('positions')}>Final Positions</button>
        <button className={tab === 'api' ? 'active' : ''} onClick={() => setTab('api')}>Fetch from API</button>
        <button className={tab === 'seed' ? 'active' : ''} onClick={() => setTab('seed')}>Seed Matches</button>
      </div>

      {msg && <div className="admin-msg">{msg}</div>}

      {tab === 'results' && (
        <div className="admin-section">
          <h3>Enter Match Result</h3>
          <p className="page-subtitle">{pendingMatches.length} matches pending, {finishedMatches.length} finished</p>

          <div className="match-selector">
            <select onChange={e => {
              const m = matches.find(m => m.id === parseInt(e.target.value))
              if (m) selectMatch(m)
            }} value={selectedMatch?.id || ''}>
              <option value="">Select a match...</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.status === 'finished' ? '✅' : '⏳'} {m.home_team} vs {m.away_team} ({m.stage}{m.group_name ? ` — Grp ${m.group_name}` : ''})
                </option>
              ))}
            </select>
          </div>

          {selectedMatch && (
            <div className="match-edit">
              <h4>{selectedMatch.home_team} vs {selectedMatch.away_team}</h4>

              <div className="score-inputs">
                <div className="form-group">
                  <label>{selectedMatch.home_team} Goals</label>
                  <input type="number" min="0" value={matchForm.home_score}
                    onChange={e => setMatchForm({...matchForm, home_score: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>{selectedMatch.away_team} Goals</label>
                  <input type="number" min="0" value={matchForm.away_score}
                    onChange={e => setMatchForm({...matchForm, away_score: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>{selectedMatch.home_team} Yellow Cards</label>
                  <input type="number" min="0" value={matchForm.home_yellows}
                    onChange={e => setMatchForm({...matchForm, home_yellows: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>{selectedMatch.away_team} Yellow Cards</label>
                  <input type="number" min="0" value={matchForm.away_yellows}
                    onChange={e => setMatchForm({...matchForm, away_yellows: e.target.value})} />
                </div>
              </div>
              <button className="btn-primary" onClick={saveMatchResult} disabled={saving}>
                {saving ? 'Saving...' : 'Save Result'}
              </button>

              <div className="goals-section">
                <h4>Goal Scorers</h4>
                {matchGoals.map(g => (
                  <div key={g.id} className="goal-entry">
                    ⚽ {g.player_name} ({g.team}) {g.minute}' {g.is_own_goal ? '(OG)' : ''}
                    <button className="btn-small btn-danger" onClick={() => removeGoal(g.id)}>×</button>
                  </div>
                ))}
                <div className="goal-add">
                  <select value={goalForm.team} onChange={e => setGoalForm({...goalForm, team: e.target.value})}>
                    <option value="">Team...</option>
                    <option value={selectedMatch.home_team}>{selectedMatch.home_team}</option>
                    <option value={selectedMatch.away_team}>{selectedMatch.away_team}</option>
                  </select>
                  <input type="text" placeholder="Player name" value={goalForm.player_name}
                    onChange={e => setGoalForm({...goalForm, player_name: e.target.value})} />
                  <input type="number" placeholder="Min" min="0" max="120" value={goalForm.minute}
                    onChange={e => setGoalForm({...goalForm, minute: e.target.value})} />
                  <label className="checkbox-label">
                    <input type="checkbox" checked={goalForm.is_own_goal}
                      onChange={e => setGoalForm({...goalForm, is_own_goal: e.target.checked})} /> OG
                  </label>
                  <button className="btn-small" onClick={addGoal} disabled={saving}>Add</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'positions' && (
        <div className="admin-section">
          <h3>Set Final Position</h3>
          <p className="page-subtitle">Set final tournament position (1–48) as teams are eliminated.</p>
          <div className="position-form">
            <select value={posNation} onChange={e => setPosNation(e.target.value)}>
              <option value="">Select nation...</option>
              {TEAMS.map(t => (
                <option key={t.code} value={t.name}>
                  {t.flag} {t.name} {nationPositions[t.name] ? `(currently: ${nationPositions[t.name]})` : ''}
                </option>
              ))}
            </select>
            <input type="number" min="1" max="48" placeholder="Position" value={posValue}
              onChange={e => setPosValue(e.target.value)} />
            <button className="btn-primary" onClick={savePosition} disabled={saving}>Set</button>
          </div>

          <div className="positions-list">
            <h4>Current Positions</h4>
            {Object.entries(nationPositions).sort((a,b) => a[1] - b[1]).map(([nation, pos]) => {
              const t = TEAMS.find(t => t.name === nation)
              return <div key={nation} className="pos-entry">{pos}. {t?.flag} {nation}</div>
            })}
            {Object.keys(nationPositions).length === 0 && <p>No positions set yet.</p>}
          </div>
        </div>
      )}

      {tab === 'api' && (
        <div className="admin-section">
          <h3>Fetch Results from API-Football</h3>
          <p className="page-subtitle">Pull finished match scores automatically. Goal scorers can be added manually per match.</p>
          <button className="btn-primary" onClick={fetchFromApi} disabled={fetching}>
            {fetching ? 'Fetching...' : 'Fetch Latest Results'}
          </button>
          {fetchMsg && <div className="admin-msg">{fetchMsg}</div>}
        </div>
      )}

      {tab === 'seed' && <SeedMatches onUpdate={onUpdate} />}
    </div>
  )
}

function SeedMatches({ onUpdate }) {
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState('')

  const seed = async () => {
    setSeeding(true)
    setSeedMsg('Seeding 104 matches...')

    // Fetch schedule from API
    try {
      const res = await fetch('/api/football?endpoint=fixtures&params=league=1%26season=2026')
      const data = await res.json()

      if (!data.response || data.response.length === 0) {
        setSeedMsg('No fixtures returned. You can seed manually or check your API key.')
        setSeeding(false)
        return
      }

      // Clear existing matches
      await supabase.from('goal_scorers').delete().neq('id', 0)
      await supabase.from('matches').delete().neq('id', 0)

      const inserts = data.response.map(f => ({
        match_number: f.fixture.id,
        stage: f.league.round?.includes('Group') ? 'Group Stage' : f.league.round,
        group_name: f.league.round?.includes('Group') ? f.league.round.replace('Group ', '').charAt(0) : null,
        home_team: f.teams.home.name,
        away_team: f.teams.away.name,
        home_score: f.goals.home,
        away_score: f.goals.away,
        home_yellows: 0,
        away_yellows: 0,
        match_date: f.fixture.date,
        venue: f.fixture.venue?.name || '',
        status: f.fixture.status.short === 'FT' ? 'finished' : 'scheduled',
        api_fixture_id: f.fixture.id
      }))

      const { error } = await supabase.from('matches').insert(inserts)
      if (error) {
        setSeedMsg(`Error: ${error.message}`)
      } else {
        setSeedMsg(`Successfully seeded ${inserts.length} matches!`)
        onUpdate()
      }
    } catch (err) {
      setSeedMsg(`Error: ${err.message}. You may need to seed matches manually.`)
    }
    setSeeding(false)
  }

  return (
    <div className="admin-section">
      <h3>Seed Match Schedule</h3>
      <p className="page-subtitle">Pull the full 104-match schedule from API-Football. Run this once to populate the schedule. Warning: this will clear existing match data.</p>
      <button className="btn-primary btn-danger" onClick={seed} disabled={seeding}>
        {seeding ? 'Seeding...' : 'Seed All Matches from API'}
      </button>
      {seedMsg && <div className="admin-msg">{seedMsg}</div>}
    </div>
  )
}
