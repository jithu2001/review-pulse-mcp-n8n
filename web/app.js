(() => {
  const cfg = window.REVIEW_PULSE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { file: null, rows: null, samples: [], result: null, product: '' };

  // ======================================================================
  // Small DOM helpers
  // ======================================================================
  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('--')) n.style.setProperty(k, v);
      else n[k] = v;
    }
    for (const c of children) n.append(c);
    return n;
  }
  const fill = (id, items, make) => $(id).replaceChildren(...items.map(make));
  function showError(id, msg) {
    const n = $(id);
    n.hidden = !msg;
    n.textContent = msg;
    if (msg) { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
  }

  // ======================================================================
  // Motion: split headlines, scroll reveal, count-up, spotlight, magnetic
  // ======================================================================
  function splitWords(root) {
    if (root.dataset.splitDone) return;
    let i = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(' '); return; }
        frag.append(el('span', { className: 'w' }, el('span', { '--i': i++, textContent: part })));
      });
      node.replaceWith(frag);
    }
    root.dataset.splitDone = '1';
  }

  function countUp(node) {
    const to = Number(node.dataset.count);
    const dec = Number(node.dataset.dec || 0);
    const suffix = node.dataset.suffix || '';
    if (reduceMotion || !isFinite(to)) { node.textContent = to.toFixed(dec) + suffix; return; }
    const t0 = performance.now(), dur = 1400;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      node.textContent = (to * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  function armReveals(scope) {
    scope.querySelectorAll('.split').forEach(splitWords);
    scope.querySelectorAll('[data-reveal], .split').forEach(n => {
      n.classList.remove('in');
      io.observe(n);
    });
  }

  // Pointer spotlight on panels
  document.addEventListener('pointermove', e => {
    const panel = e.target.closest?.('.panel');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    panel.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // Magnetic primary buttons
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.magnetic').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  // ======================================================================
  // Views + step indicator
  // ======================================================================
  const STEPS = ['upload', 'analyze', 'review', 'done'];
  let current = 'upload';

  function movePill() {
    const active = document.querySelectorAll('#steps li')[STEPS.indexOf(current)];
    const pill = document.querySelector('.steps-pill');
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  function show(view) {
    const swap = () => {
      current = view;
      for (const v of STEPS) $('view-' + v).hidden = v !== view;
      const idx = STEPS.indexOf(view);
      document.querySelectorAll('#steps li').forEach((li, i) => {
        li.classList.toggle('active', i === idx);
        li.classList.toggle('complete', i < idx);
      });
      $('approval-bar').classList.toggle('in', view === 'review');
      window.scrollTo({ top: 0, behavior: 'instant' });
      movePill();
      armReveals($('view-' + view));
      if (view === 'done') {
        const seal = $('seal');
        seal.classList.remove('play');
        void seal.getBoundingClientRect();
        seal.classList.add('play');
      }
    };
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(swap);
    else swap();
  }
  addEventListener('resize', movePill);
  document.fonts?.ready.then(movePill);

  // ======================================================================
  // CSV preview (client side, used for the snapshot and the live ticker)
  // ======================================================================
  function findCol(fields, names) {
    const lower = fields.map(f => String(f).trim().toLowerCase());
    for (const n of names) {
      const i = lower.indexOf(n);
      if (i !== -1) return fields[i];
    }
    return null;
  }

  function weekStart(d) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  }

  function summarise(rows, fields) {
    const dateCol = findCol(fields, ['date', 'review date', 'at', 'created_at', 'timestamp']);
    const ratingCol = findCol(fields, ['rating', 'score', 'stars', 'star rating']);
    const textCol = findCol(fields, ['review', 'content', 'text', 'body', 'comment', 'review text']);
    const ratings = [0, 0, 0, 0, 0];
    let ratingSum = 0, ratingN = 0, min = null, max = null;
    const weeks = new Map();
    const samples = [];

    for (const r of rows) {
      let rating = null;
      if (ratingCol) {
        const v = Math.round(Number(r[ratingCol]));
        if (v >= 1 && v <= 5) { ratings[v - 1]++; ratingSum += v; ratingN++; rating = v; }
      }
      if (dateCol && r[dateCol]) {
        const d = new Date(r[dateCol]);
        if (!isNaN(d)) {
          if (!min || d < min) min = d;
          if (!max || d > max) max = d;
          const w = weekStart(d);
          weeks.set(w, (weeks.get(w) || 0) + 1);
        }
      }
      const text = textCol ? String(r[textCol] || '').trim() : '';
      if (text.split(/\s+/).length >= 6 && samples.length < 60) samples.push({ text, rating });
    }
    return {
      summary: {
        count: rows.length,
        ratings: ratingN ? ratings : null,
        avg: ratingN ? ratingSum / ratingN : null,
        lowShare: ratingN ? (ratings[0] + ratings[1]) / ratingN : null,
        range: min ? [min, max] : null,
        weeks: [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      },
      samples,
    };
  }

  const parseCsv = file => new Promise(resolve => {
    if (!window.Papa) return resolve(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve({ rows: r.data, fields: r.meta.fields || [] }),
      error: () => resolve(null),
    });
  });

  const fmtDate = d => d.toISOString().slice(0, 10);

  // A stat tile; numeric values count up when revealed.
  function statTile(value, label, opts = {}) {
    const b = el('b', { textContent: typeof value === 'number' ? '0' : value });
    if (opts.className) b.className = opts.className;
    if (typeof value === 'number') {
      b.dataset.count = value;
      b.dataset.dec = opts.dec || 0;
      b.dataset.suffix = opts.suffix || '';
    }
    return el('div', { className: opts.tile || '' }, b, el('span', { textContent: label }));
  }

  async function onFile(file) {
    state.file = file;
    state.rows = null;
    state.samples = [];
    $('dropzone').classList.add('has-file');
    $('drop-empty').hidden = true;
    $('drop-full').hidden = false;
    $('file-name').textContent = file.name;
    $('file-stats').replaceChildren();

    const parsed = await parseCsv(file);
    if (parsed && parsed.rows.length) {
      const { summary, samples } = summarise(parsed.rows, parsed.fields);
      state.rows = summary;
      state.samples = samples;
      const tiles = [statTile(summary.count, 'reviews')];
      if (summary.avg) tiles.push(statTile(summary.avg, 'avg rating', { dec: 2, suffix: '★' }));
      if (summary.lowShare != null) tiles.push(statTile(Math.round(summary.lowShare * 100), '1–2★ share', { suffix: '%' }));
      $('file-stats').replaceChildren(...tiles);
      $('file-stats').querySelectorAll('[data-count]').forEach(countUp);
    } else {
      $('file-stats').replaceChildren(el('p', { className: 'drop-sub', textContent: 'No local preview for this file. It will still be analysed.' }));
    }
  }

  const dz = $('dropzone');
  $('file-input').addEventListener('change', e => e.target.files[0] && onFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'dragend'].forEach(t => dz.addEventListener(t, () => dz.classList.remove('drag')));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) { $('file-input').files = e.dataTransfer.files; onFile(f); }
  });

  // ======================================================================
  // Analysing view: pipeline, timer, ticker of real reviews
  // ======================================================================
  // Stage timings are typical, not reported by n8n: the analyse call is one request.
  const PIPELINE = [
    { at: 0, title: 'Reading the CSV', detail: 'Extracting and aggregating every row' },
    { at: 6, title: 'Clustering themes', detail: 'Up to 5 themes, top 3 ranked, real quotes, fee confusion' },
    { at: 35, title: 'Writing the weekly pulse', detail: '250 words or fewer, structured JSON' },
    { at: 45, title: 'Fact-checking the fee', detail: 'Web search for official pricing and help pages' },
    { at: 95, title: 'Preparing your report', detail: 'Doc note, email draft and format checks' },
  ];
  let timerId = null;

  function renderPipeline() {
    fill('pipeline', PIPELINE, s => el('li', {},
      el('span', { className: 'pipe-node' }),
      el('div', { className: 'pipe-text' }, el('strong', { textContent: s.title }), el('span', { textContent: s.detail }))));
  }

  function setPipeline(activeIdx, allDone = false) {
    [...$('pipeline').children].forEach((li, i) => {
      li.classList.toggle('done', allDone || i < activeIdx);
      li.classList.toggle('active', !allDone && i === activeIdx);
    });
  }

  function renderTicker() {
    const samples = state.samples.slice(0, 24);
    $('ticker-panel').hidden = !samples.length;
    if (!samples.length) return;
    const make = s => el('div', { className: 'tick' },
      el('span', {
        className: 'tick-stars' + (s.rating && s.rating <= 2 ? ' low' : ''),
        textContent: s.rating ? '★'.repeat(s.rating) + '☆'.repeat(5 - s.rating) : '—',
      }),
      el('p', { textContent: s.text.length > 180 ? s.text.slice(0, 177) + '…' : s.text }));
    $('ticker').replaceChildren(...samples.map(make), ...samples.map(make));
    $('ticker').style.setProperty('--ticker-dur', samples.length * 4 + 's');
  }

  function startAnalysing() {
    $('a-product').textContent = state.product;
    renderPipeline();
    renderTicker();
    const t0 = Date.now();
    const tick = () => {
      const s = (Date.now() - t0) / 1000;
      $('timer').textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      // Approaches 95% asymptotically; snaps to 100% when n8n responds.
      $('progress-bar').style.transform = `scaleX(${0.95 * (1 - Math.exp(-s / 70))})`;
      let idx = 0;
      PIPELINE.forEach((p, i) => { if (s >= p.at) idx = i; });
      setPipeline(idx);
    };
    tick();
    timerId = setInterval(tick, 500);
  }
  const stopAnalysing = () => clearInterval(timerId);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', body });
    const text = await res.text();
    if (!res.ok) throw new Error(`n8n returned ${res.status}: ${text.slice(0, 400) || res.statusText}`);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('n8n did not return JSON: ' + text.slice(0, 400)); }
    return Array.isArray(data) ? data[0] : data;
  }

  $('upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const product = form.product_name.value.trim();
    if (!product) { form.product_name.focus(); return showError('upload-error', 'Give the product a name.'); }
    if (!state.file) return showError('upload-error', 'Add a reviews CSV to analyse.');
    if (!cfg.analyzeUrl) return showError('upload-error', 'analyzeUrl is not set in config.js.');
    showError('upload-error', '');
    state.product = product;

    const body = new FormData();
    body.append('product_name', product);
    body.append('official_sources', form.official_sources.value.trim());
    body.append('binary_file', state.file, state.file.name);

    $('submit-btn').disabled = true;
    show('analyze');
    startAnalysing();
    try {
      state.result = await postJson(cfg.analyzeUrl, body);
      stopAnalysing();
      setPipeline(PIPELINE.length, true);
      $('progress-bar').style.transform = 'scaleX(1)';
      await wait(reduceMotion ? 0 : 900);
      renderReview(state.result);
      show('review');
    } catch (err) {
      stopAnalysing();
      show('upload');
      showError('upload-error', 'Analysis failed. ' + err.message +
        (err instanceof TypeError ? '\nCheck that n8n is running, the workflow is active and CORS allows this origin.' : ''));
    } finally {
      $('submit-btn').disabled = false;
    }
  });

  // ======================================================================
  // Review view
  // ======================================================================
  function renderDataset(s) {
    $('dataset-card').hidden = !s;
    if (!s) return;

    const tiles = [statTile(s.count, 'reviews analysed', { tile: 'stat' })];
    if (s.avg) tiles.push(statTile(s.avg, 'average rating', { tile: 'stat', dec: 2, suffix: '★' }));
    if (s.lowShare != null) tiles.push(statTile(Math.round(s.lowShare * 100), 'are 1–2★ reviews', { tile: 'stat', suffix: '%' }));
    if (s.range) {
      const [from, to] = s.range.map(fmtDate);
      tiles.push(statTile(from === to ? from : `${from.slice(5)} → ${to.slice(5)}`,
        from === to ? 'all reviews dated' : 'date range', { tile: 'stat', className: 'small-val' }));
    }
    $('stats').replaceChildren(...tiles);

    if (s.ratings) {
      const top = Math.max(...s.ratings, 1);
      fill('rating-bars', [5, 4, 3, 2, 1], (n, i) => el('div', { className: 'row' },
        el('span', { textContent: n + '★' }),
        el('div', { className: 'track' },
          el('div', { className: 'fill' + (n <= 2 ? ' low' : n === 3 ? ' mid' : ''), '--s': s.ratings[n - 1] / top, '--delay': (i * 0.08) + 's' })),
        el('span', { className: 'num', textContent: s.ratings[n - 1] })));
    } else {
      $('rating-bars').replaceChildren(el('p', { className: 'empty-note', textContent: 'No rating column found.' }));
    }

    const wb = $('week-bars');
    if (wb.nextElementSibling?.classList.contains('cols-labels')) wb.nextElementSibling.remove();
    if (s.weeks.length > 1) {
      const top = Math.max(...s.weeks.map(w => w[1]), 1);
      wb.replaceChildren(...s.weeks.map(([w, c], i) => el('div', {
        className: 'col', title: `Week of ${w}: ${c} reviews`,
        style: { height: (c / top * 100) + '%' }, '--delay': (i * 0.05) + 's',
      })));
      wb.after(el('div', { className: 'cols-labels' },
        el('span', { textContent: s.weeks[0][0] }), el('span', { textContent: s.weeks[s.weeks.length - 1][0] })));
    } else {
      wb.replaceChildren(el('p', {
        className: 'empty-note',
        textContent: s.weeks.length ? 'All reviews fall in a single week.' : 'No date column found.',
      }));
    }
  }

  function renderReview(r) {
    const pulse = r.pulse || {};
    const fee = r.fee || {};
    const rec = r.record || {};

    const title = $('r-title');
    delete title.dataset.splitDone;
    title.replaceChildren(document.createTextNode((r.product || state.product) + ', '), el('em', { textContent: 'this week.' }));

    const chips = [];
    if (r.date) chips.push(['', r.date]);
    if (r.review_count) chips.push([r.review_count, ' reviews']);
    if (r.pulse_word_count) chips.push([r.pulse_word_count, '-word pulse']);
    fill('r-meta', chips, ([b, t]) => el('span', { className: 'chip' }, el('b', { textContent: b }), t));

    const warnings = r.warnings || [];
    $('checks').replaceChildren(...(warnings.length
      ? warnings.map(w => el('div', { className: 'check warn', textContent: w }))
      : [el('div', { className: 'check ok', textContent: 'All format checks passed.' })]));

    renderDataset(state.rows);

    fill('r-themes', rec.top_themes || pulse.top_themes || [], t => el('li', { textContent: t }));
    $('r-analysis').textContent = r.analysis_text || '(not returned)';
    fill('r-quotes', pulse.supporting_quotes || [], q =>
      el('blockquote', { className: 'quote', textContent: String(q).replace(/^["“”']+|["“”']+$/g, '') }));
    $('r-observation').textContent = pulse.key_observation || '';
    fill('r-actions', pulse.action_ideas || [], a => el('li', { textContent: a }));

    $('r-fee-issue').textContent = rec.identified_fee_issue || fee.identified_fee_issue || 'No fee confusion identified';
    $('r-fee-signal').textContent = fee.user_confusion_from_reviews || '';
    fill('r-fee-bullets', rec.explanation_bullets || fee.explanation_bullets || [], b => el('li', { textContent: b }));
    fill('r-sources', rec.source_links || fee.source_links || [], u =>
      el('li', {}, /^https?:\/\//i.test(u)
        ? el('a', { href: u, textContent: u, target: '_blank', rel: 'noopener noreferrer' })
        : el('span', { textContent: u })));
    $('r-checked').textContent = r.last_checked ? 'Last checked ' + r.last_checked : '';

    $('r-subject').textContent = r.subject || '';
    $('r-email').textContent = r.email_body || '';
    $('r-doc').textContent = r.doc_note || '';

    $('approve-btn').disabled = $('reject-btn').disabled = false;
    showError('approve-error', '');
  }

  // ======================================================================
  // Approve / reject
  // ======================================================================
  $('approve-btn').addEventListener('click', async () => {
    const r = state.result;
    if (!cfg.approveUrl) return showError('approve-error', 'approveUrl is not set in config.js.');
    const btn = $('approve-btn');
    btn.disabled = $('reject-btn').disabled = true;
    btn.classList.add('loading');
    btn.querySelector('.btn-label').textContent = 'Logging via MCP';
    showError('approve-error', '');
    try {
      const body = new URLSearchParams({ subject: r.subject, doc_note: r.doc_note, email_body: r.email_body });
      const res = await postJson(cfg.approveUrl, body);
      done(true, res.output || 'Logged.');
    } catch (err) {
      showError('approve-error', 'Logging failed. ' + err.message);
      btn.disabled = $('reject-btn').disabled = false;
    } finally {
      btn.classList.remove('loading');
      btn.querySelector('.btn-label').textContent = 'Approve & log';
    }
  });

  $('reject-btn').addEventListener('click', () =>
    done(false, 'No Google Doc entry or Gmail draft was created. You can still download the report.'));

  function done(ok, msg) {
    $('seal').classList.toggle('rejected', !ok);
    $('done-title').replaceChildren(...(ok
      ? ['Logged to Docs, ', el('em', { textContent: 'drafted in Gmail.' })]
      : ['Rejected. ', el('em', { textContent: 'Nothing was written.' })]));
    $('done-output').textContent = msg;
    show('done');
  }

  $('back-btn').addEventListener('click', () => show('review'));

  function restart() {
    $('upload-form').reset();
    state.file = state.rows = state.result = null;
    state.samples = [];
    $('dropzone').classList.remove('has-file');
    $('drop-empty').hidden = false;
    $('drop-full').hidden = true;
    showError('upload-error', '');
    show('upload');
  }
  $('restart-btn').addEventListener('click', restart);
  $('brand').addEventListener('click', e => {
    e.preventDefault();
    if (current !== 'analyze') restart();
  });

  // ======================================================================
  // Markdown download
  // ======================================================================
  $('download-btn').addEventListener('click', () => {
    const r = state.result;
    if (!r) return;
    const p = r.pulse || {}, f = r.fee || {}, rec = r.record || {};
    const list = (xs, numbered) => (xs || []).map((x, i) => (numbered ? `${i + 1}. ` : '- ') + x).join('\n');
    const md = [
      `# Weekly Product Pulse: ${r.product} (${r.date})`, '',
      '## Top themes', list(rec.top_themes || p.top_themes), '',
      '## What users are saying', (p.supporting_quotes || []).map(q => '> ' + q).join('\n\n'), '',
      '## Key observation', p.key_observation || '', '',
      '## Action ideas for the product team', list(p.action_ideas, true), '',
      '---', '', '# Fee Explainer', '',
      `**Identified fee issue:** ${rec.identified_fee_issue || f.identified_fee_issue || ''}`, '',
      `**Review signal:** ${f.user_confusion_from_reviews || ''}`, '',
      '**Explanation:**', '', list(rec.explanation_bullets || f.explanation_bullets), '',
      '**Official sources:**', '', list(rec.source_links || f.source_links), '',
      `_Last checked: ${r.last_checked || ''}_`, '',
      '---', '', '## Full theme analysis', '', '```', r.analysis_text || '', '```', '',
    ].join('\n');
    const a = el('a', {
      href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })),
      download: `weekly-pulse-${String(r.product || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.date}.md`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ======================================================================
  // Boot
  // ======================================================================
  document.querySelectorAll('#steps li')[0].classList.add('active');
  movePill();
  armReveals($('view-upload'));
})();
