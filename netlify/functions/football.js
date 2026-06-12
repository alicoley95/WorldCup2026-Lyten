export default async (req) => {
  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint") || "fixtures";
  const params = url.searchParams.get("params") || "";

  const apiUrl = `https://v3.football.api-sports.io/${endpoint}?${params}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io"
      }
    });
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/football"
};
