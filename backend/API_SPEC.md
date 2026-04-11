# ProctorAI API 명세서

## 기술 스택

- Python / FastAPI
- MySQL (직접 SQL 작성, ORM 미사용)
- Pydantic (요청/응답 검증 최소 사용)
- REST API 기반 (WebSocket 미사용)
- 인증: 세션 or 단순 토큰 (JWT 최소화)

## Base URL

```
http://localhost:8000/api
```

---

## 1. 인증 (ALL)

### 1-1. 회원가입
```
POST /api/auth/register
```
**Request**
```json
{
  "name": "홍길동",
  "password": "1234",
  "role": "student"
}
```
**Response** `201`
```json
{
  "id": 1,
  "name": "홍길동",
  "role": "student"
}
```

---

### 1-2. 로그인
```
POST /api/auth/login
```
**Request**
```json
{
  "name": "홍길동",
  "password": "1234"
}
```
**Response** `200`
```json
{
  "token": "abc123...",
  "user": {
    "id": 1,
    "name": "홍길동",
    "role": "student"
  }
}
```

---

### 1-3. 내 정보 조회
```
GET /api/auth/me
Authorization: Bearer {token}
```
**Response** `200`
```json
{
  "id": 1,
  "name": "홍길동",
  "role": "student"
}
```

---

## 2. 시험 관리 (ADMIN)

### 2-1. 시험 생성
```
POST /api/exams
```
**Request**
```json
{
  "title": "인공지능 개론 중간고사",
  "duration": 1800,
  "source_text": "PDF에서 추출한 텍스트..."
}
```
**Response** `201`
```json
{
  "id": 1,
  "title": "인공지능 개론 중간고사",
  "duration": 1800,
  "status": "ready",
  "created_at": "2026-04-11T10:00:00"
}
```

---

### 2-2. 시험 목록 조회
```
GET /api/exams
```
**Response** `200`
```json
[
  {
    "id": 1,
    "title": "인공지능 개론 중간고사",
    "duration": 1800,
    "question_count": 10,
    "status": "active",
    "created_at": "2026-04-11T10:00:00"
  }
]
```

---

### 2-3. 시험 상세 조회
```
GET /api/exams/{exam_id}
```
**Response** `200`
```json
{
  "id": 1,
  "title": "인공지능 개론 중간고사",
  "duration": 1800,
  "source_text": "PDF 텍스트...",
  "status": "active",
  "created_at": "2026-04-11T10:00:00",
  "questions": [
    {
      "id": 1,
      "number": 1,
      "type": "choice",
      "text": "다음 중 지도학습에 해당하지 않는 것은?",
      "options": ["선형 회귀", "결정 트리", "K-평균 군집화", "SVM"],
      "answer": 2,
      "explanation": "K-평균은 비지도학습입니다."
    },
    {
      "id": 2,
      "number": 2,
      "type": "essay",
      "text": "트랜스포머의 셀프 어텐션 메커니즘을 설명하시오.",
      "options": null,
      "answer": "셀프 어텐션은 입력 시퀀스 내 각 토큰 간의 관계를...",
      "explanation": null
    }
  ]
}
```

---

### 2-4. 시험 상태 변경
```
PATCH /api/exams/{exam_id}/status
```
**Request**
```json
{
  "status": "active"
}
```
**Response** `200`
```json
{
  "id": 1,
  "status": "active"
}
```

---

### 2-5. 시험 삭제
```
DELETE /api/exams/{exam_id}
```
**Response** `204` (No Content)

---

## 3. 문제 관리 (ADMIN)

### 3-1. PDF 텍스트 추출
```
POST /api/questions/extract-pdf
Content-Type: multipart/form-data
```
**Request**: PDF 파일 (form field: `file`)

**Response** `200`
```json
{
  "text": "추출된 텍스트...",
  "pages": 12
}
```

---

### 3-2. AI 문제 생성
```
POST /api/questions/generate
```
**Request**
```json
{
  "exam_id": 1,
  "source_text": "PDF 추출 텍스트...",
  "count": 10,
  "type": "choice"
}
```
**Response** `201`
```json
{
  "questions": [
    {
      "id": 1,
      "number": 1,
      "type": "choice",
      "text": "문제 내용",
      "options": ["①...", "②...", "③...", "④..."],
      "answer": 0,
      "explanation": "해설"
    }
  ]
}
```

