/* ============================================================
   OneTap Ad Audit Studio · app.js
   화면 조립 · 스웜 커서 애니메이션 · CSV · BYOK · 내보내기.
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.AD_DATA;
  const CORE = window.AD_CORE;
  const BRIDGE = window.AD_BRIDGE;
  const LS = 'onetap.adaudit.v1';
  const KEY_LS = 'onetap.adaudit.keys';
  const VCOLOR = {
    pause: '#B4211C', creative: '#A9550A', cut: '#A9550A',
    scale: '#0B7A55', watch: '#1E40AF', keep: '#616870', paused: '#9AA0A9',
  };
  const ACOLOR = { claude: '#C2410C', gemini: '#6D28D9', gpt: '#0B7A55' };
  const ANAME = { claude: 'Claude', gemini: 'Gemini', gpt: 'GPT' };
  const ORDER = { claude: 0, gemini: 1, gpt: 2 };

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const state = {
    lang: 'ko',
    sampleId: 'ecom',
    currency: 'KRW',
    bench: Object.assign({}, DATA.SAMPLES[0].bench),
    campaigns: clone(DATA.SAMPLES[0].campaigns),
    source: 'sample',
    audit: null,
    revealed: new Set(),
    sim: null,
    applied: false,
    stale: false,
    running: false,
    log: [],
    logTotal: 0,
    activeCopyId: null,
    pro: null,
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /* ── i18n ─────────────────────────────────────────────── */
  function t(key, params) {
    const pack = window.I18N[state.lang] || window.I18N.ko;
    let s = pack[key] != null ? pack[key] : (window.I18N.ko[key] != null ? window.I18N.ko[key] : key);
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (all, k) { return params[k] != null ? String(params[k]) : all; });
    }
    return s;
  }
  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.title = t('meta.title');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));
    const ogt = document.querySelector('meta[property="og:title"]');
    if (ogt) ogt.setAttribute('content', t('meta.ogTitle'));
    const ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', t('meta.ogDescription'));
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-placeholder]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $$('[data-lang]').forEach(function (b) {
      const on = b.getAttribute('data-lang') === state.lang;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ── formatting ───────────────────────────────────────── */
  function fmtInt(n) {
    return new Intl.NumberFormat(state.lang === 'en' ? 'en-US' : 'ko-KR').format(Math.round(n || 0));
  }
  function trim1(n) {
    return new Intl.NumberFormat(state.lang === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 1 }).format(Number(n) || 0);
  }
  function fmtMoney(n, compact) {
    const v = Number(n) || 0;
    if (state.currency === 'USD') {
      if (compact && Math.abs(v) >= 1e6) return '$' + trim1(v / 1e6) + 'M';
      if (compact && Math.abs(v) >= 1e3) return '$' + trim1(v / 1e3) + 'K';
      return '$' + fmtInt(v);
    }
    if (compact) {
      if (state.lang === 'ko') {
        if (Math.abs(v) >= 1e8) return '₩' + trim1(v / 1e8) + '억';
        if (Math.abs(v) >= 1e4) return '₩' + trim1(v / 1e4) + '만';
        return '₩' + fmtInt(v);
      }
      if (Math.abs(v) >= 1e6) return '₩' + trim1(v / 1e6) + 'M';
      if (Math.abs(v) >= 1e3) return '₩' + trim1(v / 1e3) + 'K';
    }
    return '₩' + fmtInt(v);
  }
  function fmtRoas(n) {
    const v = Number(n) || 0;
    return (v >= 100 ? v.toFixed(0) : v.toFixed(2)) + 'x';
  }
  function fmtPct(n) { return (Number(n) || 0).toFixed(2) + '%'; }
  function nameOf(c) { return (c.name && (c.name[state.lang] || c.name.ko || c.name.en)) || ''; }
  function platformLabel(c) { return c.platform === 'naver' ? 'Naver' : 'Meta Ads'; }

  /* ── state persistence ────────────────────────────────── */
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        lang: state.lang, sampleId: state.sampleId, currency: state.currency,
        bench: state.bench, campaigns: state.campaigns, source: state.source,
      }));
    } catch (e) { /* quota/private mode */ }
  }
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { raw = null; }
    if (!raw || !Array.isArray(raw.campaigns) || !raw.campaigns.length) return;
    if (raw.lang === 'en' || raw.lang === 'ko') state.lang = raw.lang;
    if (raw.campaigns.every(function (c) { return c && c.id && c.name; })) {
      state.campaigns = raw.campaigns;
      state.sampleId = raw.sampleId || null;
      state.source = raw.source || 'custom';
      state.currency = raw.currency === 'USD' ? 'USD' : 'KRW';
      if (raw.bench && raw.bench.targetRoas) state.bench = raw.bench;
    }
  }

  /* ── rendering ────────────────────────────────────────── */
  function renderAll() {
    applyI18n();
    renderSamples();
    renderBench();
    renderTable();
    renderKpi();
    renderCopy();
    renderAuditState();
    renderLog();
    renderResult();
    renderSwarmStatus();
    renderAgents(state.audit ? 'done' : 'idle');
    $('#footUpdated').textContent = t('foot.updated', { date: DATA.UPDATED });
    $('#runLabel').textContent = state.running ? t('toolbar.running') : t('toolbar.run');
  }

  function renderSamples() {
    const box = $('#sampleBtns');
    box.innerHTML = DATA.SAMPLES.map(function (s) {
      const on = state.sampleId === s.id;
      return '<button type="button" class="sample-btn' + (on ? ' is-on' : '') + '" data-sample="' + s.id + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(s.note[state.lang]) + '">'
        + '<span>' + esc(s.label[state.lang]) + '</span>'
        + '</button>';
    }).join('');
    $('#sourceHint').textContent = state.source === 'csv' ? t('source.csvOn') : t('source.hint');
  }

  function renderBench() {
    $('#benchLine').textContent = t('bench.line', {
      roas: Number(state.bench.targetRoas).toFixed(1),
      cpa: fmtMoney(state.bench.targetCpa),
    });
  }

  function findingOf(id) {
    if (!state.audit) return null;
    const f = state.audit.findings.find(function (x) { return x.campaignId === id; });
    if (!f) return null;
    if (!state.revealed.has(id)) return null;
    return f;
  }

  function badge(f) {
    if (!f) return '<span class="badge b-none">—</span>';
    return '<span class="badge b-' + f.verdict + '" title="' + esc(reasonText(f)) + '"><i class="dot" aria-hidden="true"></i>' + esc(t('verdict.' + f.verdict)) + '</span>';
  }

  function renderTable() {
    const body = $('#adBody');
    if (!state.campaigns.length) {
      body.innerHTML = '<tr><td colspan="9" style="padding:28px 14px;text-align:center;color:var(--ink-4)">' + esc(t('table.empty')) + '</td></tr>';
      $('#adFoot').innerHTML = '';
      return;
    }
    body.innerHTML = state.campaigns.map(function (c) {
      const m = CORE.metrics(c);
      const f = findingOf(c.id);
      const on = c.status === 'on';
      const nm = nameOf(c);
      return '<tr id="row-' + esc(c.id) + '" data-id="' + esc(c.id) + '" class="' + (on ? '' : 'row-off') + (f ? ' is-flagged' : '') + '"' + (f ? ' style="--flag:' + VCOLOR[f.verdict] + '"' : '') + '>'
        + '<td class="cell-name" data-label="' + esc(t('table.colCampaign')) + '">'
        + '<span class="camp-name"><span class="pf-chip pf-' + esc(c.platform) + '" aria-hidden="true">' + (c.platform === 'naver' ? 'N' : 'M') + '</span>'
        + '<span class="camp-title">' + esc(nm) + '<span class="camp-sub">' + esc(platformLabel(c)) + ' · ' + esc(t('obj.' + (c.objective || 'sales'))) + '</span></span>'
        + '<button type="button" class="edit-btn" data-edit="' + esc(c.id) + '" aria-label="' + esc(t('table.edit') + ' ' + nm) + '">'
        + '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 13.5V16h2.5l8-8-2.5-2.5-8 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>'
        + '</span></td>'
        + '<td class="cell-status" data-label="' + esc(t('table.colStatus')) + '"><button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-toggle="' + esc(c.id) + '" aria-label="' + esc(t(on ? 'table.switchOff' : 'table.switchOn', { name: nm })) + '"></button></td>'
        + '<td class="num cell-budget" data-label="' + esc(t('table.colBudget')) + '">' + esc(fmtMoney(c.dailyBudget)) + '</td>'
        + '<td class="num cell-spend" data-label="' + esc(t('table.colSpend')) + '">' + esc(fmtMoney(m.spend)) + '</td>'
        + '<td class="num cell-roas" data-label="' + esc(t('table.colRoas')) + '">' + esc(m.spend > 0 ? fmtRoas(m.roas) : '—') + '</td>'
        + '<td class="num cell-cpa" data-label="' + esc(t('table.colCpa')) + '">' + esc(m.cpa > 0 ? fmtMoney(m.cpa) : '—') + '</td>'
        + '<td class="num col-ctr" data-label="' + esc(t('table.colCtr')) + '">' + esc(m.imp > 0 ? fmtPct(m.ctr) : '—') + '</td>'
        + '<td class="num col-conv" data-label="' + esc(t('table.colConv')) + '">' + esc(fmtInt(m.conv)) + '</td>'
        + '<td class="cell-verdict" data-label="' + esc(t('table.colVerdict')) + '" id="verdict-' + esc(c.id) + '">' + badge(f) + '</td>'
        + '</tr>';
    }).join('');

    const spend = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.spend); }, 0);
    const rev = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.revenue); }, 0);
    const conv = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.conversions); }, 0);
    const budget = state.campaigns.filter(function (c) { return c.status === 'on'; }).reduce(function (s, c) { return s + CORE.num(c.dailyBudget); }, 0);
    const active = state.campaigns.filter(function (c) { return c.status === 'on'; }).length;
    $('#adFoot').innerHTML = '<tr>'
      + '<td class="tfoot-label">' + esc(t('table.total')) + '</td>'
      + '<td data-label="' + esc(t('table.colStatus')) + '" style="font-weight:600">' + esc(active + ' / ' + state.campaigns.length) + '</td>'
      + '<td class="num" data-label="' + esc(t('table.colBudget')) + '">' + esc(fmtMoney(budget)) + '</td>'
      + '<td class="num" data-label="' + esc(t('table.colSpend')) + '">' + esc(fmtMoney(spend)) + '</td>'
      + '<td class="num" data-label="' + esc(t('table.colRoas')) + '">' + esc(spend > 0 ? fmtRoas(rev / spend) : '—') + '</td>'
      + '<td class="num" data-label="' + esc(t('table.colCpa')) + '">' + esc(conv > 0 ? fmtMoney(spend / conv) : '—') + '</td>'
      + '<td colspan="3"></td>'
      + '</tr>';
  }

  function renderKpi() {
    const active = state.campaigns.filter(function (c) { return c.status === 'on'; });
    const spend = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.spend); }, 0);
    const rev = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.revenue); }, 0);
    const conv = state.campaigns.reduce(function (s, c) { return s + CORE.num(c.conversions); }, 0);
    const daily = active.reduce(function (s, c) { return s + CORE.num(c.dailyBudget); }, 0);
    const roas = spend > 0 ? rev / spend : 0;
    const cpa = conv > 0 ? spend / conv : 0;

    $('#kpiActive').textContent = fmtInt(active.length);
    $('#kpiActiveNote').textContent = t('kpi.activeNote', { n: fmtInt(state.campaigns.length) });
    $('#kpiSpend').textContent = fmtMoney(spend, true);
    $('#kpiSpendNote').textContent = t('kpi.spendNote', { n: fmtMoney(daily, true) });
    $('#kpiRoas').textContent = fmtRoas(roas);
    $('#kpiRoas').classList.toggle('kpi-good', roas >= state.bench.targetRoas);
    $('#kpiRoasNote').textContent = t('kpi.roasNote', { n: fmtRoas(state.bench.targetRoas) });
    $('#kpiCpa').textContent = conv > 0 ? fmtMoney(cpa) : '—';
    $('#kpiCpaNote').textContent = t('kpi.cpaNote', { n: fmtMoney(state.bench.targetCpa) });
  }

  function reasonText(f) {
    const p = Object.assign({}, f.params || {});
    if (p.roas != null) p.roas = fmtRoas(p.roas);
    if (p.target != null) p.target = fmtRoas(p.target);
    if (p.cpa != null) p.cpa = fmtMoney(p.cpa);
    if (p.spend != null) p.spend = fmtMoney(p.spend);
    if (p.ctr != null) p.ctr = Number(p.ctr).toFixed(2);
    if (p.freq != null) p.freq = Number(p.freq).toFixed(1);
    if (p.x != null) p.x = Number(p.x).toFixed(1);
    return t('reason.' + f.reasonKey, p);
  }

  function renderSwarmStatus() {
    const st = $('#swarmStatus');
    if (!st) return;
    st.className = 'swarm-status';
    if (state.running) {
      st.classList.add('is-live');
      $('#swarmStatusText').textContent = t('swarm.running');
    } else if (state.audit) {
      st.classList.add('is-done');
      $('#swarmStatusText').textContent = t('swarm.done');
    } else {
      $('#swarmStatusText').textContent = t('swarm.idle');
    }
  }

  function renderAuditState() {
    const chip = $('#auditState');
    const txt = $('#auditStateText');
    chip.className = 'state-chip';
    if (state.running) {
      txt.textContent = t('toolbar.running');
    } else if (state.audit && state.applied) {
      chip.classList.add('is-done');
      txt.textContent = t('toolbar.applied');
    } else if (state.audit) {
      chip.classList.add('is-done');
      const n = state.audit.findings.filter(function (f) {
        return f.verdict === 'pause' || f.verdict === 'creative' || f.verdict === 'cut' || f.verdict === 'scale';
      }).length;
      txt.textContent = t('toolbar.done', { n: n });
    } else if (state.stale) {
      chip.classList.add('is-stale');
      txt.textContent = t('toolbar.stale');
    } else {
      txt.textContent = t('toolbar.idle');
    }
    $('#applyBtn').disabled = !state.sim || state.applied || state.running;
    $('#applyBtn').textContent = state.applied ? t('toolbar.applied') : t('toolbar.apply');
    $('#runBtn').disabled = state.running;
    $('#runBtn').classList.toggle('is-busy', state.running);
    $('#runLabel').textContent = state.running ? t('toolbar.running') : t('toolbar.run');
    const total = state.logTotal || 0;
    $('#logCount').textContent = (state.log.length) + '/' + total;
  }

  /* ── log ──────────────────────────────────────────────── */
  function renderLog() {
    const ul = $('#swarmLog');
    if (!state.log.length) {
      ul.innerHTML = '<li class="log-empty">' + esc(t('swarm.logEmpty')) + '</li>';
      return;
    }
    ul.innerHTML = state.log.map(function (l) {
      const c = state.campaigns.find(function (x) { return x.id === l.campaignId; });
      const nm = c ? nameOf(c) : '';
      return '<li class="log-line">'
        + '<span class="log-time">' + String(l.step).padStart(2, '0') + '</span>'
        + '<span class="log-dot" style="background:' + ACOLOR[l.agent] + '" aria-hidden="true"></span>'
        + '<span class="log-text"><b>' + ANAME[l.agent] + '</b> · ' + esc(nm) + ' → <span class="lv" style="color:' + VCOLOR[l.verdict] + '">' + esc(t('verdict.' + l.verdict)) + '</span><br><span class="why">' + esc(reasonText(l)) + '</span></span>'
        + '</li>';
    }).join('');
    $('#logCount').textContent = state.log.length + '/' + (state.logTotal || state.log.length);
  }

  function addLog(f, step, total) {
    state.log.push({
      agent: f.agent, campaignId: f.campaignId, verdict: f.verdict,
      reasonKey: f.reasonKey, params: f.params, step: step,
    });
    state.logTotal = total;
    renderLog();
    const ul = $('#swarmLog');
    ul.scrollTop = ul.scrollHeight;
    const last = ul.lastElementChild;
    if (last) last.classList.add('new');
  }

  /* ── result ───────────────────────────────────────────── */
  function renderResult(fresh) {
    const box = $('#resultBox');
    if (!state.sim) {
      box.innerHTML = '<div class="result-head"><h3>' + esc(t('result.title')) + '</h3></div>'
        + '<p class="result-empty">' + esc(t('result.none')) + '</p>';
      return;
    }
    const s = state.sim.summary;
    const tile = function (label, value, sub, cls) {
      return '<div class="res"><div class="res-label">' + esc(label) + '</div>'
        + '<div class="res-value ' + (cls || '') + (fresh ? ' pop' : '') + '">' + esc(value) + '</div>'
        + '<div class="res-sub">' + esc(sub) + '</div></div>';
    };
    box.innerHTML = '<div class="result-head"><h3>' + esc(t('result.title')) + '</h3></div>'
      + '<div class="result-grid">'
      + tile(t('result.savings'), fmtMoney(s.savings, true), t('result.monthly'), 'res-good')
      + tile(t('result.revenue'), '+' + fmtMoney(s.addedRevenue, true), t('result.cpa') + ' ' + fmtMoney(s.cpaOld, true) + ' → ' + fmtMoney(s.cpaNew, true), 'res-good')
      + tile(t('result.roas'), fmtRoas(s.roasNew), t('result.ba', { a: s.roasOld.toFixed(2), b: s.roasNew.toFixed(2) }), 'res-brand')
      + tile(t('result.realloc'), fmtMoney(s.reallocated, true), '+' + s.scaled + ' / OFF ' + s.paused, '')
      + '</div>'
      + '<p class="result-note">' + esc(t('result.assumptions', { n: Math.round(s.maxScale * 100) })) + '</p>';
  }

  /* ── copy panel ───────────────────────────────────────── */
  function copyCandidates() {
    if (!state.audit) return [];
    return state.audit.order.filter(function (f) {
      const c = state.campaigns.find(function (x) { return x.id === f.campaignId; });
      if (!c || c.status === 'off') return false;
      if (f.verdict === 'creative' || f.verdict === 'pause' || f.verdict === 'cut') return true;
      return false;
    });
  }

  function renderCopy() {
    const tabs = $('#copyTabs');
    const body = $('#copyBody');
    const list = copyCandidates();
    if (!list.length) {
      tabs.innerHTML = '';
      body.innerHTML = '<p class="copy-empty">' + esc(t(state.audit ? 'copy.none' : 'copy.before')) + '</p>';
      return;
    }
    if (!state.activeCopyId || !list.some(function (f) { return f.campaignId === state.activeCopyId; })) {
      state.activeCopyId = list[0].campaignId;
    }
    tabs.innerHTML = list.map(function (f) {
      const c = state.campaigns.find(function (x) { return x.id === f.campaignId; });
      const on = f.campaignId === state.activeCopyId;
      return '<button type="button" class="copy-tab' + (on ? ' is-on' : '') + '" data-copy="' + esc(f.campaignId) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + '<span class="badge b-' + f.verdict + '" style="margin-right:5px">' + esc(t('verdict.' + f.verdict)) + '</span>' + esc(nameOf(c)) + '</button>';
    }).join('');

    const f = list.find(function (x) { return x.campaignId === state.activeCopyId; });
    const c = state.campaigns.find(function (x) { return x.id === f.campaignId; });
    const m = CORE.metrics(c);
    const tipKey = CORE.tipKey(c, m, state.bench);
    const tip = DATA.TARGET_TIPS[tipKey][state.lang];
    const pro = state.pro && state.pro.campaignId === f.campaignId ? state.pro : null;
    const variants = pro ? pro.variants : CORE.copyVariants(c, state.lang, DATA.COPY_ANGLES[state.lang]);

    body.innerHTML = '<div class="copy-target"><b>' + esc(t('copy.target')) + '</b><span>' + esc(pro && pro.targeting ? pro.targeting : tip) + '</span></div>'
      + '<div class="variant-grid">' + variants.map(function (v, i) {
        return '<article class="variant">'
          + '<div class="variant-top"><span class="variant-tag">' + esc(v.title || ('Angle ' + (i + 1))) + '</span><span class="variant-n">' + esc(t('copy.variant')) + ' ' + (i + 1) + '</span></div>'
          + '<h4>' + esc(v.headline) + '</h4>'
          + '<p>' + esc(v.body) + '</p>'
          + (v.cta ? '<span class="cta-text">' + esc(v.cta) + '</span>' : '')
          + '</article>';
      }).join('') + '</div>'
      + '<div class="copy-foot"><span class="copy-note">' + esc(pro ? 'Pro · ' + pro.provider + ' · ' + BRIDGE.MODELS[pro.provider] : t('copy.freeNote')) + '</span>'
      + '<button type="button" class="btn btn-sm pro-btn" data-open-pro="1"><i class="pro-dot" aria-hidden="true"></i>' + esc(t('copy.pro')) + '</button></div>';
  }

  /* ── agents ───────────────────────────────────────────── */
  function renderAgents(mode) {
    $$('#agentList .agent').forEach(function (li) {
      const a = li.getAttribute('data-agent');
      const st = li.querySelector('.agent-state');
      li.classList.toggle('is-live', state.agentLive === a);
      if (st) st.textContent = t(mode === 'done' ? 'agent.done' : (mode === 'live' ? 'agent.live' : 'agent.idle'));
      if (state.agentLive === a) li.classList.add('is-live');
    });
  }
  function setAgent(a, mode) {
    state.agentLive = mode === 'live' ? a : (state.agentLive === a ? null : state.agentLive);
    $$('#agentList .agent').forEach(function (li) {
      const id = li.getAttribute('data-agent');
      li.classList.toggle('is-live', id === state.agentLive);
      const st = li.querySelector('.agent-state');
      if (st) {
        if (state.running && (id === state.agentLive)) st.textContent = t('agent.live');
        else if (state.audit && state.revealed.size >= state.campaigns.length) st.textContent = t('agent.done');
        else st.textContent = t('agent.idle');
      }
    });
  }

  function moveCursor(agent, rowEl) {
    if (!rowEl) return;
    const layer = $('#swarmLayer');
    const wrap = $('#tableWrap');
    const cursor = layer.querySelector('.cursor[data-agent="' + agent + '"]');
    if (!cursor || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const r = rowEl.getBoundingClientRect();
    const idx = ORDER[agent] || 0;
    const maxX = Math.max(8, wr.width - 168);
    const x = Math.max(6, Math.min(maxX, r.left - wr.left + 16 + idx * 28));
    const y = Math.max(0, Math.min(Math.max(0, wr.height - 26), r.top - wr.top + r.height / 2 - 8));
    cursor.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    cursor.classList.add('is-live');
  }
  function hideCursors() {
    $$('#swarmLayer .cursor').forEach(function (c) { c.classList.remove('is-live'); });
  }

  /* ── audit run ────────────────────────────────────────── */
  async function runAudit() {
    if (state.running) return;
    if (!state.campaigns.length) { toast(t('table.empty')); return; }
    state.running = true;
    state.log = [];
    state.logTotal = 0;
    state.pro = null;
    state.applied = false;
    state.stale = false;
    document.body.setAttribute('data-audit', 'running');
    const status = $('#swarmStatus');
    status.className = 'swarm-status is-live';
    $('#swarmStatusText').textContent = t('swarm.running');
    $('#runBtn').disabled = true;
    $('#runBtn').classList.add('is-busy');
    $('#runLabel').textContent = t('toolbar.running');
    $('#auditStateText').textContent = t('toolbar.running');

    const a = CORE.audit(state.campaigns, state.bench);
    state.audit = a;
    state.revealed = new Set();
    state.sim = null;
    renderTable();
    renderResult();
    renderAuditState();

    // OFF 상태는 판단할 것이 없으니 즉시 표시한다.
    a.findings.forEach(function (f) { if (f.verdict === 'paused') state.revealed.add(f.campaignId); });
    renderTable();

    const steps = a.order.filter(function (f) { return f.agent; });
    const total = steps.length;
    state.logTotal = total;
    const slow = reduceMotion() ? 20 : 1;
    await sleep(260 * slow);

    for (let i = 0; i < steps.length; i++) {
      const f = steps[i];
      const rowEl = document.getElementById('row-' + f.campaignId);
      setAgent(f.agent, 'live');
      moveCursor(f.agent, rowEl);
      await sleep(240 * slow);
      state.revealed.add(f.campaignId);
      const cell = document.getElementById('verdict-' + f.campaignId);
      if (cell) cell.innerHTML = badge(f);
      if (rowEl) {
        rowEl.classList.add('is-flagged');
        rowEl.style.setProperty('--flag', VCOLOR[f.verdict]);
      }
      addLog(f, i + 1, total);
      await sleep(170 * slow);
    }

    // 결과 계산
    const sim = CORE.simulate(state.campaigns, a.findings, state.bench, state.currency);
    state.sim = sim;
    state.audit = a;
    state.revealed = new Set(a.findings.map(function (f) { return f.campaignId; }));
    state.running = false;
    state.agentLive = null;
    document.body.setAttribute('data-audit', 'done');
    status.className = 'swarm-status is-done';
    $('#swarmStatusText').textContent = t('swarm.done');
    renderTable();
    renderResult(true);
    renderAgents('done');
    renderCopy();
    renderAuditState();
    $('#applyBtn').disabled = false;
    $('#runBtn').disabled = false;
    $('#runBtn').classList.remove('is-busy');
    $('#runLabel').textContent = t('toolbar.run');
    $$('#agentList .agent-state').forEach(function (el) { el.textContent = t('agent.done'); });
    hideCursorsDelayed();
    save();
  }

  function hideCursorsDelayed() {
    setTimeout(hideCursors, reduceMotion() ? 10 : 1200);
  }

  /* ── data actions ─────────────────────────────────────── */
  function resetAudit(stale) {
    state.audit = null;
    state.revealed = new Set();
    state.sim = null;
    state.applied = false;
    state.log = [];
    state.logTotal = 0;
    state.pro = null;
    state.stale = !!stale;
    document.body.setAttribute('data-audit', 'idle');
    renderSwarmStatus();
    $('#applyBtn').disabled = true;
    hideCursors();
    $$('#agentList .agent-state').forEach(function (el) { el.textContent = t('agent.idle'); });
    $$('#agentList .agent').forEach(function (el) { el.classList.remove('is-live'); });
  }

  function loadSample(id) {
    const s = DATA.SAMPLES.find(function (x) { return x.id === id; });
    if (!s) return;
    state.sampleId = s.id;
    state.currency = s.currency;
    state.bench = Object.assign({}, s.bench);
    state.campaigns = clone(s.campaigns);
    state.source = 'sample';
    state.activeCopyId = null;
    resetAudit(false);
    renderAll();
    save();
    toast(t('toast.sample'));
  }

  function setCampaigns(list, sourceLabel) {
    if (!list.length) return false;
    state.campaigns = list;
    state.sampleId = null;
    state.source = 'csv';
    state.activeCopyId = null;
    resetAudit(false);
    renderAll();
    save();
    return true;
  }

  function importCsv(text) {
    const hasDollar = /(^|[^A-Za-z])\$/.test(text);
    const hasWon = /₩|원/.test(text);
    const res = CORE.parseCsv(text, {
      currency: state.currency,
      defaultPlatform: 'meta',
      startId: Date.now() % 100000,
    });
    if (res.error === 'noname') { toast(t('source.failName')); return; }
    if (!res.campaigns.length) { toast(t('source.failEmpty')); return; }
    const nextCurrency = (hasDollar && !hasWon) ? 'USD' : (hasWon ? 'KRW' : state.currency);
    if (nextCurrency !== state.currency) {
      state.currency = nextCurrency;
      state.bench = Object.assign({}, state.bench, { targetCpa: nextCurrency === 'USD' ? 250 : 25000 });
    }
    setCampaigns(res.campaigns, 'csv');
    $('#pasteBox').hidden = true;
    $('#pasteToggle').setAttribute('aria-expanded', 'false');
    toast(t('source.parsed', { n: res.campaigns.length }));
  }

  function toggleCampaign(id) {
    const c = state.campaigns.find(function (x) { return x.id === id; });
    if (!c) return;
    c.status = c.status === 'on' ? 'off' : 'on';
    resetAudit(true);
    renderAll();
    save();
    toast(t('toast.toggled', { name: nameOf(c), state: t('table.' + c.status) }));
  }

  /* ── row modal ────────────────────────────────────────── */
  let editingId = null;
  function openRowModal(c) {
    editingId = c ? c.id : null;
    $('#rowModalTitle').textContent = t(c ? 'dlg.editTitle' : 'dlg.addTitle');
    const m = c ? CORE.metrics(c) : { spend: 0, conv: 0, revenue: 0, freq: 0 };
    $('#fName').value = c ? nameOf(c) : '';
    $('#fPlatform').value = c ? c.platform : 'meta';
    $('#fObjective').value = c ? (c.objective || 'sales') : 'sales';
    $('#fStatus').value = c ? c.status : 'on';
    $('#fBudget').value = c ? String(CORE.num(c.dailyBudget)) : '0';
    $('#fSpend').value = c ? String(CORE.num(c.spend)) : '0';
    $('#fImp').value = c ? String(CORE.num(c.impressions)) : '0';
    $('#fClicks').value = c ? String(CORE.num(c.clicks)) : '0';
    $('#fConv').value = c ? String(Math.round(CORE.num(c.conversions))) : '0';
    $('#fRevenue').value = c ? String(CORE.num(c.revenue)) : '0';
    $('#fFreq').value = c ? String(CORE.num(c.frequency)) : '0';
    $('#deleteRowBtn').hidden = !c;
    showModal('row');
    setTimeout(function () { $('#fName').focus(); }, 20);
  }

  function saveRow() {
    const name = $('#fName').value.trim();
    if (!name) { $('#fName').focus(); return; }
    const data = {
      name: { ko: name, en: name },
      platform: $('#fPlatform').value,
      objective: $('#fObjective').value,
      status: $('#fStatus').value,
      dailyBudget: CORE.num($('#fBudget').value),
      spend: CORE.num($('#fSpend').value),
      impressions: CORE.num($('#fImp').value),
      clicks: CORE.num($('#fClicks').value),
      conversions: CORE.num($('#fConv').value),
      revenue: CORE.num($('#fRevenue').value),
      frequency: CORE.num($('#fFreq').value),
    };
    if (editingId) {
      const c = state.campaigns.find(function (x) { return x.id === editingId; });
      if (c) Object.assign(c, data);
      resetAudit(true);
      toast(t('toast.updated'));
    } else {
      state.campaigns.push(Object.assign({ id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 100) }, data));
      state.sampleId = null;
      state.source = 'custom';
      resetAudit(false);
      toast(t('toast.added'));
    }
    hideModal('row');
    renderAll();
    save();
  }

  function deleteRow() {
    if (!editingId) return;
    state.campaigns = state.campaigns.filter(function (c) { return c.id !== editingId; });
    state.sampleId = null;
    state.source = 'custom';
    resetAudit(true);
    hideModal('row');
    renderAll();
    save();
    toast(t('toast.deleted'));
  }

  /* ── modals ───────────────────────────────────────────── */
  function showModal(which) {
    const el = which === 'row' ? $('#rowModal') : $('#proModal');
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    const first = el.querySelector('input, select, button');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function hideModal(which) {
    const el = which === 'row' ? $('#rowModal') : $('#proModal');
    el.hidden = true;
    if ($('#rowModal').hidden && $('#proModal').hidden) document.body.style.overflow = '';
  }

  /* ── pro / BYOK ───────────────────────────────────────── */
  function readKeys() {
    try { return JSON.parse(localStorage.getItem(KEY_LS) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeKeys(keys) {
    try { localStorage.setItem(KEY_LS, JSON.stringify(keys)); } catch (e) { /* noop */ }
  }
  function fillKeyState() {
    const keys = readKeys();
    ['openai', 'gemini', 'claude'].forEach(function (p) {
      const el = document.querySelector('[data-key-state="' + p + '"]');
      if (!el) return;
      const has = !!keys[p];
      el.textContent = has ? t('pro.saved') : '—';
      el.classList.toggle('on', has);
    });
  }
  function openPro() {
    const keys = readKeys();
    ['openai', 'gemini', 'claude'].forEach(function (p) {
      const input = document.querySelector('[data-key="' + p + '"]');
      if (input) input.value = keys[p] || '';
    });
    fillKeyState();
    showModal('pro');
  }
  function saveKeys() {
    const keys = readKeys();
    ['openai', 'gemini', 'claude'].forEach(function (p) {
      const input = document.querySelector('[data-key="' + p + '"]');
      if (!input) return;
      const v = input.value.trim();
      if (v) keys[p] = v; else delete keys[p];
    });
    writeKeys(keys);
    fillKeyState();
    toast(t('toast.keySaved'));
  }
  async function generatePro(provider) {
    const keys = readKeys();
    const key = (keys[provider] || '').trim();
    if (!key) {
      showPro(t('pro.needKey', { name: provider === 'openai' ? 'OpenAI' : (provider === 'gemini' ? 'Gemini' : 'Claude') }));
      return;
    }
    const list = copyCandidates();
    const f = list.find(function (x) { return x.campaignId === state.activeCopyId; }) || list[0];
    if (!f) { showPro(t('copy.none')); return; }
    const c = state.campaigns.find(function (x) { return x.id === f.campaignId; });
    const m = CORE.metrics(c);
    const tip = DATA.TARGET_TIPS[CORE.tipKey(c, m, state.bench)][state.lang];
    const prompt = BRIDGE.buildPrompt(c, m, Object.assign({ currency: state.currency }, state.bench), state.lang, tip);
    const btn = $('#proGenerate');
    btn.disabled = true;
    btn.textContent = t('pro.generating');
    showPro(t('pro.generating'));
    try {
      const out = await BRIDGE.callProvider(provider, key, prompt);
      const variants = BRIDGE.parseVariants(out.text, state.lang);
      if (!variants.length) throw new Error('no variants in response');
      state.pro = {
        campaignId: f.campaignId,
        provider: provider,
        variants: variants.slice(0, 3),
        targeting: (variants.find(function (v) { return v.targeting; }) || {}).targeting || '',
      };
      showPro(t('pro.resultTitle') + '\n\n' + variants.map(function (v, i) {
        return (i + 1) + '. ' + v.headline + '\n' + v.body + (v.cta ? '\n→ ' + v.cta : '');
      }).join('\n\n'));
      renderCopy();
      toast(t('pro.done'));
    } catch (e) {
      showPro(t('pro.error', { msg: String(e.message || e).slice(0, 160) }));
    } finally {
      btn.disabled = false;
      btn.textContent = t('pro.generate');
    }
  }
  function showPro(msg) {
    const box = $('#proResult');
    box.hidden = false;
    box.textContent = msg;
  }

  /* ── export ───────────────────────────────────────────── */
  function buildPlan() {
    let a = state.audit;
    if (!a) a = CORE.audit(state.campaigns, state.bench);
    const sim = state.sim || CORE.simulate(state.campaigns, a.findings, state.bench, state.currency);
    const rows = sim.rows.map(function (r) {
      const f = a.findings.find(function (x) { return x.campaignId === r.id; });
      return {
        name: nameOf(r.campaign),
        platform: platformLabel(r.campaign),
        status: t('table.' + (r.campaign.status === 'on' ? 'on' : 'off')),
        recStatus: r.verdict === 'pause' ? t('table.off') : t('table.on'),
        dailyBudget: r.campaign.dailyBudget,
        newDaily: r.newDaily,
        delta: r.newDaily - r.campaign.dailyBudget,
        spend: r.metrics.spend,
        roas: r.metrics.roas,
        cpa: r.metrics.cpa,
        verdict: t('verdict.' + (f ? f.verdict : 'keep')),
        reason: f ? reasonText(f) : '',
      };
    });
    return { sim: sim, rows: rows, findings: a.findings };
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function exportCsv() {
    const plan = buildPlan();
    const header = state.lang === 'en'
      ? ['campaign', 'platform', 'status', 'recommended_status', 'daily_budget', 'recommended_daily_budget', 'spend_30d', 'roas', 'cpa', 'verdict', 'reason']
      : ['캠페인', '매체', '상태', '권장상태', '일예산', '권장일예산', '지출30일', 'ROAS', 'CPA', '판정', '근거'];
    const rows = plan.rows.map(function (r) {
      return [r.name, r.platform, r.status, r.recStatus, r.dailyBudget, r.newDaily, Math.round(r.spend), r.roas.toFixed(2), Math.round(r.cpa), r.verdict, r.reason];
    });
    download('ad-audit-budget-plan.csv', CORE.toCsv(rows, header), 'text/csv');
    toast(t('toast.csv'));
  }

  function exportMd() {
    const plan = buildPlan();
    const list = copyCandidates();
    const copies = list.slice(0, 3).map(function (f) {
      const c = state.campaigns.find(function (x) { return x.id === f.campaignId; });
      const v = (state.pro && state.pro.campaignId === f.campaignId ? state.pro.variants : CORE.copyVariants(c, state.lang, DATA.COPY_ANGLES[state.lang]));
      return v.map(function (x) { return { campaign: nameOf(c), title: x.title, headline: x.headline, body: x.body, cta: x.cta }; });
    }).reduce(function (a, b) { return a.concat(b); }, []);
    const labels = {
      spend: t('table.colSpend'), revenue: t('dlg.revenue'), savings: t('result.savings'),
    };
    const md = CORE.toMarkdown({
      summary: plan.sim.summary,
      rows: plan.rows.map(function (r) {
        return { name: r.name, verdictLabel: r.verdict, dailyBudget: r.dailyBudget, newDaily: r.newDaily, spend: r.spend, roas: r.roas, reason: r.reason };
      }),
      copies: copies,
    }, {
      title: 'Ad audit report · ' + (state.lang === 'en' ? 'Meta & Naver' : 'Meta · 네이버'),
      date: (function () {
        const d = new Date();
        const p2 = function (v) { return String(v).padStart(2, '0'); };
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      })(),
      dateLabel: state.lang === 'en' ? 'Date' : '작성일',
      accountLabel: state.lang === 'en' ? 'Campaigns' : '캠페인',
      account: String(state.campaigns.length),
      benchLabel: state.lang === 'en' ? 'Target' : '목표',
      targetRoas: state.bench.targetRoas.toFixed(1),
      targetCpa: fmtMoney(state.bench.targetCpa),
      summaryLabel: state.lang === 'en' ? 'Summary' : '요약',
      metricLabel: state.lang === 'en' ? 'Metric' : '지표',
      beforeLabel: state.lang === 'en' ? 'Now' : '현재',
      afterLabel: state.lang === 'en' ? 'Plan' : '제안',
      planLabel: state.lang === 'en' ? 'Budget plan' : '예산안',
      colCampaign: state.lang === 'en' ? 'Campaign' : '캠페인',
      colVerdict: state.lang === 'en' ? 'Verdict' : '판정',
      colBudget: state.lang === 'en' ? 'Daily budget' : '일 예산',
      colSpend: state.lang === 'en' ? 'Spend 30d' : '지출 30일',
      colReason: state.lang === 'en' ? 'Why' : '근거',
      copyLabel: state.lang === 'en' ? 'Creative drafts' : '소재 초안',
      labels: labels,
      fmtMoney: function (n) { return fmtMoney(n); },
      fmtRoas: function (n) { return fmtRoas(n); },
      disclaimer: t('foot.disclaimer'),
    });
    download('ad-audit-report.md', md, 'text/markdown');
    toast(t('toast.md'));
  }

  /* ── toast ────────────────────────────────────────────── */
  function toast(msg) {
    const root = $('#toastRoot');
    while (root.children.length >= 2) root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 1900);
  }

  /* ── events ───────────────────────────────────────────── */
  function bind() {
    $$('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.running) return;
        state.lang = b.getAttribute('data-lang');
        save();
        renderAll();
      });
    });

    $('#sampleBtns').addEventListener('click', function (e) {
      const b = e.target.closest('[data-sample]');
      if (b) loadSample(b.getAttribute('data-sample'));
    });

    $('#pasteToggle').addEventListener('click', function () {
      const box = $('#pasteBox');
      box.hidden = !box.hidden;
      $('#pasteToggle').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      if (!box.hidden) $('#csvText').focus();
    });
    $('#parseBtn').addEventListener('click', function () {
      const text = $('#csvText').value;
      if (!text.trim()) { $('#csvText').focus(); return; }
      importCsv(text);
    });
    $('#csvFile').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { importCsv(String(reader.result || '')); };
      reader.onerror = function () { toast(t('source.failEmpty')); };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    $('#addRowBtn').addEventListener('click', function () { openRowModal(null); });
    $('#saveRowBtn').addEventListener('click', saveRow);
    $('#deleteRowBtn').addEventListener('click', deleteRow);

    $('#adBody').addEventListener('click', function (e) {
      const sw = e.target.closest('[data-toggle]');
      if (sw) { toggleCampaign(sw.getAttribute('data-toggle')); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const c = state.campaigns.find(function (x) { return x.id === ed.getAttribute('data-edit'); });
        if (c) openRowModal(c);
      }
    });

    $('#runBtn').addEventListener('click', runAudit);

    $('#applyBtn').addEventListener('click', function () {
      if (!state.sim || state.applied) return;
      state.campaigns = CORE.applyPlan(state.campaigns, state.sim);
      state.applied = true;
      state.activeCopyId = null;
      renderAll();
      save();
      toast(t('toast.applied'));
    });

    $('#csvBtn').addEventListener('click', exportCsv);
    $('#mdBtn').addEventListener('click', exportMd);

    $('#copyTabs').addEventListener('click', function (e) {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      state.activeCopyId = b.getAttribute('data-copy');
      renderCopy();
    });
    $('#copyBody').addEventListener('click', function (e) {
      if (e.target.closest('[data-open-pro]')) openPro();
    });
    $('#copyProBtn').addEventListener('click', openPro);
    $('#proBtn').addEventListener('click', openPro);
    $('#proSave').addEventListener('click', saveKeys);
    $('#proClear').addEventListener('click', function () {
      writeKeys({});
      ['openai', 'gemini', 'claude'].forEach(function (p) {
        const input = document.querySelector('[data-key="' + p + '"]');
        if (input) input.value = '';
      });
      fillKeyState();
      toast(t('toast.keyCleared'));
    });
    $('#proGenerate').addEventListener('click', function () { generatePro($('#proProvider').value); });

    $$('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { hideModal(el.getAttribute('data-close')); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#rowModal').hidden) hideModal('row');
      else if (!$('#proModal').hidden) hideModal('pro');
    });

    window.addEventListener('resize', function () { if (!state.running) hideCursors(); });
  }

  /* ── boot ─────────────────────────────────────────────── */
  load();
  bind();
  renderAll();
  document.body.setAttribute('data-audit', 'idle');
  window.__AD_STATE = state; // uitest에서 상태를 읽기 위한 읽기 전용 핸들
})();
