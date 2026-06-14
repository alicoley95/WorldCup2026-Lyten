import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

export default async function handler(req, context) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  console.log('Sync started.');
  console.log('FOOTBALL_DATA_KEY present:', !!apiKey);
  console.log('SUPABASE_URL present:', !!supabaseUrl);
  console.log('SUPABASE_SERVICE_KEY present:', !!supabaseKey);

  if (!supabaseUrl || !supabaseKey || !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const apiHeaders = {
    'X-Auth-Token': apiKey,
    'X-Unfold-Goals': 'true',
    'X-Unfold-Bookings': 'true',
  };

  try {
    const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
    console.log(`Fetching: ${matchesUrl}`);
    const matchesRes = await fetch(matchesUrl, { headers: apiHeaders });
    console.log(`Matches response status: ${matchesRes.status}`);

    if (!matchesRes.ok) {
      const text = await matchesRes.text();
      console.error('Matches fetch failed:', text);
      return new Response(JSON.stringify({ error: 'Matches fetch failed', detail: text }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const matchesData = await matchesRes.json();
    const matches = matchesData.matches || [];
    console.log(`Total matches received: ${matches.length}`);

    // ── DIAGNOSTIC: log the raw structure of the first finished match ────────
    const firstFinished = matches.find(m => m.status === 'FINISHED');
    if (firstFinished) {
      console.log('DIAGNOSTIC - First finished match keys:', Object.keys(firstFinished).join(', '));
      console.log('DIAGNOSTIC - goals field:', JSON.stringify(firstFinished.goals));
      console.log('DIAGNOSTIC - bookings field:', JSON.stringify(firstFinished.bookings));
      console.log('DIAGNOSTIC - homeTeam keys:', Object.keys(firstFinished.homeTeam || {}).join(', '));
    } else {
      console.log('DIAGNOSTIC - No finished matches found in response.');
    }

    return new Response(JSON.stringify({ success: true, diagnostic: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
