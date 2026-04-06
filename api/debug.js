// api/debug.js
// Visit /api/debug in your browser to check which keys are configured
// DELETE THIS FILE after confirming keys work (for security)

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const keys = {
    GEMINI_API_KEY:  process.env.GEMINI_API_KEY  ? 'SET ✓ (' + process.env.GEMINI_API_KEY.slice(0,6) + '...)' : 'MISSING ✗',
    GROQ_API_KEY:    process.env.GROQ_API_KEY    ? 'SET ✓ (' + process.env.GROQ_API_KEY.slice(0,6)   + '...)' : 'MISSING ✗',
    XAI_API_KEY:     process.env.XAI_API_KEY     ? 'SET ✓ (' + process.env.XAI_API_KEY.slice(0,6)    + '...)' : 'MISSING ✗',
  };
  const anySet = Object.values(keys).some(v => v.startsWith('SET'));
  res.status(200).json({
    status: anySet ? 'OK — at least one key is configured' : 'ERROR — no keys found, app will not work',
    keys,
    instructions: anySet ? 'Keys look good. If the app still fails, check key validity / quota.' : 'Go to Vercel → your project → Settings → Environment Variables → Add GEMINI_API_KEY. Get a free key at https://aistudio.google.com/app/apikey. Then redeploy.'
  });
}