---

### 3-3. 문제 수정
```
PUT /api/questions/{question_id}
```
**Request**
```json
{
  "text": "수정된 문제 내용",
  "options": ["수정된 보기1", "보기2", "보기3", "보기4"],
  "answer": 1,
  "explanation": "수정된 해설"
}
```
**Response** `200`
```json
{
  "id": 1,
  "number": 1,
  "type": "choice",
  "text": "수정된 문제 내용",
  "options": ["수정된 보기1", "보기2", "보기3", "보기4"],
  "answer": 1,
  "explanation": "수정된 해설"
}
```

---

### 3-4. 문제 삭제
```
DELETE /api/questions/{question_id}
```
**Response** `204` (No Content)

---

## 4. 응시 (STUDENT)

### 4-1. 활성 시험 목록
```
GET /api/student/exams
```
**Response** `200`
```json
[
  {
    "id": 1,
    "title": "인공지능 개론 중간고사",
    "duration": 1800,
    "question_count": 10
  }
]
```

---

### 4-2. 시험 시작
```
POST /api/student/exams/{exam_id}/start
```
**Response** `201`
```json
{
  "attempt_id": 1,
  "exam": {
    "id": 1,
    "title": "인공지능 개론 중간고사",
    "duration": 1800
  },
  "questions": [
    {
      "id": 1,
      "number": 1,
      "type": "choice",
      "text": "다음 중 지도학습에 해당하지 않는 것은?",
      "options": ["선형 회귀", "결정 트리", "K-평균 군집화", "SVM"]
    },
    {
      "id": 2,
      "number": 2,
      "type": "essay",
      "text": "트랜스포머의 셀프 어텐션 메커니즘을 설명하시오."
    }
  ]
}
```
> 정답(answer), 해설(explanation) 제외

---

### 4-3. 답안 제출
```
POST /api/student/attempts/{attempt_id}/submit
```
**Request**
```json
{
  "answers": [
    { "question_id": 1, "selected": 2 },
    { "question_id": 2, "text": "셀프 어텐션이란..." }
  ]
}
```
**Response** `200`
```json
{
  "attempt_id": 1,
  "status": "submitted",
  "score": 80,
  "submitted_at": "2026-04-11T10:35:00"
}
```

---

### 4-4. 응시 상태 확인
```
GET /api/student/attempts/current
```
**Response** `200` (진행 중인 시험 있을 때)
```json
{
  "attempt_id": 1,
  "exam_id": 1,
  "exam_title": "인공지능 개론 중간고사",
  "status": "in_progress",
  "started_at": "2026-04-11T10:00:00"
}
```
**Response** `200` (없을 때)
```json
null
```

---

## 5. 감독 (STUDENT)

### 5-1. 감독 로그 전송
```
POST /api/student/attempts/{attempt_id}/logs
```
**Request**
```json
{
  "severity": "warn",
  "event": "gaze_away",
  "detail": "3초 이상 화면 이탈"
}
```
**Response** `201`
```json
{
  "id": 1,
  "event": "gaze_away",
  "timestamp": "2026-04-11T10:05:23"
}
```

---

### 5-2. 시험 종료
```
POST /api/student/attempts/{attempt_id}/end
```
**Request**
```json
{
  "warning_count": 2,
  "total_away_time": 15,
  "voice_alerts": 1
}
```
**Response** `200`
```json
{
  "attempt_id": 1,
  "status": "terminated"
}
```

---

## 6. 결과 조회

