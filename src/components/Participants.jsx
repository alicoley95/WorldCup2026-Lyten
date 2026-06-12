import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TEAMS } from '../lib/teams'

export default function Participants({ participants, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', nation: '', predicted_position: '',
    predicted_goals_for: '', predicted_goals_against: '',
    predicted_top_scorer_goals: '', predicted_yellow_cards: '',
    tiebreaker: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.name || !form.nation) {
      setError('Name and nation are required')
      return
    }

    const entry = {
      name: form.name,
      nation: form.nation,
      predicted_position: parseInt(form.predicted_position) || null,
      predicted_goals_for: parseInt(form.predicted_goals_for) || null,
      predicted_goals_against: parseInt(form.predicted_goals_against) || null,
      predicted_top_scorer_goals: parseInt(form.predicted_top_scorer_goals) || null,
      predicted_yellow_cards: parseInt(form.predicted_yellow_cards) || null,
      tiebreaker: parseInt(form.tiebreaker) || null
    }

    setSaving(true)
    const { error: dbError } = await supabase.from('participants').insert(entry)
    setSaving(false)

    if (dbError) {
      setError(dbError.message)
      return
    }

    setForm({ name: '', nation: '', predicted_position: '', predicted_goals_for: '', predicted_goals_against: '', predicted_top_scorer_goals: '', predicted_yellow_cards: '', tiebreaker: '' })
    setShowForm(false)
    onUpdate()
  }

  return (
    <div className="page">
      <h2>👥 Entries</h2>
      <p className="page-subtitle">{participants.length} participants</p>

      <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancel' : '+ Add Entry'}
      </button>

      {showForm && (
        <div className="entry-form-wrapper">
          <h3>New Entry</h3>
          {error && <div className="form-error">{error}</div>}
          <div className="entry-form">
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Your name" />
            </div>
            <div className="form-group">
              <label>Your Nation</label>
              <select value={form.nation} onChange={e => setForm({...form, nation: e.target.value})}>
                <option value="">Select nation...</option>
                {TEAMS.map(t => (
                  <option key={t.code} value={t.name}>{t.flag} {t.name} (Group {t.group})</option>
                ))}
              </select>
            </div>
            <div className="form-divider">Your 5 Predictions</div>
            <div className="form-group">
              <label>Final Position (1–48)</label>
              <input type="number" min="1" max="48" value={form.predicted_position} onChange={e => setForm({...form, predicted_position: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Total Goals Scored by your nation</label>
              <input type="number" min="0" max="30" value={form.predicted_goals_for} onChange={e => setForm({...form, predicted_goals_for: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Total Goals Conceded by your nation</label>
              <input type="number" min="0" max="30" value={form.predicted_goals_against} onChange={e => setForm({...form, predicted_goals_against: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Top Scorer from your nation — total goals</label>
              <input type="number" min="0" max="15" value={form.predicted_top_scorer_goals} onChange={e => setForm({...form, predicted_top_scorer_goals: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Yellow Cards received by your nation</label>
              <input type="number" min="0" max="30" value={form.predicted_yellow_cards} onChange={e => setForm({...form, predicted_yellow_cards: e.target.value})} />
            </div>
            <div className="form-divider">Tie-Breaker</div>
            <div className="form-group">
              <label>Combined Goals For + Against (total)</label>
              <input type="number" min="0" max="50" value={form.tiebreaker} onChange={e => setForm({...form, tiebreaker: e.target.value})} />
            </div>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Submit Entry'}
            </button>
          </div>
        </div>
      )}

      <div className="entries-list">
        {participants.map(p => {
          const team = TEAMS.find(t => t.name === p.nation)
          return (
            <div key={p.id} className="entry-card">
              <div className="entry-header">
                <span className="entry-flag">{team?.flag || '🏳️'}</span>
                <span className="entry-name">{p.name}</span>
                <span className="entry-nation">{p.nation}</span>
              </div>
              <div className="entry-preds">
                <div><span className="pred-label">Position:</span> {p.predicted_position}</div>
                <div><span className="pred-label">Goals For:</span> {p.predicted_goals_for}</div>
                <div><span className="pred-label">Goals Against:</span> {p.predicted_goals_against}</div>
                <div><span className="pred-label">Top Scorer:</span> {p.predicted_top_scorer_goals} goals</div>
                <div><span className="pred-label">Yellow Cards:</span> {p.predicted_yellow_cards}</div>
                <div><span className="pred-label">Tiebreaker:</span> {p.tiebreaker}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
