/* ============================================================
   OneTap Ad Audit Studio · data.js
   샘플 캠페인 3세트 + CSV 헤더 별칭 + 소재 각도 템플릿.
   DOM을 쓰지 않으므로 node(tests)와 브라우저가 같은 파일을 읽는다.

   숫자는 모두 "최근 30일" 실적이다. 일 예산(dailyBudget)만 앞으로의 값.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AD_DATA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PLATFORMS = {
    meta: { id: 'meta', label: { ko: 'Meta Ads', en: 'Meta Ads' }, short: { ko: 'M', en: 'M' }, color: '#1877F2' },
    naver: { id: 'naver', label: { ko: '네이버', en: 'Naver' }, short: { ko: 'N', en: 'N' }, color: '#03C75A' },
  };

  const OBJECTIVES = ['sales', 'lead', 'traffic', 'awareness'];

  /* ── 샘플 1 · 이커머스 (KRW) ─────────────────────────────── */
  const ECOM = {
    id: 'ecom',
    label: { ko: '이커머스 · Meta+네이버', en: 'E-commerce · Meta+Naver' },
    note: {
      ko: '패션 커머스 7개 캠페인 · 목표 ROAS 3.0',
      en: '7 fashion campaigns · target ROAS 3.0',
    },
    currency: 'KRW',
    bench: { targetRoas: 3.0, targetCpa: 25000, minConv: 5, maxScale: 0.8, reserve: 0.1, efficiency: 0.85 },
    campaigns: [
      { id: 'e1', name: { ko: '리타겟팅 · 장바구니 7일', en: 'Retargeting · 7-day cart' }, platform: 'meta', objective: 'sales', status: 'on', dailyBudget: 120000, spend: 3480000, impressions: 412000, clicks: 9860, conversions: 348, revenue: 17400000, frequency: 2.1 },
      { id: 'e2', name: { ko: '프로스펙팅 · 룩얼라이크 2%', en: 'Prospecting · 2% lookalike' }, platform: 'meta', objective: 'sales', status: 'on', dailyBudget: 250000, spend: 7250000, impressions: 1120000, clicks: 12300, conversions: 232, revenue: 8700000, frequency: 2.8 },
      { id: 'e3', name: { ko: '신상 런칭 · 릴스 소재', en: 'New drop · Reels creative' }, platform: 'meta', objective: 'awareness', status: 'on', dailyBudget: 90000, spend: 2610000, impressions: 890000, clicks: 5340, conversions: 104, revenue: 6264000, frequency: 4.2 },
      { id: 'e4', name: { ko: '카탈로그 · DPA 전체', en: 'Catalog · full DPA' }, platform: 'meta', objective: 'sales', status: 'on', dailyBudget: 180000, spend: 5220000, impressions: 780000, clicks: 10140, conversions: 261, revenue: 14094000, frequency: 2.4 },
      { id: 'e5', name: { ko: '브랜드 검색 · 방어', en: 'Brand search · defense' }, platform: 'naver', objective: 'sales', status: 'on', dailyBudget: 40000, spend: 1160000, impressions: 62000, clicks: 4650, conversions: 190, revenue: 5700000, frequency: 1.4 },
      { id: 'e6', name: { ko: '주말 특가 · 프로모션', en: 'Weekend deal · promo' }, platform: 'meta', objective: 'traffic', status: 'on', dailyBudget: 70000, spend: 2030000, impressions: 310000, clicks: 2170, conversions: 12, revenue: 420000, frequency: 3.1 },
      { id: 'e7', name: { ko: '할인 쿠폰 · 원데이', en: 'Coupon · one-day' }, platform: 'meta', objective: 'sales', status: 'off', dailyBudget: 60000, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, frequency: 0 },
    ],
  };

  /* ── 샘플 2 · 로컬 서비스 (KRW) ─────────────────────────── */
  const LOCAL = {
    id: 'local',
    label: { ko: '로컬 서비스 · Meta+네이버', en: 'Local service · Meta+Naver' },
    note: {
      ko: '에어컨 청소 업체 6개 캠페인 · 목표 ROAS 4.0 · 목표 CPA 45,000원',
      en: 'AC cleaning service · 6 campaigns · target ROAS 4.0 · CPA ₩45,000',
    },
    currency: 'KRW',
    bench: { targetRoas: 4.0, targetCpa: 45000, minConv: 5, maxScale: 0.8, reserve: 0.1, efficiency: 0.85 },
    campaigns: [
      { id: 'l1', name: { ko: '검색 · 강남 에어컨 청소', en: 'Search · Gangnam AC clean' }, platform: 'naver', objective: 'lead', status: 'on', dailyBudget: 90000, spend: 2610000, impressions: 148000, clicks: 4310, conversions: 74, revenue: 13320000, frequency: 1.6 },
      { id: 'l2', name: { ko: '파워링크 · 지역 키워드', en: 'PowerLink · local keywords' }, platform: 'naver', objective: 'lead', status: 'on', dailyBudget: 70000, spend: 2030000, impressions: 122000, clicks: 2980, conversions: 43, revenue: 7740000, frequency: 1.9 },
      { id: 'l3', name: { ko: '메타 리드폼 · 이사 시즌', en: 'Meta lead form · moving season' }, platform: 'meta', objective: 'lead', status: 'on', dailyBudget: 55000, spend: 1595000, impressions: 421000, clicks: 3420, conversions: 11, revenue: 1980000, frequency: 2.7 },
      { id: 'l4', name: { ko: '플레이스 · 상위노출', en: 'Place · top exposure' }, platform: 'naver', objective: 'traffic', status: 'on', dailyBudget: 35000, spend: 1015000, impressions: 88000, clicks: 5120, conversions: 38, revenue: 6840000, frequency: 1.3 },
      { id: 'l5', name: { ko: '인스타 릴스 · 시공 사례', en: 'Instagram Reels · job sites' }, platform: 'meta', objective: 'awareness', status: 'on', dailyBudget: 45000, spend: 1305000, impressions: 512000, clicks: 2560, conversions: 23, revenue: 4176000, frequency: 4.6 },
      { id: 'l6', name: { ko: '블로그 체험단 · 상단 노출', en: 'Blog reviews · top slot' }, platform: 'naver', objective: 'awareness', status: 'off', dailyBudget: 30000, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, frequency: 0 },
    ],
  };

  /* ── 샘플 3 · B2B 리드 (USD) ────────────────────────────── */
  const B2B = {
    id: 'b2b',
    label: { ko: 'B2B 리드 · Meta+네이버', en: 'B2B leads · Meta+Naver' },
    note: {
      ko: 'B2B SaaS 7개 캠페인 · 목표 ROAS 4.0 · 데모당 250달러',
      en: 'B2B SaaS · 7 campaigns · target ROAS 4.0 · $250 per demo',
    },
    currency: 'USD',
    bench: { targetRoas: 4.0, targetCpa: 250, minConv: 5, maxScale: 0.8, reserve: 0.1, efficiency: 0.85 },
    campaigns: [
      { id: 'b1', name: { ko: 'Meta · 룩얼라이크 데모', en: 'Meta · lookalike demo' }, platform: 'meta', objective: 'lead', status: 'on', dailyBudget: 400, spend: 11600, impressions: 184000, clicks: 2210, conversions: 48, revenue: 62400, frequency: 2.2 },
      { id: 'b2', name: { ko: 'Meta · 가격 페이지 리타겟', en: 'Meta · pricing retarget' }, platform: 'meta', objective: 'lead', status: 'on', dailyBudget: 260, spend: 7540, impressions: 96000, clicks: 2880, conversions: 61, revenue: 91500, frequency: 1.8 },
      { id: 'b3', name: { ko: 'Meta · 관심사 광범위', en: 'Meta · broad interests' }, platform: 'meta', objective: 'traffic', status: 'on', dailyBudget: 500, spend: 14500, impressions: 612000, clicks: 3060, conversions: 21, revenue: 18900, frequency: 5.1 },
      { id: 'b4', name: { ko: '네이버 · 그룹웨어 검색', en: 'Naver · groupware search' }, platform: 'naver', objective: 'lead', status: 'on', dailyBudget: 300, spend: 8700, impressions: 42000, clicks: 1260, conversions: 34, revenue: 40800, frequency: 1.5 },
      { id: 'b5', name: { ko: 'Meta · 웨비나 신청', en: 'Meta · webinar signup' }, platform: 'meta', objective: 'awareness', status: 'on', dailyBudget: 180, spend: 5220, impressions: 138000, clicks: 690, conversions: 9, revenue: 12600, frequency: 4.3 },
      { id: 'b6', name: { ko: '네이버 · 브랜드 방어', en: 'Naver · brand defense' }, platform: 'naver', objective: 'sales', status: 'on', dailyBudget: 120, spend: 3480, impressions: 21000, clicks: 980, conversions: 26, revenue: 33800, frequency: 1.2 },
      { id: 'b7', name: { ko: 'Meta · 리드 리타겟 (일시중지)', en: 'Meta · lead retarget (paused)' }, platform: 'meta', objective: 'lead', status: 'off', dailyBudget: 150, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, frequency: 0 },
    ],
  };

  const SAMPLES = [ECOM, LOCAL, B2B];

  /* ── CSV 헤더 별칭 ───────────────────────────────────────────
     Meta Ads Manager(영문) · 네이버 광고관리자(국문) · 스프레드시트 붙여넣기
     모두 같은 정규화 키로 모은다. 비교는 소문자·공백제거 후. */
  const CSV_ALIASES = {
    name: ['campaignname', 'campaign', '캠페인', '캠페인명', '캠페인이름', '광고캠페인', '캠페인이름'],
    status: ['delivery', 'status', 'campaignstatus', '게재상태', '상태', '온오프', 'onoff', 'on/off'],
    platform: ['platform', 'channel', '매체', '채널', '게재플랫폼'],
    budget: ['dailybudget', 'campaignbudget', 'budget', '일일예산', '일예산', '예산', '일일예산액'],
    spend: ['amountspent', 'spend', 'cost', '집행금액', '지출', '소진액', '비용', '광고비', '집행액'],
    impressions: ['impressions', 'impression', '노출수', '노출'],
    clicks: ['linkclicks', 'clicks', 'clicksall', '클릭수', '클릭'],
    conversions: ['results', 'purchases', 'conversions', 'conversion', '전환수', '전환', '구매수', '신청수', '리드수', '결과'],
    revenue: ['purchasesconversionvalue', 'conversionvalue', 'revenue', 'purchasevalue', '전환매출', '구매매출', '매출', '전환매출액'],
    roas: ['roas', 'purchaseroas', '전환매출비', '광고수익률', 'roas구매'],
    cpa: ['costperresult', 'cpa', 'costperconversion', '결과당비용', '전환당비용', '전환당비용'],
    frequency: ['frequency', '빈도'],
  };

  /* ── 소재 각도 (무료 규칙 엔진) ────────────────────────────
     {brand}·{offer}·{audience}는 캠페인 이름/목표에서 채운다. */
  const COPY_ANGLES = {
    ko: [
      {
        key: 'problem',
        title: '문제 제기형',
        headline: '{topic}, 지금 확인하세요',
        body: '미루는 이유는 대부분 조건입니다. 이번 주에 되는 조건만 모아서 보여드립니다.',
        cta: '조건 확인하기',
      },
      {
        key: 'criteria',
        title: '기준 제시형',
        headline: '고를 때 볼 건 세 가지입니다',
        body: '{topic}, 가격만 보면 놓칩니다. 포함 범위와 기간까지 같이 보세요.',
        cta: '기준 보기',
      },
      {
        key: 'contrast',
        title: '반전 비교형',
        headline: '싼 게 아니라, 남는 겁니다',
        body: '{topic}는 처음보다 두 번째가 중요합니다. 다시 찾는 데는 이유가 있습니다.',
        cta: '차이 비교하기',
      },
    ],
    en: [
      {
        key: 'problem',
        title: 'Problem-first',
        headline: '{topic} — see the terms now',
        body: 'Most people stall on the terms, not the offer. Here is what applies this week.',
        cta: 'See the terms',
      },
      {
        key: 'criteria',
        title: 'Criteria first',
        headline: 'Judge it on three things',
        body: 'Price, what is included, and how long it lasts. Those three decide it.',
        cta: 'See criteria',
      },
      {
        key: 'contrast',
        title: 'Contrast',
        headline: 'Cheap is not the same as worth it',
        body: '{topic} is judged on the second purchase, not the first. There is a reason people come back.',
        cta: 'Compare',
      },
    ],
  };

  /* ── 타겟 조정 팁 ─────────────────────────────────────────── */
  const TARGET_TIPS = {
    frequency: {
      ko: '빈도 상한을 2회로 낮추고 신규 오디언스 20~30%를 붙여 같은 소재의 피로를 끊으세요.',
      en: 'Cap frequency at 2 and add 20–30% new audience so the same creative stops wearing out.',
    },
    ctr: {
      ko: '첫 3초에 결과를 말하는 소재로 교체하고, 1인칭 후기형 2종을 A/B로 붙이세요.',
      en: 'Switch to a creative that shows the outcome in 3 seconds, and A/B two first-person testimonial cuts.',
    },
    cpa: {
      ko: '전환 이벤트를 장바구니가 아니라 구매로 좁히고, 7일 클릭 기준으로 학습 구간을 다시 잡으세요.',
      en: 'Optimise for purchase rather than add-to-cart, and reset the learning window to 7-day click.',
    },
    scale: {
      ko: '한 번에 30% 이내로 올리고 3일마다 ROAS를 확인하세요. 20% 넘게 떨어지면 직전 예산으로 되돌립니다.',
      en: 'Raise by no more than 30% at a time and check ROAS every 3 days. Roll back if it drops more than 20%.',
    },
    audience: {
      ko: '구매자 기반 유사타겟을 1%·3%로 나눠 상위 20%를 찾고, 나머지는 상위 퍼널로 돌리세요.',
      en: 'Split buyer lookalikes into 1% and 3%, keep the top 20%, and move the rest up-funnel.',
    },
  };

  const UPDATED = '2026-11-22';
  const VERSION = '1.0.0';

  return { PLATFORMS, OBJECTIVES, SAMPLES, CSV_ALIASES, COPY_ANGLES, TARGET_TIPS, UPDATED, VERSION };
});
