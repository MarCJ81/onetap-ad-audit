/* ============================================================
   OneTap Ad Audit Studio · core.js
   광고 감사 엔진 + 예산 재배분 시뮬레이터 + CSV 파서 + 내보내기.
   DOM을 쓰지 않는다. node test.js와 브라우저가 같은 코드를 쓴다.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AD_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── 숫자 ─────────────────────────────────────────────── */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).trim();
    if (!s || s === '-' || s === '—' || s === '–') return 0;
    let mult = 1;
    if (/억$/.test(s)) { mult = 1e8; s = s.replace(/억$/, ''); }
    else if (/만$/.test(s)) { mult = 1e4; s = s.replace(/만$/, ''); }
    const neg = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, '')
      .replace(/[₩$€£¥]/g, '')
      .replace(/(원|달러|KRW|USD|krw|usd)/g, '')
      .replace(/[,\s]/g, '')
      .replace(/%$/, '');
    const n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return (neg ? -n : n) * mult;
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function roundBudget(v, currency) {
    const step = currency === 'USD' ? 10 : 1000;
    return Math.max(0, Math.round(v / step) * step);
  }

  /* ── 지표 ─────────────────────────────────────────────── */
  function metrics(c) {
    const spend = num(c.spend);
    const revenue = num(c.revenue);
    const imp = num(c.impressions);
    const clicks = num(c.clicks);
    const conv = num(c.conversions);
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conv > 0 ? spend / conv : 0;
    const ctr = imp > 0 ? (clicks / imp) * 100 : 0;
    const cvr = clicks > 0 ? (conv / clicks) * 100 : 0;
    const freq = num(c.frequency);
    return {
      spend, revenue, imp, clicks, conv, roas, cpa, ctr, cvr, freq,
      aov: conv > 0 ? revenue / conv : 0,
    };
  }

  const VERDICT_PRIORITY = { pause: 1, creative: 2, cut: 3, scale: 4, watch: 5, keep: 6, paused: 7 };
  const AGENT_OF = { pause: 'gpt', scale: 'gpt', creative: 'claude', cut: 'gemini', watch: 'gemini', keep: 'gemini', paused: null };

  /* ── 감사 ─────────────────────────────────────────────────
     bench: { targetRoas, targetCpa, minConv }
     규칙은 목표 대비 배수만 본다. 업종이 달라도 같은 잣대가 된다. */
  function audit(campaigns, bench) {
    const b = Object.assign({ targetRoas: 3, targetCpa: 25000, minConv: 5 }, bench || {});
    const findings = (campaigns || []).map(function (c) {
      const m = metrics(c);
      let verdict = 'keep';
      let reasonKey = 'keep';
      let params = {};

      if (c.status === 'off') {
        verdict = 'paused';
        reasonKey = 'paused';
        params = { spend: m.spend };
      } else if (m.spend <= 0) {
        verdict = 'watch';
        reasonKey = 'nospend';
      } else {
        const r = m.roas;
        const t = b.targetRoas;
        const cpaLimit = b.targetCpa;
        if (m.conv <= 0 && m.spend >= cpaLimit * 3) {
          verdict = 'pause'; reasonKey = 'zero';
          params = { spend: m.spend, cpa: cpaLimit };
        } else if (r < t * 0.6) {
          verdict = 'pause'; reasonKey = 'bleed';
          params = { roas: round2(r), target: round2(t), pct: Math.round((r / t) * 100) };
        } else if (r < t * 0.85 && m.cpa > cpaLimit * 1.4) {
          verdict = 'pause'; reasonKey = 'cpa';
          params = { roas: round2(r), cpa: m.cpa, target: cpaLimit };
        } else if (r < t * 0.85 && (m.ctr < 0.9 || m.freq >= 3.5)) {
          verdict = 'creative'; reasonKey = 'creative';
          params = { ctr: round2(m.ctr), freq: round2(m.freq) };
        } else if (r < t * 0.85) {
          verdict = 'cut'; reasonKey = 'cut';
          params = { roas: round2(r), target: round2(t) };
        } else if (r < t) {
          verdict = 'watch'; reasonKey = 'watch';
          params = { roas: round2(r), target: round2(t) };
        } else if (m.cpa > cpaLimit * 1.3) {
          verdict = 'watch'; reasonKey = 'cpaWatch';
          params = { cpa: m.cpa, target: cpaLimit, roas: round2(r) };
        } else {
          verdict = 'scale'; reasonKey = 'scale';
          params = { roas: round2(r), target: round2(t), x: round2(r / t), pct: 30 };
        }
      }

      return {
        campaignId: c.id,
        verdict: verdict,
        agent: AGENT_OF[verdict],
        reasonKey: reasonKey,
        params: params,
        metrics: m,
        priority: VERDICT_PRIORITY[verdict] || 9,
      };
    });

    const counts = { total: findings.length, pause: 0, creative: 0, cut: 0, scale: 0, watch: 0, keep: 0, paused: 0, active: 0 };
    findings.forEach(function (f) { counts[f.verdict] = (counts[f.verdict] || 0) + 1; });
    counts.active = counts.total - counts.paused;

    // 화면·로그 순서: 적자 → 소재 → 예산 → 증액 → 관찰 → 유지 → OFF
    const order = findings.slice().sort(function (a, b2) {
      if (a.priority !== b2.priority) return a.priority - b2.priority;
      return b2.metrics.spend - a.metrics.spend;
    });

    return { findings: findings, order: order, counts: counts, bench: b };
  }

  /* ── 예산 재배분 시뮬레이션 ────────────────────────────────
     1) OFF/감액으로 생긴 풀을 만든다.
     2) 풀의 10%는 현금으로 남기고(reserve), 나머지를 고효율 캠페인에
        ROAS 비중으로 나눠 준다. 캠페인당 +80%까지만 흡수한다.
     3) 증액분의 매출은 현재 ROAS × 효율계수(0.85)로 보수적으로 잡는다. */
  function simulate(campaigns, findings, bench, currency) {
    const b = Object.assign({ targetRoas: 3, targetCpa: 25000, maxScale: 0.8, reserve: 0.1, efficiency: 0.85 }, bench || {});
    const byId = {};
    (findings || []).forEach(function (f) { byId[f.campaignId] = f; });

    const rows = (campaigns || []).map(function (c) {
      const m = metrics(c);
      const f = byId[c.id] || { verdict: 'keep', reasonKey: 'keep', params: {}, metrics: m, agent: 'gemini' };
      let factor = 1;
      if (f.verdict === 'pause') factor = 0;
      else if (f.verdict === 'creative' || f.verdict === 'cut') factor = 0.75;
      const newSpend = m.spend * factor;
      return {
        id: c.id,
        campaign: c,
        verdict: f.verdict,
        agent: f.agent,
        reasonKey: f.reasonKey,
        params: f.params,
        metrics: m,
        factor: factor,
        spend: newSpend,
        revenue: m.revenue * factor,
        conv: m.conv * factor,
        alloc: 0,
        capLeft: m.spend * b.maxScale,
      };
    });

    const spendOld = rows.reduce(function (s, r) { return s + r.metrics.spend; }, 0);
    const revOld = rows.reduce(function (s, r) { return s + r.metrics.revenue; }, 0);
    const convOld = rows.reduce(function (s, r) { return s + r.metrics.conv; }, 0);
    const pool = rows.reduce(function (s, r) { return s + (r.metrics.spend - r.spend); }, 0);
    const reserve = pool * b.reserve;
    let remaining = pool - reserve;
    const reallocTarget = remaining;

    const scaleRows = rows.filter(function (r) { return r.verdict === 'scale' && r.capLeft > 0; });
    for (let round = 0; round < 4 && remaining > 0.5; round++) {
      const open = scaleRows.filter(function (r) { return r.capLeft > 0.5; });
      if (!open.length) break;
      const wsum = open.reduce(function (s, r) { return s + Math.max(0.2, r.metrics.roas); }, 0);
      let used = 0;
      open.forEach(function (r) {
        const want = remaining * (Math.max(0.2, r.metrics.roas) / wsum);
        const give = Math.min(want, r.capLeft);
        r.alloc += give;
        r.capLeft -= give;
        used += give;
      });
      remaining -= used;
      if (used < 0.5) break;
    }

    rows.forEach(function (r) {
      if (r.alloc > 0) {
        r.spend += r.alloc;
        const gain = r.alloc * r.metrics.roas * b.efficiency;
        r.revenue += gain;
        if (r.metrics.cpa > 0) r.conv += r.alloc / r.metrics.cpa;
      }
      r.newDaily = roundBudget(r.campaign.dailyBudget * (r.metrics.spend > 0 ? r.spend / r.metrics.spend : 1), currency);
      if (r.verdict === 'paused') r.newDaily = 0;
    });

    const spendNew = rows.reduce(function (s, r) { return s + r.spend; }, 0);
    const revNew = rows.reduce(function (s, r) { return s + r.revenue; }, 0);
    const convNew = rows.reduce(function (s, r) { return s + r.conv; }, 0);
    const reallocated = rows.reduce(function (s, r) { return s + r.alloc; }, 0);

    return {
      rows: rows,
      summary: {
        spendOld: spendOld,
        spendNew: spendNew,
        revOld: revOld,
        revNew: revNew,
        convOld: convOld,
        convNew: convNew,
        roasOld: spendOld > 0 ? revOld / spendOld : 0,
        roasNew: spendNew > 0 ? revNew / spendNew : 0,
        cpaOld: convOld > 0 ? spendOld / convOld : 0,
        cpaNew: convNew > 0 ? spendNew / convNew : 0,
        pool: pool,
        reserve: reserve,
        reallocTarget: reallocTarget,
        reallocated: reallocated,
        savings: spendOld - spendNew,
        addedRevenue: revNew - revOld,
        roasLift: (spendNew > 0 ? revNew / spendNew : 0) - (spendOld > 0 ? revOld / spendOld : 0),
        paused: rows.filter(function (r) { return r.verdict === 'pause'; }).length,
        scaled: rows.filter(function (r) { return r.alloc > 0; }).length,
        efficiency: b.efficiency,
        maxScale: b.maxScale,
      },
    };
  }

  /* 예산안을 표에 적용: OFF는 상태까지 끈다. */
  function applyPlan(campaigns, sim) {
    const byId = {};
    (sim.rows || []).forEach(function (r) { byId[r.id] = r; });
    return (campaigns || []).map(function (c) {
      const r = byId[c.id];
      if (!r) return c;
      const next = Object.assign({}, c, { dailyBudget: r.newDaily });
      if (r.verdict === 'pause') next.status = 'off';
      return next;
    });
  }

  /* ── 표준 CSV 엔진 (PapaParse) ───────────────────────────────
     페이지에 papaparse가 있으면 그 파서를 쓰고, 없으면 아래 자체 파서로
     그대로 동작한다. 어느 쪽을 썼는지 결과에 남긴다. */
  const ENGINES = { csv: null };

  function setCsvEngine(impl) {
    if (impl) ENGINES.csv = impl;
    return ENGINES.csv;
  }

  function csvEngine() {
    if (ENGINES.csv) return ENGINES.csv;
    if (typeof globalThis !== 'undefined' && globalThis.Papa && typeof globalThis.Papa.parse === 'function') {
      ENGINES.csv = globalThis.Papa;
    }
    return ENGINES.csv;
  }

  /* BOM·UTF-16·CP949(네이버 export)까지 읽는다. */
  function decodeCsvBytes(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    function tryDecode(label, slice, fatal) {
      const decoder = new TextDecoder(label, fatal ? { fatal: true } : undefined);
      return decoder.decode(bytes.subarray(slice || 0));
    }
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: tryDecode('utf-8', 3), encoding: 'utf-8', bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return { text: tryDecode('utf-16le', 2), encoding: 'utf-16le', bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return { text: tryDecode('utf-16be', 2), encoding: 'utf-16be', bom: true };
    }
    try {
      return { text: tryDecode('utf-8', 0, true), encoding: 'utf-8', bom: false };
    } catch (err) {
      /* UTF-8로 읽히지 않으면 CP949(한국 엑셀·네이버 export)로 다시 시도한다. */
      try {
        return { text: tryDecode('euc-kr', 0, false), encoding: 'euc-kr', bom: false };
      } catch (err2) {
        return { text: tryDecode('utf-8', 0, false), encoding: 'utf-8', bom: false, lossy: true };
      }
    }
  }

  /* ── CSV 파서 ──────────────────────────────────────────────
     Meta Ads Manager(영문), 네이버 광고관리자(국문), 엑셀 붙여넣기
     (탭 구분)를 모두 받는다. 따옴표 안의 쉼표·줄바꿈도 처리. */
  function splitRows(text, delim) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += ch;
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delim) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
    return rows;
  }

  function detectDelimiter(text) {
    const firstLine = String(text).split(/\r?\n/)[0] || '';
    let tabs = 0, commas = 0, semis = 0, quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted) {
        if (ch === '\t') tabs++;
        else if (ch === ',') commas++;
        else if (ch === ';') semis++;
      }
    }
    if (tabs > commas && tabs > semis) return '\t';
    if (semis > commas) return ';';
    return ',';
  }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .toLowerCase()
      .replace(/[\s_\-./·:]/g, '')
      .trim();
  }

  function headerMap(headerRow, aliases) {
    const map = {};
    const seen = {};
    headerRow.forEach(function (h, i) {
      const key = normalizeHeader(h);
      if (!key) return;
      Object.keys(aliases).forEach(function (field) {
        if (map[field] != null) return;
        if (aliases[field].indexOf(key) !== -1) {
          map[field] = i;
          seen[field] = h;
        }
      });
    });
    return { map: map, seen: seen };
  }

  function parseStatus(v) {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return 'on';
    if (/^(off|paused|pause|inactive|disabled|false|0|중지|중단|꺼짐|일시중지|비활성|종료)/.test(s)) return 'off';
    return 'on';
  }

  function inferPlatform(name, fallback) {
    const s = String(name || '').toLowerCase();
    if (/네이버|naver|파워링크|플레이스|검색광고|블로그/.test(s)) return 'naver';
    if (/메타|meta|인스타|인스타그램|instagram|페이스북|facebook|릴스|reels/.test(s)) return 'meta';
    return fallback || 'meta';
  }

  function parseCsv(text, opts) {
    const o = Object.assign({ currency: 'KRW', defaultPlatform: 'meta', startId: 1 }, opts || {});
    const clean = String(text || '').replace(/^\uFEFF/, '');
    let delim = detectDelimiter(clean);
    let rows = null;
    let engine = 'builtin';
    let warnings = [];

    const papa = csvEngine();
    if (papa) {
      try {
        const parsed = papa.parse(clean, {
          delimiter: '', newline: '', quoteChar: '"', escapeChar: '"',
          header: false, skipEmptyLines: 'greedy', dynamicTyping: false,
        });
        if (parsed && Array.isArray(parsed.data) && parsed.data.length) {
          rows = parsed.data;
          engine = 'papaparse';
          if (parsed.meta && parsed.meta.delimiter) delim = parsed.meta.delimiter;
          if (parsed.errors && parsed.errors.length) {
            warnings = parsed.errors.slice(0, 3).map(function (e) {
              return { row: e.row, message: e.message };
            });
          }
        }
      } catch (e) {
        rows = null;
      }
    }
    if (!rows) rows = splitRows(clean, delim);
    if (!rows.length) {
      return { campaigns: [], skipped: 0, delimiter: delim, fields: [], engine: engine, error: 'empty' };
    }

    const hm = headerMap(rows[0], AD_ALIASES());
    if (hm.map.name == null) {
      return {
        campaigns: [], skipped: rows.length - 1, delimiter: delim,
        fields: Object.keys(hm.map), engine: engine, error: 'noname',
      };
    }

    const out = [];
    let skipped = 0;
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const name = String(cells[hm.map.name] || '').trim();
      if (!name) { skipped++; continue; }
      if (/^(total|합계|총계|summary|소계)$/i.test(name)) { skipped++; continue; }
      const get = function (field) {
        const idx = hm.map[field];
        return idx == null ? '' : cells[idx];
      };
      const spend = num(get('spend'));
      let conversions = num(get('conversions'));
      let revenue = num(get('revenue'));
      const roas = num(get('roas'));
      const cpa = num(get('cpa'));
      if (!revenue && roas && spend) revenue = spend * roas;
      if (!conversions && cpa > 0) conversions = spend / cpa;
      const platformRaw = String(get('platform') || '');
      let platform = o.defaultPlatform;
      if (/naver|네이버/i.test(platformRaw)) platform = 'naver';
      else if (/meta|메타|facebook|인스타/i.test(platformRaw)) platform = 'meta';
      else platform = inferPlatform(name, o.defaultPlatform);

      out.push({
        id: 'imp' + (o.startId + out.length),
        name: { ko: name, en: name },
        platform: platform,
        objective: /리드|lead|데모|상담|신청|demo|signup/i.test(name) ? 'lead' : 'sales',
        status: parseStatus(get('status')),
        dailyBudget: num(get('budget')),
        spend: spend,
        impressions: num(get('impressions')),
        clicks: num(get('clicks')),
        conversions: conversions,
        revenue: revenue,
        frequency: num(get('frequency')),
      });
    }
    return {
      campaigns: out,
      skipped: skipped,
      delimiter: delim,
      fields: Object.keys(hm.map),
      header: hm.seen,
      engine: engine,
      warnings: warnings,
      rows: rows.length,
      error: out.length ? null : 'range',
    };
  }

  function AD_ALIASES() {
    // 순환 참조를 피하려고 data.js가 있을 때만 읽는다.
    if (typeof module === 'object' && module.exports) {
      try { return require('./data.js').CSV_ALIASES; } catch (e) { /* noop */ }
    }
    if (typeof globalThis !== 'undefined' && globalThis.AD_DATA) return globalThis.AD_DATA.CSV_ALIASES;
    return {};
  }

  /* ── 소재 초안 (무료 규칙 엔진) ────────────────────────────
     캠페인 이름에서 운영용 단어(리타겟팅·룩얼라이크 등)를 걷어내고
     소재가 말할 수 있는 주제(topic)만 남긴다. 없으면 목표별 기본값. */
  const TOPIC_STOP = ['리타겟팅', '리타게팅', '프로스펙팅', '룩얼라이크', '카탈로그', '전체', '리드폼', '파워링크', '플레이스', '브랜드', '검색', '방어', '릴스', '소재', '캠페인', '프로모션', '메타', '인스타', '인스타그램', '네이버', '관심사', '광범위', '데모', 'retargeting', 'prospecting', 'lookalike', 'catalog', 'full', 'leadform', 'powerlink', 'place', 'brand', 'search', 'defense', 'reels', 'creative', 'campaign', 'promo', 'meta', 'naver', 'instagram', 'broad', 'interests', 'demo'];
  const TOPIC_FALLBACK = {
    ko: { sales: '이번 세일', lead: '무료 견적', traffic: '새로 나온 것', awareness: '요즘 뜨는 것' },
    en: { sales: 'this week\'s sale', lead: 'a free quote', traffic: 'what is new', awareness: 'what people look for' },
  };

  function topicOf(c, lang) {
    const raw = typeof c.name === 'string' ? c.name : (c.name && (c.name[lang] || c.name.ko || c.name.en)) || '';
    const parts = raw.split(/[·|,>]/).map(function (part) {
      const words = part.trim().split(/\s+/).filter(function (w) {
        if (!w) return false;
        if (/^[\d.,%()]+$/.test(w)) return false;
        if (TOPIC_STOP.indexOf(w.toLowerCase()) !== -1) return false;
        return true;
      });
      return words.join(' ').trim();
    }).filter(Boolean);
    const topic = parts.join(' ').trim();
    if (topic.length >= 2 && topic.length <= 28) return topic;
    const obj = c.objective || 'sales';
    return (TOPIC_FALLBACK[lang === 'en' ? 'en' : 'ko'][obj]) || (lang === 'en' ? 'this offer' : '이번 조건');
  }

  function copyParams(c, m, currency, lang) {
    const objective = c.objective || 'sales';
    const l = lang === 'en' ? 'en' : 'ko';
    const audience = {
      ko: { sales: '구매 직전 고객', lead: '상담을 고민하는 고객', traffic: '처음 둘러보는 손님', awareness: '아직 우리를 모르는 고객' },
      en: { sales: 'buyers about to decide', lead: 'people weighing a quote', traffic: 'first-time visitors', awareness: 'people who do not know you yet' },
    }[l][objective] || (l === 'en' ? 'customers' : '고객');
    return {
      topic: topicOf(c, l),
      audience: audience,
      currency: currency || 'KRW',
    };
  }

  function fillTemplate(str, params) {
    return String(str).replace(/\{(\w+)\}/g, function (all, key) {
      return params[key] != null ? String(params[key]) : all;
    });
  }

  function copyVariants(c, lang, angles) {
    const l = lang === 'en' ? 'en' : 'ko';
    const list = angles || (typeof globalThis !== 'undefined' && globalThis.AD_DATA ? globalThis.AD_DATA.COPY_ANGLES[l] : null);
    if (!list) return [];
    const m = metrics(c);
    const p = copyParams(c, m, null, l);
    const cap = function (str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; };
    return list.map(function (a) {
      let headline = fillTemplate(a.headline, p);
      let body = fillTemplate(a.body, p);
      if (l === 'en') { headline = cap(headline); body = cap(body); }
      return { key: a.key, title: a.title, headline: headline, body: body, cta: a.cta };
    });
  }

  function tipKey(c, m, bench) {
    const b = Object.assign({ targetCpa: 25000 }, bench || {});
    if (m.freq >= 3.5) return 'frequency';
    if (m.ctr > 0 && m.ctr < 0.9) return 'ctr';
    if (m.cpa > b.targetCpa * 1.3) return 'cpa';
    if (m.roas >= b.targetRoas) return 'scale';
    return 'audience';
  }

  /* ── 내보내기 ────────────────────────────────────────────── */
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows, header) {
    const cols = header && header.length ? header : Object.keys(rows[0] || {});
    const lines = [cols.map(csvCell).join(',')];
    rows.forEach(function (r) {
      if (Array.isArray(r)) lines.push(r.map(csvCell).join(','));
      else lines.push(cols.map(function (c) { return csvCell(r[c]); }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function toMarkdown(plan, opts) {
    const o = opts || {};
    const s = plan.summary || {};
    const rows = plan.rows || [];
    const fm = o.fmtMoney || function (n) { return String(Math.round(n)); };
    const fx = o.fmtRoas || function (n) { return Number(n).toFixed(2); };
    const label = o.labels || {};
    const L = function (key, fallback) { return label[key] || fallback || key; };
    const out = [];
    out.push('# ' + (o.title || 'Ad audit report'));
    out.push('');
    out.push('- ' + (o.dateLabel || 'Date') + ': ' + (o.date || ''));
    out.push('- ' + (o.accountLabel || 'Account') + ': ' + (o.account || ''));
    out.push('- ' + (o.benchLabel || 'Target') + ': ROAS ' + (o.targetRoas || '') + ' / CPA ' + (o.targetCpa || ''));
    out.push('');
    out.push('## ' + (o.summaryLabel || 'Summary'));
    out.push('');
    out.push('| ' + (o.metricLabel || 'Metric') + ' | ' + (o.beforeLabel || 'Before') + ' | ' + (o.afterLabel || 'After') + ' |');
    out.push('| --- | --- | --- |');
    out.push('| ' + L('spend', 'Spend') + ' | ' + fm(s.spendOld) + ' | ' + fm(s.spendNew) + ' |');
    out.push('| ' + L('revenue', 'Revenue') + ' | ' + fm(s.revOld) + ' | ' + fm(s.revNew) + ' |');
    out.push('| ROAS | ' + fx(s.roasOld) + ' | ' + fx(s.roasNew) + ' |');
    out.push('| CPA | ' + fm(s.cpaOld) + ' | ' + fm(s.cpaNew) + ' |');
    out.push('| ' + L('savings', 'Saved') + ' | — | ' + fm(s.savings) + ' |');
    out.push('');
    out.push('## ' + (o.planLabel || 'Budget plan'));
    out.push('');
    out.push('| ' + (o.colCampaign || 'Campaign') + ' | ' + (o.colVerdict || 'Verdict') + ' | ' + (o.colBudget || 'Budget') + ' | ' + (o.colSpend || 'Spend') + ' | ROAS | ' + (o.colReason || 'Reason') + ' |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    rows.forEach(function (r) {
      out.push('| ' + [r.name, r.verdictLabel, fm(r.dailyBudget) + ' → ' + fm(r.newDaily), fm(r.spend), fx(r.roas), r.reason].join(' | ') + ' |');
    });
    out.push('');
    if (plan.copies && plan.copies.length) {
      out.push('## ' + (o.copyLabel || 'Creative drafts'));
      out.push('');
      plan.copies.forEach(function (cp, i) {
        out.push('### ' + (i + 1) + '. ' + cp.campaign + ' — ' + cp.title);
        out.push('');
        out.push('**' + cp.headline + '**');
        out.push('');
        out.push(cp.body);
        out.push('');
        out.push('CTA: ' + cp.cta);
        out.push('');
      });
    }
    out.push('---');
    out.push(o.disclaimer || 'Simulation based on the last 30 days. Results vary.');
    out.push('');
    return out.join('\n');
  }

  return {
    num, round2, roundBudget, metrics, audit, simulate, applyPlan,
    parseCsv, splitRows, detectDelimiter, normalizeHeader, parseStatus, inferPlatform,
    decodeCsvBytes, setCsvEngine, csvEngine,
    copyVariants, copyParams, topicOf, tipKey, toCsv, toMarkdown,
    VERDICT_PRIORITY, AGENT_OF,
  };
});
