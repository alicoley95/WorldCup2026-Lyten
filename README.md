# ⚽ WC 2026 Nation Predictor

A web app for tracking a World Cup 2026 workplace bet. Everyone picks their home nation and predicts 5 stats. Scores update automatically as results come in.

## The Bet

Each participant makes 5 predictions about their home nation:

1. **Final tournament position** (1st to 48th)
2. **Total goals scored** across all games
3. **Total goals conceded** across all games
4. **Top scorer from your nation** — total goals
5. **Yellow cards received** across all games

Scoring: 20 points per question, minus 1 per unit of error. Max 100 points.

---

## Setup Guide (30 minutes, all free)

### Step 1: Create a GitHub Account

1. Go to [github.com](https://github.com) and click **Sign Up**
2. Follow the prompts (email, password, username)
3. Verify your email

### Step 2: Create a Supabase Project (your database)

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
2. Sign in with your GitHub account
3. Click **New Project**
4. Choose a name (e.g. `wc2026-bet`), set a database password, choose a region near you
5. Wait ~2 minutes for the project to be created

#### Create the database tables:

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the entire contents of `supabase-schema.sql` from this project
4. Paste it into the query editor and click **Run**
5. You should see "Success. No rows returned" — that means it worked

#### Get your Supabase keys:

1. Go to **Settings** > **API** (left sidebar)
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`)
3. Copy the **anon / public** key (the long string)
4. Save both — you'll need them in Step 5

### Step 3: Get an API-Football Key

1. Go to [rapidapi.com](https://rapidapi.com)
2. Sign up for a free account
3. Search for **API-Football** and subscribe to the **Free plan** (100 requests/day)
4. Go to your RapidAPI dashboard and copy your **API key**
5. Save this — you'll need it in Step 5

### Step 4: Create a Netlify Account & Deploy

1. Go to [netlify.com](https://netlify.com) and click **Sign up** — use your GitHub account
2. Click **Add new site** > **Import an existing project**
3. Choose **GitHub** and authorise Netlify to access your repos
4. Select the repository (see "Upload to GitHub" below)
5. Build settings should auto-detect:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Click **Deploy site**

#### Upload to GitHub first:

1. Go to [github.com](https://github.com) and click **+** > **New repository**
2. Name it `wc2026-bet`, keep it **Public**, click **Create**
3. On your computer, open a terminal in this project folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wc2026-bet.git
git push -u origin main
```

If you don't have Git installed, download it from [git-scm.com](https://git-scm.com).

### Step 5: Set Environment Variables in Netlify

1. In Netlify, go to your site > **Site settings** > **Environment variables**
2. Add these variables:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `VITE_ADMIN_PASSWORD` | A password you choose for the admin panel |
| `API_FOOTBALL_KEY` | Your RapidAPI key for API-Football |

3. Go to **Deploys** > **Trigger deploy** > **Deploy site** (to rebuild with the new env vars)

### Step 6: Seed the Match Schedule

1. Open your deployed site (the Netlify URL like `your-site.netlify.app`)
2. Go to the **Admin** tab and enter your admin password
3. Click **Seed Matches** tab
4. Click **Seed All Matches from API** — this pulls all 104 matches from API-Football
5. Go to the **Schedule** tab to verify matches appear

### Step 7: Add Participants

1. Go to the **Entries** tab
2. Click **+ Add Entry** for each person in your group
3. Enter their name, nation, and 5 predictions

---

## During the Tournament

### Updating Results

**Option A — Automatic (API):**
1. Go to Admin > **Fetch from API** tab
2. Click **Fetch Latest Results** — scores update automatically
3. You may need to manually add goal scorers and yellow cards per match

**Option B — Manual:**
1. Go to Admin > **Match Results** tab
2. Select the match from the dropdown
3. Enter the score, yellow cards, and goal scorers
4. Click Save

### Setting Final Positions

As teams are eliminated, go to Admin > **Final Positions** and set each nation's finish position (1–48). This is needed for the "Final Position" scoring question.

---

## Tech Stack

- **Frontend:** React + Vite
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Netlify
- **Match Data:** API-Football (via Netlify Functions)

---

## Troubleshooting

**"No data returned from API"**: Check your API-Football key is correct in Netlify environment variables. The free tier allows 100 requests/day.

**Matches not showing**: Make sure you ran the Seed Matches step. Check the Supabase dashboard to verify data exists in the `matches` table.

**Scores not calculating**: Scores only calculate once a match has `status: finished` AND the team has a `nation_position` set (for the position question). Goals, cards, and top scorer calculate from finished matches automatically.

**Environment variables not working**: After changing env vars in Netlify, you must trigger a new deploy for them to take effect.
