-- ============================================
-- WC2026 Nation Predictor — Supabase Schema
-- Paste this into Supabase SQL Editor and run
-- ============================================

CREATE TABLE participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  nation TEXT NOT NULL,
  position_guess INTEGER NOT NULL CHECK (position_guess BETWEEN 1 AND 48),
  goals_for_guess INTEGER NOT NULL CHECK (goals_for_guess >= 0),
  goals_against_guess INTEGER NOT NULL CHECK (goals_against_guess >= 0),
  top_scorer_name TEXT NOT NULL,
  top_scorer_goals_guess INTEGER NOT NULL CHECK (top_scorer_goals_guess >= 0),
  yellow_cards_guess INTEGER NOT NULL CHECK (yellow_cards_guess >= 0),
  tiebreaker_guess INTEGER NOT NULL CHECK (tiebreaker_guess >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_fixture_id INTEGER UNIQUE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  stage TEXT NOT NULL,
  group_name TEXT,
  match_date TIMESTAMPTZ,
  venue TEXT,
  city TEXT,
  status TEXT DEFAULT 'scheduled',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE match_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  team TEXT NOT NULL,
  player_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('goal','own_goal','penalty_goal','yellow','red')),
  minute INTEGER,
  detail TEXT
);

CREATE TABLE team_positions (
  team TEXT PRIMARY KEY,
  final_position INTEGER CHECK (final_position BETWEEN 1 AND 48)
);

-- Enable RLS then allow anon access (small private app)
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON match_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON team_positions FOR ALL USING (true) WITH CHECK (true);
