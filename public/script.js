/* ── CURSOR ── */
const cur = document.getElementById('cursor');
document.addEventListener('mousemove', e => { cur.style.left=e.clientX+'px'; cur.style.top=e.clientY+'px'; });
document.querySelectorAll('a,button,label,.type-chip,.tone-btn,.hook-item,.hashtag').forEach(el => {
  el.addEventListener('mouseenter',()=>{ cur.style.width='28px';cur.style.height='28px';cur.style.background='rgba(10,102,194,.2)'; });
  el.addEventListener('mouseleave',()=>{ cur.style.width='12px';cur.style.height='12px';cur.style.background='rgba(10,102,194,.2)'; });
});

/* ── STATE ── */
let currentType = 'topic';
let currentTone = 'professional';
let lastResult = null;
let variants = {}; // { professional: text, casual: text, viral: text }
let currentVariant = 'professional';

/* ── TYPE ── */
function setType(el) {
  document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentType = el.dataset.type;
  const placeholders = {
    topic:       'What topic or idea do you want to share? e.g. "Why Python is great for data science beginners"',
    project:     'Describe your project — what it does, what you built, what problem it solves...',
    job:         'What\'s your job update? New role, promotion, new company, internship...',
    achievement: 'What did you achieve? Certification, milestone, competition win, launch...',
    opinion:     'What\'s your hot take or controversial opinion in your field?',
    custom:      'Write your own custom prompt for the AI — total freedom.',
  };
  document.getElementById('content-input').placeholder = placeholders[currentType] || '';
}

/* ── TONE ── */
function setTone(el) {
  document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  currentTone = el.dataset.t;
  // switch displayed variant if already generated
  if (variants[currentTone]) showVariant(currentTone);
}

/* ── GENERATE ── */
async function generate() {
  const content = document.getElementById('content-input').value.trim();
  if (!content) { alert('Tell me what the post is about first.'); return; }

  const author    = document.getElementById('author-input').value.trim() || 'Anurag Rajput';
  const useEmoji  = document.getElementById('opt-emoji').checked;
  const useHooks  = document.getElementById('opt-hooks').checked;
  const useHash   = document.getElementById('opt-hashtags').checked;
  const useCta    = document.getElementById('opt-cta').checked;

  document.getElementById('gen-btn').disabled = true;
  document.getElementById('gen-btn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
  document.getElementById('loading-bar').classList.add('show');
  document.getElementById('placeholder-card').style.display = 'none';

  try {
    const res = await fetch('/api/linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: currentType, tone: currentTone, author, useEmoji, useHooks, useHash, useCta })
    });
    // Safe parse — show real server error
    const rawText = await res.text();
    console.log('[DEBUG] Raw API response:', rawText.slice(0, 500));
    let data;
    try {
      data = JSON.parse(rawText);
    } catch(parseErr) {
      throw new Error('Server returned non-JSON: ' + rawText.slice(0, 200));
    }
    if (!res.ok) throw new Error(data?.error || 'HTTP ' + res.status);
    if (!data?.variants) throw new Error('Missing variants. Server said: ' + JSON.stringify(data).slice(0, 200));
    lastResult = data;
    variants = data.variants || {};

    // Update author display
    const initials = author.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('post-avatar').textContent = initials;
    document.getElementById('post-author-name').textContent = author;
    document.getElementById('post-author-sub').textContent = (data.role || 'Professional') + ' · Just now';

    // Build tone tabs
    buildToneTabs(data.variants);

    // Show current tone
    showVariant(currentTone);

    // Hooks
    if (useHooks && data.hooks?.length) {
      const hc = document.getElementById('hooks-card');
      hc.style.display = 'flex';
      document.getElementById('hooks-list').innerHTML = data.hooks.map(h =>
        `<div class="hook-item" onclick="useHook(this)"><i class="fa-solid fa-arrow-right"></i>${h}</div>`
      ).join('');
    } else {
      document.getElementById('hooks-card').style.display = 'none';
    }

    document.getElementById('output-panel').classList.add('show');
    document.getElementById('output-panel').scrollIntoView({behavior:'smooth',block:'start'});

  } catch(e) {
    // Show full error in debug panel
    const dp = document.getElementById('debug-panel');
    const dc = document.getElementById('debug-content');
    dc.innerHTML = '<b style="color:#ffaa44">Error:</b> ' + e.message + '<br><br><b>Check Vercel logs:</b> vercel.com → project → Deployments → Functions tab';
    dp.style.display = 'block';
    alert('Error: ' + e.message);
    document.getElementById('placeholder-card').style.display = 'flex';
  } finally {
    document.getElementById('gen-btn').disabled = false;
    document.getElementById('gen-btn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Post';
    document.getElementById('loading-bar').classList.remove('show');
  }
}

/* ── BUILD TONE TABS ── */
function buildToneTabs(variants) {
  const tabs = document.getElementById('post-tabs');
  const tones = ['professional','casual','viral'];
  const labels = { professional:'Professional', casual:'Casual', viral:'Viral' };
  tabs.innerHTML = tones.filter(t => variants[t]).map(t =>
    `<button class="post-tab ${t===currentTone?'active':''}" data-tone="${t}" onclick="switchPostTone('${t}')">${labels[t]}</button>`
  ).join('');
}

/* ── SWITCH POST TONE ── */
function switchPostTone(tone) {
  currentTone = tone;
  document.querySelectorAll('.tone-btn').forEach(b => b.classList.toggle('active', b.dataset.t===tone));
  document.querySelectorAll('.post-tab').forEach(t => t.classList.toggle('active', t.dataset.tone===tone));
  showVariant(tone);
}

/* ── SHOW VARIANT ── */
function showVariant(tone) {
  const text = variants[tone] || variants[currentTone] || '';
  const postText = document.getElementById('post-text');
  postText.innerHTML = '';

  // Render lines
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const p = document.createElement('div');
    p.style.marginBottom = i < lines.length-1 ? '.5rem' : '0';
    p.textContent = line;
    postText.appendChild(p);
  });

  updateCharCount(text);

  // Hashtags
  if (lastResult?.hashtags?.length) {
    const hw = document.getElementById('hashtag-wrap');
    hw.style.display = 'flex';
    hw.innerHTML = lastResult.hashtags.map(h =>
      `<span class="hashtag" onclick="copyHashtag(this)">${h}</span>`
    ).join('');
  }
}

