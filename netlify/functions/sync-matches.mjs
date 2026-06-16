import { loadEnv, getClient, runSync } from './lib/sync-core.mjs';

export default async function handler(req, context) {
  console.log('Manual sync started.');

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

  try {
    // Uncapped, same as the original behaviour. A human pressed the button
    // and is waiting on the Admin panel, so process everything pending in
    // one go rather than deferring anything.
    const summary = await runSync({
      supabase,
      apiKey: env.apiKey,
      maxDetailFetchesPerRun: Infinity,
    });

    console.log('Manual sync complete:', JSON.stringify(summary));

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