### 6-1. 내 결과 조회 (STUDENT)
```
GET /api/student/attempts/{attempt_id}/result
```
**Response** `200`
```json
{
  "attempt_id": 1,
  "exam_title": "인공지능 개론 중간고사",
  "status": "submitted",
  "score": 80,
  "warning_count": 2,
  "total_away_time": 15,
  "voice_alerts": 1,
  "started_at": "2026-04-11T10:00:00",
  "submitted_at": "2026-04-11T10:28:00",
  "answers": [
    {
      "question_id": 1,
      "number": 1,
      "type": "choice",
      "text": "다음 중 지도학습에 해당하지 않는 것은?",
      "selected": 2,
      "is_correct": true,
      "correct_answer": 2,
      "explanation": "K-평균은 비지도학습입니다."
    },
    {
      "question_id": 2,
      "number": 2,
      "type": "essay",
      "text": "트랜스포머의 셀프 어텐션 메커니즘을 설명하시오.",
      "answer_text": "셀프 어텐션이란...",
      "is_correct": null,
      "model_answer": "셀프 어텐션은 입력 시퀀스 내..."
    }
  ]
}
```

---

### 6-2. 응시자별 결과 조회 (ADMIN)
```
GET /api/admin/attempts/{attempt_id}/result
```
**Response** `200` — 6-1과 동일한 구조

---

### 6-3. 시험별 결과 목록 (ADMIN)
```
GET /api/admin/exams/{exam_id}/results
```
**Response** `200`
```json
[
  {
    "attempt_id": 1,
    "user_id": 1,
    "user_name": "홍길동",
    "status": "submitted",
    "score": 80,
    "warning_count": 2,
    "total_away_time": 15,
    "voice_alerts": 1,
    "started_at": "2026-04-11T10:00:00",
    "submitted_at": "2026-04-11T10:28:00"
  }
]
```

---

## 7. 모니터링 (ADMIN)

### 7-1. 실시간 응시자 현황
```
GET /api/admin/monitor/live
```
**Response** `200`
```json
[
  {
    "attempt_id": 1,
    "user_id": 1,
    "user_name": "홍길동",
    "exam_title": "인공지능 개론 중간고사",
    "status": "in_progress",
    "warning_count": 1,
    "started_at": "2026-04-11T10:00:00",
    "last_log": {
      "event": "gaze_return",
      "severity": "ok",
      "timestamp": "2026-04-11T10:05:30"
    }
  }
]
```

---

### 7-2. 응시자별 로그 조회
```
GET /api/admin/attempts/{attempt_id}/logs
```
**Response** `200`
```json
[
  {
    "id": 1,
    "severity": "warn",
    "event": "gaze_away",
    "detail": "3초 이상 화면 이탈",
    "timestamp": "2026-04-11T10:05:23"
  },
  {
    "id": 2,
    "severity": "ok",
    "event": "gaze_return",
    "detail": "",
    "timestamp": "2026-04-11T10:05:30"
  }
]
```

---

### 7-3. 전체 로그 조회
```
GET /api/admin/logs?exam_id=1&severity=warn&page=1&size=50
```
**Response** `200`
```json
{
  "total": 128,
  "page": 1,
  "size": 50,
  "logs": [
    {
      "id": 1,
      "attempt_id": 1,
      "user_name": "홍길동",
      "exam_title": "인공지능 개론 중간고사",
      "severity": "warn",
      "event": "gaze_away",
      "detail": "3초 이상 화면 이탈",
      "timestamp": "2026-04-11T10:05:23"
    }
  ]
}
```

---

### 7-4. 로그 CSV 내보내기
```
GET /api/admin/logs/export?exam_id=1&severity=warn
```
**Response** `200` — `Content-Type: text/csv`
```
시각,응시자,시험,이벤트,내용,등급
2026-04-11 10:05:23,홍길동,인공지능 개론 중간고사,gaze_away,3초 이상 화면 이탈,warn
```

---

## 8. 설정 (ADMIN)

### 8-1. 설정 조회
```
GET /api/admin/settings
```
**Response** `200`
```json
{
  "groq_key": "gsk_...",
  "gaze_threshold": 3,
  "max_warnings": 3
}
```

---

### 8-2. 설정 저장
```
PUT /api/admin/settings
```
**Request**
```json
{
  "groq_key": "gsk_...",
  "gaze_threshold": 5,
  "max_warnings": 3
}
```
**Response** `200`
```json
{
  "groq_key": "gsk_...",
  "gaze_threshold": 5,
  "max_warnings": 3
}
```

---

## 에러 응답 (공통)

```json
{
  "detail": "에러 메시지"
}
```

| 코드 | 상황 |
|------|------|
| 400 | 잘못된 요청 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 500 | 서버 오류 |
