/* ============================================================
   OneTap Ad Audit Studio · engines/ai-bridge.js
   Pro(BYOK) 브리지: 브라우저에서 제공자 API로 직접 호출한다.
   키는 호출 인자로만 쓰고 어디에도 저장하지 않는다(저장은 app.js).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AD_BRIDGE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODELS = {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    claude: 'claude-3-5-haiku-latest',
  };

  const ENDPOINTS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    claude: 'https://api.anthropic.com/v1/messages',
  };

  function money(n, cur) {
    const unit = cur === 'USD' ? '$' : '₩';
    return unit + Math.round(n).toLocaleString('en-US');
  }

  /* 캠페인 하나를 모델에 넘길 프롬프트로 만든다. */
  function buildPrompt(campaign, m, bench, lang, tip) {
    const name = typeof campaign.name === 'string' ? campaign.name : (campaign.name[lang] || campaign.name.en || '');
    const ko = lang !== 'en';
    const lines = [];
    if (ko) {
      lines.push('너는 퍼포먼스 마케터다. 아래 캠페인의 카피와 타겟을 다시 쓴다.');
      lines.push('');
      lines.push('- 캠페인: ' + name);
      lines.push('- 매체: ' + campaign.platform + ' / 목표: ' + campaign.objective);
      lines.push('- 최근 30일: 지출 ' + money(m.spend, bench.currency) + ', ROAS ' + m.roas.toFixed(2) + ', CPA ' + money(m.cpa, bench.currency) + ', CTR ' + m.ctr.toFixed(2) + '%, 빈도 ' + m.freq.toFixed(1));
      lines.push('- 목표: ROAS ' + bench.targetRoas + ' / CPA ' + money(bench.targetCpa, bench.currency));
      if (tip) lines.push('- 진단: ' + tip);
      lines.push('');
      lines.push('요구: 서로 다른 각도의 광고 3안. 각 안은 headline(20자 내외), body(2문장, 80자 내외), cta(8자 내외).');
      lines.push('그리고 타겟 조정안 한 줄(targeting). 과장·보장·최상급 표현은 쓰지 않는다.');
      lines.push('출력은 설명 없이 JSON 배열만: [{"headline":"","body":"","cta":"","targeting":""}, ...]');
    } else {
      lines.push('You are a performance marketer. Rewrite the ad copy and targeting for this campaign.');
      lines.push('');
      lines.push('- Campaign: ' + name);
      lines.push('- Platform: ' + campaign.platform + ' / objective: ' + campaign.objective);
      lines.push('- Last 30 days: spend ' + money(m.spend, bench.currency) + ', ROAS ' + m.roas.toFixed(2) + ', CPA ' + money(m.cpa, bench.currency) + ', CTR ' + m.ctr.toFixed(2) + '%, frequency ' + m.freq.toFixed(1));
      lines.push('- Target: ROAS ' + bench.targetRoas + ' / CPA ' + money(bench.targetCpa, bench.currency));
      if (tip) lines.push('- Diagnosis: ' + tip);
      lines.push('');
      lines.push('Give three ads in three different angles. Each: headline (under 40 chars), body (two sentences, under 140 chars), cta (under 14 chars).');
      lines.push('Add one line of targeting advice (targeting). No hype, no guarantees, no superlatives.');
      lines.push('Output only a JSON array, no prose: [{"headline":"","body":"","cta":"","targeting":""}, ...]');
    }
    return lines.join('\n');
  }

  function buildBody(provider, key, prompt) {
    if (provider === 'openai') {
      return {
        url: ENDPOINTS.openai,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model: MODELS.openai,
            temperature: 0.7,
            messages: [
              { role: 'system', content: 'You write direct-response ad copy that sounds like a real operator, never like an AI.' },
              { role: 'user', content: prompt },
            ],
          }),
        },
      };
    }
    if (provider === 'gemini') {
      return {
        url: ENDPOINTS.gemini,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
          }),
        },
      };
    }
    return {
      url: ENDPOINTS.claude,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODELS.claude,
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    };
  }

  function textOf(provider, data) {
    if (!data) return '';
    if (provider === 'openai') return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (provider === 'gemini') {
      const cand = data.candidates && data.candidates[0];
      if (!cand || !cand.content || !cand.content.parts) return '';
      return cand.content.parts.map(function (p) { return p.text || ''; }).join('');
    }
    if (Array.isArray(data.content)) return data.content.map(function (p) { return p.text || ''; }).join('');
    return '';
  }

  async function callProvider(provider, key, prompt, fetchImpl) {
    const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new Error('fetch unavailable');
    const req = buildBody(provider, key, prompt);
    const res = await f(req.url, req.init);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status);
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return { text: textOf(provider, data), raw: data };
  }

  /* 모델이 JSON만 주지 않아도 3안을 건진다. */
  function parseVariants(text, lang) {
    if (!text) return [];
    let body = String(text).trim();
    let arr = null;
    const start = body.indexOf('[');
    const end = body.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try { arr = JSON.parse(body.slice(start, end + 1)); } catch (e) { arr = null; }
    }
    if (!arr) {
      try { arr = JSON.parse(body); } catch (e) { arr = null; }
    }
    if (Array.isArray(arr)) {
      return arr.slice(0, 3).map(function (v, i) {
        return {
          title: (lang === 'en' ? ['Angle 1', 'Angle 2', 'Angle 3'] : ['각도 1', '각도 2', '각도 3'])[i],
          headline: String(v.headline || v.title || '').trim(),
          body: String(v.body || v.text || '').trim(),
          cta: String(v.cta || '').trim(),
          targeting: String(v.targeting || '').trim(),
        };
      }).filter(function (v) { return v.headline || v.body; });
    }
    // 폴백: "1." / "-" 로 시작하는 블록
    const blocks = body.split(/\n(?=\s*(?:\d+[.)]|[-*])\s)/).map(function (s) { return s.trim(); }).filter(Boolean);
    return blocks.slice(0, 3).map(function (b, i) {
      const lines = b.split('\n').map(function (s) { return s.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim(); }).filter(Boolean);
      return {
        title: (lang === 'en' ? 'Angle ' : '각도 ') + (i + 1),
        headline: lines[0] || '',
        body: lines.slice(1).join(' '),
        cta: '',
        targeting: '',
      };
    }).filter(function (v) { return v.headline; });
  }

  return { MODELS, ENDPOINTS, buildPrompt, buildBody, textOf, callProvider, parseVariants };
});
