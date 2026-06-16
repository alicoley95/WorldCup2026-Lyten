import { loadEnv, getClient, runSync, isMatchWindowActive } from './lib/sync-core.mjs';

// Fires every 30 minutes, around the clock. This is intentionally simple
// rather than trying to hardcode UTC hour ranges for kickoff windows, which
// shift across host time zones (US/Mexico/Canada) and between group stage
// and knockout stage. The isMatchWindowActive check below means it's a fast
// no-op (one cheap Supabase query, no football-data.org call) outside actual
// match windows, so in practice this only does real work when something is
// on or has just finished.
export const config = {
  schedule: '*/30 * * * *',
};

// Capped at 3 detail fetches per run. Each one costs roughly 6.7 seconds
// (the 6.2s rate-limit delay plus fetch and Supabase write time), so 3 of
// them is ~20s, comfortably under Netlify's 30 second scheduled function
// limit. Anything beyond 3 in a single run rolls over to the next cycle 30
// minutes later, since a deferred match still shows up as "changed" then.
const MAX_DETAIL_FETCHES_PER_RUN = 3;

export default async function handler(req, context) {
  console.log('Scheduled sync check started.');

  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getClient(env);

  const active = await isMatchWindowActive(supabase);
  if (!active) {
    console.log('No match in window, skipping sync.');
    return new Response(JSON.stringify({ skipped: true, reason: 'no match in window' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const summary = await runSync({
      supabase,
      apiKey: env.apiKey,
      maxDetailFetchesPerRun: MAX_DETAIL_FETCHES_PER_RUN,
    });

    console.log('Scheduled sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
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
