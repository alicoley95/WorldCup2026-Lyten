# WC2026 Nation Predictor — Setup Guide

## Step 1: Set Up the Database

1. Open your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase-schema.sql` and paste it in
5. Click **Run** — you should see "Success" with no errors
6. Go to **Table Editor** in the sidebar — you should see 4 tables: `participants`, `matches`, `match_events`, `team_positions`

## Step 2: Push Code to GitHub

### Option A: Using GitHub Desktop (easiest)
1. Download GitHub Desktop from desktop.github.com
2. Sign in with your GitHub account
3. Clone your `wc2026-bet` repository
4. Copy all the project files into the cloned folder
5. In GitHub Desktop, you'll see all the new files listed
6. Type a commit message like "Initial commit" and click **Commit to main**
7. Click **Push origin**

### Option B: Using command line
```bash
git clone https://github.com/YOUR-USERNAME/wc2026-bet.git
cd wc2026-bet
# Copy all project files here, then:
git add .
git commit -m "Initial commit"
git push origin main
```

## Step 3: Configure Netlify

1. Go to app.netlify.com
2. Click on your `wc2026-bet` site
3. Go to **Site Configuration** → **Environment Variables**
4. Add these 5 environment variables:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `VITE_ADMIN_PASSWORD` | Your chosen admin password |
| `API_FOOTBALL_KEY` | Your API-Football key |
| `SUPABASE_URL` | Same as VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role secret key (from Supabase Settings → API) |

**Important:** You need the `service_role` key (not the anon key) for `SUPABASE_SERVICE_KEY`. This is used by the serverless function to write data.

5. Go to **Site Configuration** → **Build & Deploy**
6. Set:
   - Build command: `npm run build`
   - Publish directory: `dist`
7. Click **Trigger Deploy** → **Deploy site**

## Step 4: First Sync

1. Visit your site at `https://your-site-name.netlify.app`
2. Go to the **Admin** page
3. Enter your admin password
4. Click the **Sync API** tab
5. Click **Sync Now** — this will fetch all 104 World Cup fixtures from API-Football
6. Go to the **Schedule** page — you should see all matches loaded

## Step 5: Add Participants

1. In the Admin panel, go to the **Participants** tab
2. For each person, enter their name, nation, and all 5 predictions plus tiebreaker
3. The Leaderboard will automatically calculate scores

## How It Works

- **Leaderboard**: Reads all participant predictions and match results from the database, calculates scores in real-time using proximity scoring (20 points max per question, minus 1 per unit of error)
- **Schedule**: Shows all matches with scores and events (goals, cards)
- **Admin → Sync**: Calls API-Football to fetch/update match results and events automatically
- **Admin → Matches**: Manual override for any match score or event
- **Admin → Positions**: Set final tournament positions for each team (needed for the "Final Position" prediction scoring)

## During the Tournament

After each match day:
1. Go to Admin → Sync API → click Sync Now
2. The leaderboard updates automatically

If the API misses any data:
1. Go to Admin → Matches → click Edit on the match
2. Manually enter the score and add goal/card events

At the end of the tournament:
1. Go to Admin → Positions
2. Enter the final position (1-48) for each team based on FIFA's official standings
