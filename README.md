# 📊 OneTap Ad Audit Studio (ad-audit-studio)

Meta Ads·네이버 광고 계정을 **3명의 AI 에이전트가 감사하고, 예산을 다시 배분하는** 무서버 정적 웹앱입니다.
광고 관리자 CSV를 그대로 넣으면 적자 캠페인에 `OFF 권장` 배지가 붙고, 남는 예산이 고효율 캠페인으로
옮겨갑니다. 끝나면 예상 절감액·추가 매출·ROAS 상승폭과 **CSV 예산안 / MD 액션 리포트**가 남습니다.

- 빌드 없음 · 서버 없음 · 계정 없음 · **본문 외부 전송 0건** (무료 모드)
- 입력과 설정은 `localStorage`에만 저장
- Pro(BYOK) 키는 브라우저 `localStorage`에만 두고, 고른 제공자 API로만 직접 호출
- GitHub Pages 등 정적 호스팅에 그대로 올릴 수 있음 (`.nojekyll` 포함)
- 예상 URL: https://marcj81.github.io/onetap-ad-audit/

## 파일

```
index.html        화면 (히어로 · KPI · 데이터 · 광고 관리자 표 · 스웜 콘솔 · 소재 · CTA)
styles.css        A안 화이트 벤토 디자인 — 순백 · 1px 헤어라인 · 16px 타일 · 코발트 #2563EB · 반응형
data.js           샘플 캠페인 3세트(이커머스/로컬/B2B) · CSV 헤더 별칭 · 소재 각도 · 타겟 팁
i18n.js           KO/EN 사전 (같은 키 집합, test.js가 대조)
core.js           감사 엔진 · 예산 재배분 시뮬레이터 · CSV 파서(PapaParse 연동) · 소재 초안 · CSV/MD 내보내기
assets/vendor/papaparse.min.js  PapaParse 5.7.1 (MIT) — 따옴표·줄바꿈·BOM·대용량 CSV
assets/vendor/LICENSE-papaparse.txt  라이선스 고지
app.js            화면 조립 · 스웜 커서 애니메이션 · 행 편집 · Pro · 저장
engines/ai-bridge.js  Pro(BYOK) 프롬프트 · 제공자별 요청 · 응답 파싱
test.js           단위 테스트 (node) · 로컬 전용, 저장소 미포함
uitest.py         실제 Chrome 검증 · 미리보기 캡처 (playwright) · 로컬 전용, 저장소 미포함
privacy.html      개인정보 처리방침
```

## 실행

```bash
python3 -m http.server 8080
# → http://127.0.0.1:8080
```

배포본은 위 네 줄이면 끝입니다. 검증용 스크립트(`test.js` 단위 테스트, `uitest.py` 실제 Chrome
검증)는 저장소에 올리지 않고 작업 환경에서만 돌립니다.

## 핵심 기능

### 1. 데이터 입력 3가지

| 방법 | 설명 |
|---|---|
| 샘플 3세트 | 이커머스 Meta (₩21.75M/7개), 로컬 서비스 Naver (₩8.5M/6개), B2B 리드 ($51K/7개) |
| CSV 업로드·붙여넣기 | Meta Ads Manager 영문 CSV, 네이버 광고관리자 국문 CSV, 탭 구분 표. 컬럼 순서 무관 · **PapaParse 엔진** |
| 표 직접 편집 | 행 추가·수정·삭제, ON/OFF 스위치 |

CSV는 **PapaParse**(MIT)가 먼저 읽고, 파일이 없을 때만 내장 파서로 떨어집니다. 따옴표 안의 쉼표·줄바꿈,
Excel이 붙인 BOM, CRLF/LF, 탭·세미콜론 자동 감지, 3,000행 이상 대용량을 그대로 처리합니다.
파일 업로드는 **바이트로 읽어 인코딩을 판별**합니다: UTF-8(BOM 포함) → UTF-16LE/BE → CP949(한국 엑셀·네이버 export).
그래서 네이버에서 CP949로 내려받은 CSV도 한글이 깨지지 않고, 파일을 열 때 감지한 인코딩을 토스트로 알려 줍니다.

