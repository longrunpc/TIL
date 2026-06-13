# TIL

하루에 배운 내용을 짧고 깔끔하게 쌓아 가는 저장소입니다.
핵심은 `완벽하게 쓰기`보다 `읽히는 글로 꾸준히 남기기`입니다.

## 폴더 구조

```text
.
├── daily/
├── scripts/
│   ├── new-til.mjs
│   └── update-readme.mjs
├── prompts/
│   └── ai-guidepost.md
├── templates/
│   ├── daily-template.md
│   └── final-til-format.md
├── package.json
└── README.md
```

## 쓰는 흐름

1. `npm run til:new` 또는 `node scripts/new-til.mjs`로 오늘 파일을 만듭니다.
2. 생성된 `daily/*.md` 파일에 바로 내용을 적거나, 필요하면 `templates/daily-template.md`로 먼저 raw 초안을 정리합니다.
3. `prompts/ai-guidepost.md`의 AI 지침표로 문장을 다듬습니다.
4. 최종 문서는 `# 제목`과 `## / ###` 소제목 구조로 읽기 좋게 정리합니다.
5. `README`의 아카이브는 `daily/` 내용 기준으로 자동 갱신됩니다.

## 파일명 추천

- `daily/2026-06-08.md`
- `daily/2026-06-08-react-state.md`
- `daily/2026-06-08-sql-index.md`

날짜만 써도 되고, 나중에 찾기 쉽게 주제를 뒤에 붙여도 좋습니다.

## 작성 원칙

- 처음부터 예쁘게 쓰려고 하지 않기
- 틀린 문장이어도 괜찮으니 사실 위주로 적기
- 왜 막혔는지와 어떻게 해결했는지 꼭 남기기
- 미래의 내가 다시 봐도 이해되게 예시 하나는 남기기

## 권장 출력 형식

최종 문서는 고정된 `주제 / 정리` 틀 대신, 자연스러운 블로그형 구조를 권장합니다.

1. `# 제목`
2. 짧은 도입 문단
3. `##` 대제목
4. 필요하면 `###` 소제목
5. 코드나 예시는 필요한 부분에만 삽입

중요한 건 형식을 억지로 맞추는 것보다, 제목과 소제목만 훑어도 글 흐름이 보이게 쓰는 것입니다.

## 명령어

```bash
npm run til:new
npm run til:new -- react-state
npm run til:sync
```

- `til:new`: 오늘 날짜 기준 새 TIL 파일 생성 후 `README` 동기화
- `til:sync`: `daily/` 전체를 다시 읽어서 `README` 아카이브 갱신

## AI 다듬기 팁

- 내 말투를 더 정확히 맞추고 싶다면, 예전에 내가 쓴 글 1~2개를 같이 넣어주면 좋습니다.
- AI에게는 `없는 내용 추가 금지`, `과장 금지`, `내가 실제로 이해한 수준으로만 정리`를 항상 같이 주는 게 좋습니다.

## 아카이브

아래 구간은 `scripts/update-readme.mjs`가 자동으로 관리합니다.

<!-- TIL-LIST:START -->
총 2개

| 날짜 | 제목 | 링크 |
| --- | --- | --- |
| 2026-06-09 | KCP 본인인증 v2 마이그레이션 | [보기](daily/2026-06-09-kcp-v2-migration.md) |
| 2026-06-09 | DB 파티션 분할과 프로시저 배치 처리 정리 | [보기](daily/2026-06-09-db-partition-procedure-batch.md) |
<!-- TIL-LIST:END -->

## 바로 시작

오늘 파일 하나 만들고 아래 템플릿부터 채우면 됩니다.

- 최종 형식: [templates/final-til-format.md](/Users/longrunpc/projects/TIL/templates/final-til-format.md)
- raw 초안용: [templates/daily-template.md](/Users/longrunpc/projects/TIL/templates/daily-template.md)
- AI 지침표: [prompts/ai-guidepost.md](/Users/longrunpc/projects/TIL/prompts/ai-guidepost.md)
