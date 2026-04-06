// api/linkedin.js
// LINKEDIN.exe — AI LinkedIn Post Generator
// Simpler per-variant generation for maximum reliability
// Grok → Groq → Gemini fallback
//
// Env vars (add in Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  — Google Gemini  (https://aistudio.google.com/app/apikey)  ← easiest free key
//   GROQ_API_KEY    — Groq           (https://console.groq.com)
//   XAI_API_KEY     — xAI / Grok     (https://console.x.ai)

async function fetchWithTimeout(url, options, ms = 9000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function callAI(prompt, XKEY, GQKEY, GKEY) {
  const messages = [{ role: 'user', content: prompt }];

  if (XKEY) {
    try {
      const r = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${XKEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-3-mini', messages, max_tokens: 800, temperature: 0.85 })
      });
      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content?.trim();
      if (r.ok && text) return text;
      console.log('[LINKEDIN] Grok failed:', r.status, d?.error?.message);
    } catch(e) { console.log('[LINKEDIN] Grok error:', e.message); }
  }

  if (GQKEY) {
    for (const model of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) {
      try {
        const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GQKEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.85 })
        });
        const d = await r.json();
        const text = d?.choices?.[0]?.message?.content?.trim();
        if (r.ok && text) return text;
        console.log('[LINKEDIN] Groq failed:', r.status, d?.error?.message);
      } catch(e) { console.log('[LINKEDIN] Groq error:', e.message); }
    }
  }

  if (GKEY) {
    for (const model of ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']) {
      try {
        const r = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GKEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 800, temperature: 0.85 }
            })
          }
        );
        const d = await r.json();
        const text = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (r.ok && text) return text;
        console.log('[LINKEDIN] Gemini failed:', r.status, d?.error?.message);
      } catch(e) { console.log('[LINKEDIN] Gemini error:', e.message); }
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, type, author, useEmoji, useHooks, useHash, useCta } = req.body || {};
    if (!content) return res.status(400).json({ error: 'No content provided.' });

    const XKEY  = process.env.XAI_API_KEY;
    const GQKEY = process.env.GROQ_API_KEY;
    const GKEY  = process.env.GEMINI_API_KEY;

    if (!XKEY && !GQKEY && !GKEY) {
      return res.status(500).json({
        error: 'No API keys found. Go to Vercel → your project → Settings → Environment Variables. Add GEMINI_API_KEY (get free key at aistudio.google.com). Then redeploy.'
      });
    }

    const emojiRule = useEmoji ? 'Use relevant emojis.' : 'NO emojis at all.';
    const ctaRule   = useCta   ? 'End with a call to action (question or share prompt).' : '';
    const authorStr = author   ? `Author: ${author}.` : '';
    const typeMap   = { topic:'thought leadership', project:'project showcase', job:'job update', achievement:'achievement', opinion:'hot take / opinion', custom:'custom post' };
    const typeStr   = typeMap[type] || 'LinkedIn post';

    const base = `${authorStr}\nTopic: ${content}\n${emojiRule} ${ctaRule}`;

    const [profText, casText, virText] = await Promise.all([
      callAI(`Write a professional LinkedIn post (${typeStr}).\n${base}\nRules: Polished, credible, 150-220 words, clear paragraphs, strong opening, share a lesson.\nOutput ONLY the post text. No labels, no JSON, no quotes.`, XKEY, GQKEY, GKEY),
      callAI(`Write a casual conversational LinkedIn post (${typeStr}).\n${base}\nRules: Friendly, relatable, 100-160 words, short sentences, human not corporate.\nOutput ONLY the post text. No labels, no JSON, no quotes.`, XKEY, GQKEY, GKEY),
      callAI(`Write a viral LinkedIn post (${typeStr}) for maximum engagement.\n${base}\nRules: Hook-Story-Lesson-CTA structure. First line stops the scroll. New line every 1-2 sentences. 200-300 words. Bold or counterintuitive angle.\nOutput ONLY the post text. No labels, no JSON, no quotes.`, XKEY, GQKEY, GKEY),
    ]);

    if (!profText && !casText && !virText) {
      return res.status(500).json({ error: 'All AI providers failed. Check your API keys have quota remaining.' });
    }

    const fallback = profText || casText || virText;
    const variants = {
      professional: profText || fallback,
      casual:       casText  || fallback,
      viral:        virText  || fallback,
    };

    let hooks = [];
    if (useHooks) {
      const hookText = await callAI(`Give 5 short LinkedIn hook lines (scroll-stopping openers) for: "${content}".\nOutput a numbered list 1-5. One per line. No explanation.`, XKEY, GQKEY, GKEY);
      if (hookText) {
        hooks = hookText.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(l => l.length > 8).slice(0, 5);
      }
    }

    let hashtags = [];
    if (useHash) {
      const hashText = await callAI(`Give 8 LinkedIn hashtags for: "${content}". Output only hashtags separated by spaces, each starting with #.`, XKEY, GQKEY, GKEY);
      if (hashText) hashtags = (hashText.match(/#\w+/g) || []).slice(0, 8);
    }

    const role = author && author.includes(',') ? author.split(',')[1].trim() : 'Professional';
    return res.status(200).json({ variants, hooks, hashtags, role });

  } catch(e) {
    console.error('[LINKEDIN] Handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}