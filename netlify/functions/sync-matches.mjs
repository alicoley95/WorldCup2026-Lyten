import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

export default async function handler(req, context) {
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  // Fetch the single match detail for CAN vs BIH (537333)
  const detailUrl = `${FOOTBALL_DATA_BASE}/matches/537333`;
  console.log(`Fetching: ${detailUrl}`);
  const detailRes = await fetch(detailUrl, { headers: { 'X-Auth-Token': apiKey } });
  console.log(`Status: ${detailRes.status}`);

  const detail = await detailRes.json();
  console.log('Top-level keys:', Object.keys(detail).join(', '));
  console.log('goals:', JSON.stringify(detail.goals));
  console.log('bookings:', JSON.stringify(detail.bookings));
  console.log('score:', JSON.stringify(detail.score));

  return new Response(JSON.stringify({ done: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
