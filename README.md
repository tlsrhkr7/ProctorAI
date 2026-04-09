# ProctorAI 🛡️

AI 기반 지능형 온라인 시험 감독 시스템

---

## 📁 프로젝트 구조

```
ProctorAI/
├── admin/                      ← 관리자 페이지
│   ├── index.html              - 관리자 UI (HTML만)
│   ├── admin.css               - 전체 스타일
│   └── js/
│       ├── app.js              - 메인 진입점 · 이벤트 바인딩
│       ├── firebase.js         - Firestore 초기화 · 실시간 리스너
│       ├── pdf.js              - PDF 업로드 · 텍스트 추출 (pdf.js)
│       ├── ai-generate.js      - Groq API 문제 자동 생성
│       └── ui.js               - 대시보드·시험목록·모니터·로그 렌더
│
└── exam/                       ← 응시자 페이지
    ├── index.html              - 응시자 UI (HTML만)
    ├── exam.css                - 전체 스타일
    └── js/
        ├── app.js              - 메인 진입점 · 시험 흐름 제어
        ├── firebase.js         - Firestore 로그 전송 · 시험 구독
        ├── camera.js           - MediaPipe 눈 추적 · 시선 분석
        ├── voice.js            - Web Speech API 음성 감지
        └── proctor.js          - 경고·AI면담·종료 로직 · 상태 관리
```

---

## 🚀 빠른 시작

### 1. Groq API Key 발급 (무료)
1. [console.groq.com/keys](https://console.groq.com/keys) 접속
2. 구글 계정으로 로그인 → Create API Key
3. 발급된 키(`gsk_...`) 복사

### 2. Firebase 설정 (무료 · 실시간 동기화)
1. [Firebase Console](https://console.firebase.google.com) → 새 프로젝트
2. Firestore Database → 시작 → **테스트 모드** 선택
3. 프로젝트 설정(⚙️) → 웹 앱 추가(`</>`) → 구성 정보 복사

> Firebase 없이도 `localStorage` 폴링 방식으로 동작합니다 (같은 브라우저/기기 한정)

### 3. GitHub Pages 배포
```
1. GitHub 새 레포지토리 생성 (Public)
2. ProctorAI 폴더 전체 업로드
3. Settings → Pages → Branch: main → Save
4. https://[username].github.io/[repo-name]/admin/ 로 접속
```

---

## ⚙️ 사용 흐름

```
관리자                              응시자
──────                              ──────
1. admin/index.html 접속
2. 설정 → Groq API 키 입력
3. 설정 → Firebase 연동 (선택)
4. 시험 생성 → PDF 업로드
5. AI 문제 자동 생성 (Groq)
6. 시험 등록 → ▶ 활성화
                                    1. exam/index.html 접속
                                    2. 학번 · 이름 입력
                                    3. 시험 선택 → 시험 시작
                                    4. 카메라 · 마이크 권한 허용
                                    5. 응시 (AI 실시간 감독)
                                    6. 답안 제출
7. 실시간 감독 페이지에서
   학생 현황 · 경고 모니터링
8. 전체 로그 → CSV 내보내기
```

---

## 🤖 AI 감독 기능

| 기능 | 설명 |
|------|------|
| 👁 시선 추적 | MediaPipe Face Mesh 468 랜드마크 · 홍채 방향 분석 |
| 🎙 음성 감지 | Web Speech API · 의심 키워드 실시간 탐지 |
| ⚠️ 3단계 제재 | 경고(블러) → AI 면담(일시정지) → 강제 종료 |
| 🤖 AI 면담 | Groq llama3 · 부정행위 여부 대화식 확인 |
| 📊 실시간 대시보드 | Firebase Firestore 실시간 스트리밍 |
| 📄 로그 내보내기 | CSV 포맷 · 전체 이벤트 기록 |

---

## 🛠 기술 스택

- **Frontend**: Vanilla JS (ES Modules) · HTML5 · CSS3
- **눈 추적**: MediaPipe Face Mesh
- **음성 인식**: Web Speech API
- **AI 문제 생성 · 면담**: Groq API (llama3-8b-8192)
- **실시간 DB**: Firebase Firestore
- **PDF 파싱**: pdf.js (Mozilla)
- **배포**: GitHub Pages (무료)

---

## 👥 팀

| 역할 | 담당 |
|------|------|
| 시스템 설계 · 감독 로직 | - |
| AI 연동 · 문제 생성 | - |

