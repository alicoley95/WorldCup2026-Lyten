import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { TEAMS } from '../data/teams'

const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD

export default function Admin() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [tab, setTab] = useState('participants')
  const [msg, setMsg] = useState(null)

  if (!auth) return (
    <div className="password-gate">
      <h2>🔒 Admin Panel</h2>
      <p style={{ marginBottom: 16, color: 'var(--text-light)' }}>Enter the admin password to continue</p>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && checkPw()} placeholder="Password" />
      <button className="btn-primary" style={{ width: '100%' }} onClick={checkPw}>Unlock</button>
      {msg && <div className="alert alert-error" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  )

  function checkPw() {
    if (pw === ADMIN_PW) { setAuth(true); setMsg(null) }
    else setMsg('Incorrect password')
  }

  return (
    <>
      <div className="page-title">⚙️ Admin Panel</div>
      <div className="tabs">
        {['participants','sync','matches','import','positions'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}>
            {t === 'participants' ? '👥 Participants' : t === 'sync' ? '🔄 Sync API' : t === 'matches' ? '⚽ Matches' : t === 'import' ? '📥 Import' : '🏅 Positions'}
          </button>
        ))}
      </div>
      {tab === 'participants' && <ParticipantsTab />}
      {tab === 'sync' && <SyncTab />}
      {tab === 'matches' && <MatchesTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'positions' && <PositionsTab />}
    </>
  )
}

