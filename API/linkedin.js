// api/linkedin.js
// LINKEDIN.exe — AI LinkedIn Post Generator
// Returns 3 tone variants (professional/casual/viral) + hooks + hashtags
// Grok → Groq → Gemini fallback
//
// Env vars: XAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY

// Helper: fetch with timeout so we don't hang Vercel's 10s limit
async function fetchWithTimeout(url, options, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, type, tone, author, useEmoji, useHooks, useHash, useCta } = req.body || {};
    if (!content) return res.status(400).json({ error: 'No content provided.' });

    // Post type context
    const typeMap = {
      topic:       'a thought leadership post about a topic or idea',
      project:     'a project showcase post about something they built',
      job:         'a job update post (new role, promotion, internship, etc.)',
      achievement: 'an achievement post (milestone, award, certification, launch)',
      opinion:     'a hot take or opinion post designed to spark discussion',
      custom:      'a LinkedIn post based on this custom prompt',
    };
    const typeContext = typeMap[type] || typeMap.topic;

    // Tone instructions
    const toneInstructions = {
      professional: `Professional tone: Polished, credible, structured. Use clear paragraphs. Start with a strong insight or statement. Include learnings. End with a CTA. Sound like a senior professional sharing wisdom. Minimal but purposeful emojis if enabled.`,
      casual:       `Casual tone: Conversational, warm, relatable. Write like talking to a friend. Use short punchy sentences. Show personality and vulnerability. More emojis if enabled. Should feel human, not corporate.`,
      viral:        `Viral tone: Engineered to go viral on LinkedIn. Use the hook → story → lesson → CTA structure. First line must stop the scroll. Use line breaks aggressively (every 1-2 sentences). Numbered lists or bold reveals. Controversial or counterintuitive angle. Maximum engagement bait without being cringe.`,
    };

    const emojiRule = useEmoji
      ? 'Use relevant emojis naturally throughout.'
      : 'Do NOT use any emojis at all.';
    const ctaRule = useCta
      ? 'End with a strong call to action (question, comment prompt, or share ask).'
      : 'No explicit call to action needed.';

    const systemPrompt = `You are LINKEDIN.exe, an expert LinkedIn content strategist and copywriter.
You write high-performing LinkedIn posts that get real engagement.
You understand the LinkedIn algorithm, what hooks stop the scroll, and how to structure posts for maximum reach.
Always respond ONLY with valid JSON. No markdown, no explanation outside JSON.`;

    const userMsg = `Create LinkedIn posts for this person:
Author: ${author || 'a professional'}
Post type: ${typeContext}
Content/Topic: ${content}

${emojiRule}
${ctaRule}

Generate ALL THREE tone variants, plus hooks and hashtags.

Respond ONLY with this exact JSON:
{
  "variants": {
    "professional": "Full professional tone LinkedIn post here. Use \\n for line breaks.",
    "casual": "Full casual tone LinkedIn post here. Use \\n for line breaks.",
    "viral": "Full viral tone LinkedIn post here. Use \\n for line breaks aggressively for scannability."
  },
  "role": "Inferred short role/title of the author based on context (e.g. 'Data Science Student')",
  "hooks": ${useHooks ? `[
    "Hook line option 1 — short, punchy opening that stops the scroll",
    "Hook line option 2 — question or bold statement",
    "Hook line option 3 — counterintuitive or surprising opener",
    "Hook line option 4 — personal story opener",
    "Hook line option 5 — statistic or fact opener"
  ]` : '[]'},
  "hashtags": ${useHash ? `[
    "#RelevantHashtag1",
    "#RelevantHashtag2",
    "#RelevantHashtag3",
    "#RelevantHashtag4",
    "#RelevantHashtag5",
    "#RelevantHashtag6",
    "#RelevantHashtag7",
    "#RelevantHashtag8"
  ]` : '[]'}
}

IMPORTANT for each variant:
- Professional: 150-250 words, structured paragraphs, credible voice
- Casual: 100-180 words, short sentences, conversational
- Viral: 200-350 words, aggressive line breaks (every 1-2 sentences), hook → story → lesson → CTA structure
- Use \\n (newline) for ALL line breaks inside the JSON strings
- Make each variant genuinely different in structure and voice, not just tone
- Posts must be specific to the content given — no generic fluff`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ];

    // ── Grok ──
    const XKEY = process.env.XAI_API_KEY;
    if (XKEY) {
      try {
        const r = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${XKEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'grok-3-mini',
            messages: openAiMessages,
            max_tokens: 2500,
            temperature: 0.85,
            response_format: { type: 'json_object' }
          })
        });
        const d = await r.json();
        if (r.ok) {
          const text = d?.choices?.[0]?.message?.content;
          if (text) {
            const parsed = safeParseJSON(text);
            if (parsed?.variants) return res.status(200).json(parsed);
          }
        } else { console.log('[LINKEDIN] Grok failed:', r.status, d?.error?.message); }
      } catch(e) { console.log('[LINKEDIN] Grok error:', e.message); }
    }

    // ── Groq ──
    const GQKEY = process.env.GROQ_API_KEY;
    if (GQKEY) {
      const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
      for (const model of models) {
        try {
          const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GQKEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: openAiMessages,
              max_tokens: 2500,
              temperature: 0.85,
              response_format: { type: 'json_object' }
            })
          });
          const d = await r.json();
          if (r.ok) {
            const text = d?.choices?.[0]?.message?.content;
            if (text) {
              const parsed = safeParseJSON(text);
              if (parsed?.variants) return res.status(200).json(parsed);
            }
          } else { console.log(`[LINKEDIN] Groq ${model} failed:`, r.status); }
        } catch(e) { console.log(`[LINKEDIN] Groq ${model} error:`, e.message); }
      }
    }

    // ── Gemini ──
    const GKEY = process.env.GEMINI_API_KEY;
    if (GKEY) {
      const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash-8b', 'gemini-2.5-flash'];
      for (const model of models) {
        try {
          const r = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                  maxOutputTokens: 2500,
                  temperature: 0.85,
                  responseMimeType: 'application/json'
                }
              })
            }
          );
          const d = await r.json();
          if (r.ok) {
            const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = safeParseJSON(text);
              if (parsed?.variants) return res.status(200).json(parsed);
            }
          } else { console.log(`[LINKEDIN] Gemini ${model} failed:`, r.status); }
        } catch(e) { console.log(`[LINKEDIN] Gemini ${model} error:`, e.message); }
      }
    }

    return res.status(500).json({
      error: 'All AI providers failed. Make sure XAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY is set in Vercel Environment Variables. At least one key is required.'
    });

  } catch(e) {
    console.error('[LINKEDIN] Handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

function safeParseJSON(text) {
  if (!text || !text.trim()) return null;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Must have variants to be valid
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    // Try extracting JSON from mixed text
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return null;
  }
}