CSV는 `Campaign name·Amount spent·Results·Purchases conversion value` 같은 실제 헤더 별칭을 읽고,
`₩`·`$`·쉼표·따옴표·괄호 음수·`만/억` 표기를 숫자로 바꿉니다. 매출이 없고 ROAS만 있으면 역산하고,
전환 수가 없고 CPA만 있으면 역산합니다. 이름만 보고 매체(Meta/네이버)도 추론합니다.

### 2. AI 스웜 감사 (무료 규칙 엔진)

세 에이전트가 표 위를 움직이며 캠페인을 하나씩 짚습니다.

| 에이전트 | 담당 | 판정 |
|---|---|---|
| **Claude** | 카피·소재 | 소재 교체 (CTR 0.9% 미만 또는 빈도 3.5 이상) |
| **Gemini** | 데이터·ROAS | 예산 감액·관찰 (목표 ROAS 미달) |
| **GPT** | 예산 배분 | OFF 권장, 예산 증액, 현금 보전 |

- 적자(목표 ROAS의 60% 미만)·전환 0·CPA 초과 캠페인에 `OFF 권장`
- 고효율 캠페인은 ROAS 비중으로 예산을 나눠 받음 (캠페인당 최대 +80%, 증액분 효율 85% 가정)
- 풀의 10%는 현금으로 남김 → `예상 절감 / 월`
- 결과: 예상 절감액 · 예상 추가 매출 · 블렌디드 ROAS(전 → 후) · 재배분액, 캠페인별 근거 로그

### 3. Pro (BYOK)

- OpenAI · Gemini · Claude 키를 넣으면 실제 모델이 캠페인 성과를 읽고 **카피 3안 + 타겟 조정안**을 씁니다.
- 키는 `localStorage`(`onetap.adaudit.keys`)에만 저장되고, 선택한 제공자 엔드포인트 외에는 전송되지 않습니다.
- 키가 없어도 무료 규칙 엔진이 3각도 초안(문제 제기 / 기준 제시 / 반전 비교)과 타겟 팁을 제공합니다.

### 4. 내보내기

- **CSV**: 캠페인 · 권장 상태 · 일 예산 → 권장 일 예산 · 지출 · ROAS · CPA · 판정 · 근거
- **MD**: 요약 표(현재 vs 제안) · 예산안 · 소재 초안 · 면책

## 설계 메모

- 감사 배지·로그·결과는 모두 `core.js`의 순수 함수 결과라서, 같은 입력이면 같은 출력이 나옵니다.
- 시뮬레이션은 "최근 30일 실적을 그대로 둔다"는 전제입니다. 표의 지출은 과거값이고,
  적용(Apply)은 **일 예산과 ON/OFF만** 바꿉니다.
- 스웜 커서는 `prefers-reduced-motion`에서 즉시 완료되며, 모바일(≤760px)에서는 표가 카드로 바뀌어
  커서 레이어를 숨깁니다.
- 색은 코발트 `#2563EB` 하나만 액센트로 쓰고, 판정색(빨강/주황/초록/파랑)은 데이터 의미로만 씁니다.

## 검증 (로컬 전용 스크립트 기준)

- `node test.js` → **1,081 PASS / 0 FAIL**
  (데이터 무결성, 지표, 감사 규칙, 시뮬레이션 상한, CSV 8종, PapaParse 엔진·인코딩·5000행, KO/EN 키·플레이스홀더, 소재 3안, Pro 요청·파싱, 내보내기, 금칙어)
- `python3 uitest.py` → **165 PASS / 0 FAIL**, "Browser verification passed"
  (1440×900 · 390×844, CSV 파싱·업로드, CP949·BOM·따옴표·3000행 업로드, 행 추가/수정/토글, 커서·로그·배지, 예산안 적용, EN/KO, Pro 모의 호출, CSV/MD 다운로드, 대비 4.5:1, 가로 넘침 0, 콘솔·페이지·요청 오류 0)
- 같은 스위트를 GitHub Pages 실서버(https://marcj81.github.io/onetap-ad-audit/)에 돌려 재확인 (2026-11-23).

## 배포

```bash
# GitHub Pages (저장소 생성 후)
git add . && git commit -m "feat: OneTap Ad Audit Studio"
git push origin main
```

`https://marcj81.github.io/onetap-ad-audit/` 기준으로 canonical·sitemap·CTA 링크가 맞춰져 있습니다.