function ParticipantsTab() {
  const [participants, setParticipants] = useState([])
  const [msg, setMsg] = useState(null)
  const [editId, setEditId] = useState(null)
  const blankForm = {
    name: '', nation: '', position_guess: '', goals_for_guess: '', goals_against_guess: '',
    top_scorer_name: '', top_scorer_goals_guess: '', yellow_cards_guess: '', tiebreaker_guess: ''
  }
  const [form, setForm] = useState(blankForm)

  useEffect(() => { loadP() }, [])
  async function loadP() {
    const { data } = await supabase.from('participants').select('*').order('created_at')
    setParticipants(data || [])
  }

  function buildRow() {
    return {
      name: form.name, nation: form.nation,
      position_guess: parseInt(form.position_guess) || 1,
      goals_for_guess: parseInt(form.goals_for_guess) || 0,
      goals_against_guess: parseInt(form.goals_against_guess) || 0,
      top_scorer_name: form.top_scorer_name || 'Unknown',
      top_scorer_goals_guess: parseInt(form.top_scorer_goals_guess) || 0,
      yellow_cards_guess: parseInt(form.yellow_cards_guess) || 0,
      tiebreaker_guess: parseInt(form.tiebreaker_guess) || 0
    }
  }

  async function addParticipant() {
    if (!form.name || !form.nation) { setMsg({ type: 'error', text: 'Name and nation required' }); return }
    const { error } = await supabase.from('participants').insert(buildRow())
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `${form.name} added` })
    setForm(blankForm)
    loadP()
  }

  function startEdit(p) {
    setEditId(p.id)
    setForm({
      name: p.name || '', nation: p.nation || '',
      position_guess: p.position_guess ?? '', goals_for_guess: p.goals_for_guess ?? '',
      goals_against_guess: p.goals_against_guess ?? '', top_scorer_name: p.top_scorer_name ?? '',
      top_scorer_goals_guess: p.top_scorer_goals_guess ?? '', yellow_cards_guess: p.yellow_cards_guess ?? '',
      tiebreaker_guess: p.tiebreaker_guess ?? ''
    })
    setMsg(null)
  }

  function cancelEdit() {
    setEditId(null)
    setForm(blankForm)
  }

  async function saveEdit() {
    if (!form.name || !form.nation) { setMsg({ type: 'error', text: 'Name and nation required' }); return }
    const { error } = await supabase.from('participants').update(buildRow()).eq('id', editId)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: `${form.name} updated` })
    setEditId(null)
    setForm(blankForm)
    loadP()
  }

  async function deleteP(id, name) {
    if (!confirm(`Delete ${name}?`)) return
    if (editId === id) cancelEdit()
    await supabase.from('participants').delete().eq('id', id)
    loadP()
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card">
        <h3>{editId ? `Edit Participant: ${form.name}` : 'Add Participant'}</h3>
        <div className="form-grid three">
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Nation</label>
            <select value={form.nation} onChange={e => setForm({ ...form, nation: e.target.value })}>
              <option value="">Select nation...</option>
              {TEAMS.map(t => <option key={t.code} value={t.name}>{t.flag} {t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Final Position (1-48)</label>
            <input type="number" min="1" max="48" value={form.position_guess}
              onChange={e => setForm({ ...form, position_guess: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Goals For</label>
            <input type="number" min="0" value={form.goals_for_guess}
              onChange={e => setForm({ ...form, goals_for_guess: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Goals Against</label>
            <input type="number" min="0" value={form.goals_against_guess}
              onChange={e => setForm({ ...form, goals_against_guess: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Top Scorer Name</label>
            <input value={form.top_scorer_name} onChange={e => setForm({ ...form, top_scorer_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Top Scorer Goals</label>
            <input type="number" min="0" value={form.top_scorer_goals_guess}
              onChange={e => setForm({ ...form, top_scorer_goals_guess: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Yellow Cards</label>
            <input type="number" min="0" value={form.yellow_cards_guess}
              onChange={e => setForm({ ...form, yellow_cards_guess: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tiebreaker (GF + GA combined)</label>
            <input type="number" min="0" value={form.tiebreaker_guess}
              onChange={e => setForm({ ...form, tiebreaker_guess: e.target.value })} />
          </div>
        </div>
        <div className="btn-row">
          {editId ? (
            <>
              <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
              <button className="btn-sm" onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button className="btn-primary" onClick={addParticipant}>Add Participant</button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Current Participants ({participants.length})</h3>
        {participants.length === 0 ? <p className="empty">No participants added yet</p> : (
          <table>
            <thead>
              <tr><th>Name</th><th>Nation</th><th>Pos</th><th>GF</th><th>GA</th><th>Top Scorer</th><th>YC</th><th>TB</th><th></th></tr>
            </thead>
            <tbody>
              {participants.map(p => (
                <tr key={p.id} style={editId === p.id ? { background: 'var(--bg)' } : undefined}>
                  <td>{p.name}</td>
                  <td>{p.nation}</td>
                  <td>{p.position_guess}</td>
                  <td>{p.goals_for_guess}</td>
                  <td>{p.goals_against_guess}</td>
                  <td>{p.top_scorer_name} ({p.top_scorer_goals_guess})</td>
                  <td>{p.yellow_cards_guess}</td>
                  <td>{p.tiebreaker_guess}</td>
                  <td>
                    <button className="btn-sm btn-primary" onClick={() => startEdit(p)}>Edit</button>{' '}
                    <button className="btn-danger btn-sm" onClick={() => deleteP(p.id, p.name)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function SyncTab() {
  const [msg, setMsg] = useState(null)
  const [syncing, setSyncing] = useState(false)

  async function syncMatches() {
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch('/.netlify/functions/sync-matches')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMsg({ type: 'success', text: `Synced: ${data.matchesUpdated} matches, ${data.eventsAdded} events` })
    } catch (err) {
      setMsg({ type: 'error', text: `Sync failed: ${err.message}` })
    }
    setSyncing(false)
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card">
        <h3>Sync from API-Football</h3>
        <p style={{ marginBottom: 12, color: 'var(--text-light)', fontSize: 14 }}>
          Fetches all World Cup fixtures, scores, goal scorers and yellow cards from the API-Football service.
          This uses your free daily quota (100 requests/day). A typical sync uses 2-5 requests.
        </p>
        <button className="btn-accent" onClick={syncMatches} disabled={syncing}>
          {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
        </button>
      </div>
    </>
  )
}

function MatchesTab() {
  const [matches, setMatches] = useState([])
  const [events, setEvents] = useState([])
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [eventForm, setEventForm] = useState({ team: '', player_name: '', event_type: 'goal', minute: '' })
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadM() }, [])
  async function loadM() {
    const [mRes, eRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_date', { ascending: true }),
      supabase.from('match_events').select('*')
    ])
    setMatches(mRes.data || [])
    setEvents(eRes.data || [])
  }

  async function saveMatch() {
    const { error } = await supabase.from('matches').update({
      home_score: parseInt(editForm.home_score),
      away_score: parseInt(editForm.away_score),
      status: 'finished',
      updated_at: new Date().toISOString()
    }).eq('id', editId)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: 'Match updated' })
    setEditId(null)
    loadM()
  }

  async function addEvent() {
    if (!eventForm.player_name || !eventForm.team) return
    const { error } = await supabase.from('match_events').insert({
      match_id: editId, team: eventForm.team, player_name: eventForm.player_name,
      event_type: eventForm.event_type, minute: parseInt(eventForm.minute) || null
    })
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setEventForm({ team: '', player_name: '', event_type: 'goal', minute: '' })
    loadM()
  }

  async function deleteEvent(id) {
    await supabase.from('match_events').delete().eq('id', id)
    loadM()
  }

  const currentMatch = matches.find(m => m.id === editId)
  const currentEvents = events.filter(e => e.match_id === editId)

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {editId && currentMatch ? (
        <div className="card">
          <h3>Editing: {currentMatch.home_team} vs {currentMatch.away_team}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>{currentMatch.home_team} Score</label>
              <input type="number" min="0" value={editForm.home_score}
                onChange={e => setEditForm({ ...editForm, home_score: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{currentMatch.away_team} Score</label>
              <input type="number" min="0" value={editForm.away_score}
                onChange={e => setEditForm({ ...editForm, away_score: e.target.value })} />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-primary" onClick={saveMatch}>Save Score</button>
            <button className="btn-sm" onClick={() => setEditId(null)}>Cancel</button>
          </div>

          <h3 style={{ marginTop: 20 }}>Events ({currentEvents.length})</h3>
          {currentEvents.length > 0 && (
            <table>
              <thead><tr><th>Type</th><th>Team</th><th>Player</th><th>Min</th><th></th></tr></thead>
              <tbody>
                {currentEvents.map(e => (
                  <tr key={e.id}>
                    <td>{e.event_type === 'goal' ? '⚽' : e.event_type === 'yellow' ? '🟨' : e.event_type === 'red' ? '🟥' : e.event_type}</td>
                    <td>{e.team}</td>
                    <td>{e.player_name}</td>
                    <td>{e.minute || '-'}</td>
                    <td><button className="btn-danger btn-sm" onClick={() => deleteEvent(e.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label>Team</label>
              <select value={eventForm.team} onChange={e => setEventForm({ ...eventForm, team: e.target.value })}>
                <option value="">Select...</option>
                <option value={currentMatch.home_team}>{currentMatch.home_team}</option>
                <option value={currentMatch.away_team}>{currentMatch.away_team}</option>
              </select>
            </div>
            <div className="form-group">
              <label>Player Name</label>
              <input value={eventForm.player_name} onChange={e => setEventForm({ ...eventForm, player_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={eventForm.event_type} onChange={e => setEventForm({ ...eventForm, event_type: e.target.value })}>
                <option value="goal">⚽ Goal</option>
                <option value="penalty_goal">⚽ Penalty Goal</option>
                <option value="own_goal">⚽ Own Goal</option>
                <option value="yellow">🟨 Yellow Card</option>
                <option value="red">🟥 Red Card</option>
              </select>
            </div>
            <div className="form-group">
              <label>Minute</label>
              <input type="number" min="0" value={eventForm.minute}
                onChange={e => setEventForm({ ...eventForm, minute: e.target.value })} />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-accent" onClick={addEvent}>Add Event</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>All Matches ({matches.length})</h3>
          {matches.length === 0 ? <p className="empty">No matches loaded. Use Sync tab first.</p> : (
            <table>
              <thead><tr><th>Date</th><th>Home</th><th>Score</th><th>Away</th><th>Stage</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {matches.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12 }}>{m.match_date ? new Date(m.match_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : 'TBC'}</td>
                    <td>{m.home_team}</td>
                    <td style={{ textAlign:'center', fontWeight: 700 }}>
                      {m.status === 'finished' ? `${m.home_score} - ${m.away_score}` : '-'}
                    </td>
                    <td>{m.away_team}</td>
                    <td style={{ fontSize: 12 }}>{m.group_name ? `Grp ${m.group_name}` : m.stage}</td>
                    <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                    <td>
                      <button className="btn-sm btn-primary" onClick={() => {
                        setEditId(m.id)
                        setEditForm({ home_score: m.home_score || 0, away_score: m.away_score || 0 })
                      }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}

function PositionsTab() {
  const [positions, setPositions] = useState({})
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('team_positions').select('*')
      const map = {}
      ;(data || []).forEach(p => { map[p.team] = p.final_position })
      setPositions(map)
    }
    load()
  }, [])

  async function savePosition(team, pos) {
    const val = parseInt(pos)
    if (!val || val < 1 || val > 48) return
    const newPos = { ...positions, [team]: val }
    setPositions(newPos)
    const { error } = await supabase.from('team_positions').upsert({ team, final_position: val })
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: `${team} set to position ${val}` })
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card">
        <h3>Final Tournament Positions</h3>
        <p style={{ marginBottom: 12, color: 'var(--text-light)', fontSize: 14 }}>
          Set each team's final position once they are eliminated or the tournament ends.
          This is used to score the "Final Position" prediction for each participant.
        </p>
        <table>
          <thead><tr><th>Nation</th><th>Group</th><th>Position</th></tr></thead>
          <tbody>
            {TEAMS.map(t => (
              <tr key={t.code}>
                <td>{t.flag} {t.name}</td>
                <td>Group {t.group}</td>
                <td>
                  <input type="number" min="1" max="48" style={{ width: 70 }}
                    value={positions[t.name] || ''} placeholder="-"
                    onChange={e => savePosition(t.name, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ImportTab() {
  const [json, setJson] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)

  function parseJson() {
    try {
      const parsed = JSON.parse(json)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      setPreview(arr)
      setMsg({ type: 'success', text: `Parsed ${arr.length} match(es). Review below then click Import.` })
    } catch (e) {
      setMsg({ type: 'error', text: `Invalid JSON: ${e.message}` })
      setPreview(null)
    }
  }

  async function doImport() {
    if (!preview) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch('/.netlify/functions/import-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preview)
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Import failed')
      const ok = data.results.filter(r => r.status === 'ok').length
      const failed = data.results.filter(r => r.status !== 'ok').length
      setMsg({ type: 'success', text: `Import complete: ${ok} match(es) imported${failed > 0 ? `, ${failed} failed (check console)` : ''}.` })
      setPreview(null)
      setJson('')
    } catch (err) {
      setMsg({ type: 'error', text: `Import failed: ${err.message}` })
    }
    setLoading(false)
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card">
        <h3>Import Match Events</h3>
        <p style={{ marginBottom: 12, color: 'var(--text-light)', fontSize: 14 }}>
          Paste a JSON array of match results. Same format used in the Claude tracker artifact.
          Each match updates scores and replaces all goal and card events.
        </p>
        <div className="form-group">
          <label>JSON</label>
          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            placeholder={'[\n  {\n    "date": "2026-06-11",\n    "group": "A",\n    "homeCode": "MEX",\n    "awayCode": "RSA",\n    "homeScore": 2,\n    "awayScore": 0,\n    "goals": [\n      {"player": "Julián Quiñones", "code": "MEX", "minute": 9, "ownGoal": false}\n    ],\n    "cards": [\n      {"player": "Teboho Mokoena", "code": "RSA", "type": "yellow", "minute": 17}\n    ]\n  }\n]'}
            style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12, padding: 8, boxSizing: 'border-box' }}
          />
        </div>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn-primary" onClick={parseJson} disabled={!json.trim()}>
            Parse & Preview
          </button>
          {preview && (
            <button className="btn-accent" onClick={doImport} disabled={loading}>
              {loading ? '⏳ Importing...' : `✅ Import ${preview.length} match(es)`}
            </button>
          )}
        </div>
        {preview && (
          <table>
            <thead>
              <tr><th>Date</th><th>Home</th><th>Score</th><th>Away</th><th>Goals</th><th>Cards</th></tr>
            </thead>
            <tbody>
              {preview.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{m.date}</td>
                  <td>{m.homeCode}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{m.homeScore} - {m.awayScore}</td>
                  <td>{m.awayCode}</td>
                  <td style={{ fontSize: 12 }}>{(m.goals || []).length}</td>
                  <td style={{ fontSize: 12 }}>{(m.cards || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>JSON Format Reference</h3>
        <pre style={{ fontSize: 11, background: 'var(--bg)', padding: 12, borderRadius: 6, overflow: 'auto' }}>{`[{
  "date": "2026-06-11",       // YYYY-MM-DD
  "group": "A",               // group letter
  "homeCode": "MEX",          // 3-letter team code
  "awayCode": "RSA",
  "homeScore": 2,
  "awayScore": 0,
  "goals": [
    {
      "player": "Julián Quiñones",
      "code": "MEX",          // team the player plays for
      "minute": 9,            // null if unknown
      "ownGoal": false        // true for own goals (code = team who scored it)
    }
  ],
  "cards": [
    {
      "player": "Teboho Mokoena",
      "code": "RSA",
      "type": "yellow",       // yellow | red | yellow_red
      "minute": 17            // null if unknown
    }
  ]
}]`}</pre>
      </div>
    </>
  )
}