/* ── CHAR COUNT ── */
function updateCharCount(text) {
  const len = text.length;
  const max = 3000;
  const pct = Math.min(100, (len/max)*100);
  const el = document.getElementById('char-count');
  const fill = document.getElementById('char-fill');
  el.textContent = `${len} / ${max}`;
  el.className = 'char-count' + (len > max ? ' over' : len > 2500 ? ' warn' : '');
  fill.style.width = pct + '%';
  fill.style.background = len > max ? 'var(--red)' : len > 2500 ? 'var(--gold)' : 'var(--blue2)';
}

/* track edits in post body */
document.getElementById('post-body').addEventListener('input', () => {
  updateCharCount(document.getElementById('post-body').innerText);
});

/* ── USE HOOK ── */
function useHook(el) {
  const hook = el.textContent.replace(/^→?\s*/, '').trim();
  const postText = document.getElementById('post-text');
  // prepend hook as first line
  const current = postText.innerText;
  const lines = current.split('\n');
  lines[0] = hook;
  postText.innerHTML = '';
  lines.forEach((line, i) => {
    const p = document.createElement('div');
    p.style.marginBottom = i < lines.length-1 ? '.5rem' : '0';
    p.textContent = line;
    postText.appendChild(p);
  });
  updateCharCount(postText.innerText);
}

/* ── COPY HASHTAG ── */
function copyHashtag(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    const orig = el.style.background;
    el.style.background = 'rgba(0,230,118,.15)';
    el.style.borderColor = 'var(--green)';
    el.style.color = 'var(--green)';
    setTimeout(() => { el.style.background=''; el.style.borderColor=''; el.style.color=''; }, 1000);
  });
}

/* ── COPY POST ── */
function copyPost() {
  const text = document.getElementById('post-body').innerText;
  const hashtags = lastResult?.hashtags?.length
    ? '\n\n' + lastResult.hashtags.join(' ')
    : '';
  navigator.clipboard.writeText(text + hashtags).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.classList.add('copied');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Post'; }, 2000);
  });
}

/* ── SHARE LINKEDIN ── */
function shareLinkedIn() {
  const text = encodeURIComponent(document.getElementById('post-body').innerText.slice(0,700));
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=https://instai4.github.io/PORT-FOLIO/&summary=${text}`, '_blank');
}

/* ── REGENERATE ── */
async function regenerate() {
  document.getElementById('output-panel').classList.remove('show');
  await generate();
}

/* ── RESET ── */
function resetAll() {
  document.getElementById('content-input').value = '';
  document.getElementById('author-input').value = '';
  document.getElementById('output-panel').classList.remove('show');
  document.getElementById('placeholder-card').style.display = 'flex';
  lastResult = null; variants = {};
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── ENTER TO GENERATE ── */
document.getElementById('content-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) generate();
});
