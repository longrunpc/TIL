# TIL

하루에 배운 내용을 짧고 깔끔하게 쌓아 가는 저장소입니다.
핵심은 `완벽하게 쓰기`보다 `같은 형식으로 꾸준히 남기기`입니다.

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
4. 최종 문서는 `templates/final-til-format.md`와 같은 형태로 맞춥니다.
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

## 고정 출력 형식

최종 문서는 아래 두 섹션만 사용합니다.

1. `## 주제`
2. `## 정리`

적을 내용이 없더라도 섹션을 지우지 않고 `- 없음`으로 남기는 방식으로 통일합니다.

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
총 0개

아직 작성한 TIL이 없습니다.
<!-- TIL-LIST:END -->

## 바로 시작

오늘 파일 하나 만들고 아래 템플릿부터 채우면 됩니다.

- 최종 형식: [templates/final-til-format.md](/Users/longrunpc/projects/TIL/templates/final-til-format.md)
- raw 초안용: [templates/daily-template.md](/Users/longrunpc/projects/TIL/templates/daily-template.md)
- AI 지침표: [prompts/ai-guidepost.md](/Users/longrunpc/projects/TIL/prompts/ai-guidepost.md)
