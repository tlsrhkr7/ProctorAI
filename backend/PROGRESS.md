# ProctorAI 백엔드 구현 진행 기록

## D1-1. 기반 세팅 ✅

### 추가된 파일
| 파일 | 설명 |
|------|------|
| `requirements.txt` | 의존성 목록 (fastapi, uvicorn, aiomysql, pydantic, python-jose, passlib, httpx, PyPDF2 등) |
| `main.py` | FastAPI 앱 진입점. lifespan으로 DB 풀 관리, CORS 전체 허용, 라우터 등록, health check |
| `auth.py` | 인증 유틸리티. 비밀번호 해싱(bcrypt), JWT 토큰 생성/검증(HS256, 24시간), `get_current_user`/`require_admin` 의존성 |
| `schemas.py` | 전체 Pydantic 모델 (인증, 시험, 문제, 응시, 감독, 설정, 소명) |
| `routers/*.py` | 빈 라우터 스텁 6개 (auth, exams, questions, student, results, settings) |

### 구현 내용
- **main.py**: `lifespan`으로 DB 커넥션 풀 init/close, CORS `allow_origins=["*"]` (개발용), 6개 라우터 등록
- **auth.py**: `hash_password()`, `verify_password()` (passlib bcrypt), `create_token(user_id, role)` (python-jose), `get_current_user(request)` (Authorization 헤더 파싱 → DB 조회), `require_admin(request)` (role 확인)
- **schemas.py**: 기존 소명 모델 + 인증/시험/문제/응시/감독/설정 모델 추가. 총 15개 Pydantic 클래스

---

## D1-2. 인증 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/auth.py` | 빈 스텁 → 3개 엔드포인트 구현 |

### 구현 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입. 이름 중복 체크, bcrypt 해싱 후 INSERT. 201 반환 |
| POST | `/api/auth/login` | 로그인. 이름으로 조회 → 비밀번호 검증 → JWT 토큰 발급 |
| GET | `/api/auth/me` | 토큰에서 유저 조회. `Depends(get_current_user)` 사용 |

---

## D1-3. 시험 관리 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/exams.py` | 빈 스텁 → 5개 엔드포인트 구현 |

### 구현 엔드포인트 (전부 ADMIN 권한)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/exams` | 시험 생성. title, duration, source_text INSERT |
| GET | `/api/exams` | 시험 목록. LEFT JOIN questions로 question_count 포함 |
| GET | `/api/exams/{exam_id}` | 시험 상세. 문제 리스트 포함 (정답/해설 포함). JSON 컬럼 파싱 처리 |
| PATCH | `/api/exams/{exam_id}/status` | 상태 변경 (ready/active/closed 검증) |
| DELETE | `/api/exams/{exam_id}` | 삭제. CASCADE로 문제도 함께 삭제. 204 반환 |

### 구현 포인트
- `options` JSON 컬럼은 aiomysql에서 문자열로 반환 → `json.loads()` 처리
- 모든 엔드포인트에 `Depends(require_admin)` 적용

---

## D1-4. 문제 관리 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/questions.py` | 빈 스텁 → 4개 엔드포인트 구현 |

### 구현 엔드포인트 (전부 ADMIN 권한)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/questions/extract-pdf` | PDF 업로드(multipart) → PyPDF2로 텍스트 추출. 최대 20페이지 |
| POST | `/api/questions/generate` | Groq API(llama3-8b)로 문제 생성. choice/essay 분기. DB 저장 후 반환 |
| PUT | `/api/questions/{question_id}` | 개별 필드 부분 수정 (text, options, answer, explanation) |
| DELETE | `/api/questions/{question_id}` | 문제 삭제. 204 반환 |

### 구현 포인트
- AI 생성: Groq API 키를 settings 테이블에서 조회 (프론트 직접 호출 → 서버 이동)
- 프롬프트: choice/essay 타입별 JSON 형식 분기
- `options` 저장 시 `json.dumps(ensure_ascii=False)` → 한글 보존
- AI 응답에서 ` ```json ``` ` 마크다운 제거 처리
- 기존 문제 번호 이어서 부여 (`MAX(number) + 1`)

---

## D1-5. 학생 응시 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/student.py` | 빈 스텁 → 4개 엔드포인트 구현 |

### 구현 엔드포인트 (전부 STUDENT 권한)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/student/exams` | 활성(active) 시험 목록. question_count 포함 |
| POST | `/api/student/exams/{exam_id}/start` | 시험 시작. active 확인, 중복 방지, attempt 생성, 문제 반환 (정답/해설 제외) |
| POST | `/api/student/attempts/{attempt_id}/submit` | 답안 제출. 객관식 자동채점 + score 계산. attempt 상태 submitted로 변경 |
| GET | `/api/student/attempts/current` | 현재 진행 중 시험 확인. 없으면 null |

### 구현 포인트
- 시험 시작 시 정답(`answer`), 해설(`explanation`) 필드 제외하고 반환
- 중복 응시 방지: 같은 exam+user로 in_progress인 attempt 있으면 거부
- 채점: `str(selected) == str(answer)`로 비교 (DB answer가 text 타입이므로)
- 점수: `(정답수 / 객관식 총수) × 100`, 반올림. 서술형은 is_correct=NULL

---

## D1-6. 결과 조회 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/results.py` | 빈 스텁 → 3개 엔드포인트 구현 |

### 구현 엔드포인트
| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/student/attempts/{id}/result` | STUDENT | 내 결과. 본인 attempt만 조회 가능 |
| GET | `/api/admin/attempts/{id}/result` | ADMIN | 특정 학생 결과 조회 |
| GET | `/api/admin/exams/{id}/results` | ADMIN | 시험별 전체 응시자 목록 (점수/상태/경고) |

### 구현 포인트
- `_build_result()` 공통 함수로 attempt+answers+questions JOIN 결과 빌드
- 학생 결과에는 정답(`correct_answer`), 해설(`explanation`) 포함
- JSON options 파싱 처리

---

## D1-7. 설정 라우터 ✅

### 수정된 파일
| 파일 | 변경 |
|------|------|
| `routers/settings.py` | 빈 스텁 → 2개 엔드포인트 구현 |

### 구현 엔드포인트 (ADMIN 권한)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/settings` | 설정 조회. 없으면 기본값 `{groq_key:null, gaze:3, maxw:3}` |
| PUT | `/api/admin/settings` | 저장. `INSERT ON DUPLICATE KEY UPDATE` 사용 |

---

## D2-1. 감독 라우터 ✅

### 추가된 파일
| 파일 | 설명 |
|------|------|
| `routers/proctoring.py` | 2개 엔드포인트 |

### 구현 엔드포인트 (STUDENT 권한)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/student/attempts/{id}/logs` | 감독 로그 전송. severity 검증, warn/danger 시 warning_count 자동 증가 |
| POST | `/api/student/attempts/{id}/end` | 시험 종료. 최종 통계(warning_count, total_away_time, voice_alerts) 저장 |

---

## D2-2. 모니터링 라우터 ✅

### 추가된 파일
| 파일 | 설명 |
|------|------|
| `routers/monitor.py` | 4개 엔드포인트 |

### 구현 엔드포인트 (ADMIN 권한)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/monitor/live` | 진행 중 응시자 현황. 최신 로그 서브쿼리 JOIN |
| GET | `/api/admin/attempts/{id}/logs` | 특정 응시자 로그 전체 |
| GET | `/api/admin/logs` | 전체 로그 (exam_id, severity 필터 + 페이지네이션) |
| GET | `/api/admin/logs/export` | CSV 내보내기. BOM 포함, StreamingResponse |

---

## D2-3. 소명 라우터 ✅

### 추가된 파일
| 파일 | 설명 |
|------|------|
| `routers/clarifications.py` | 5개 엔드포인트 |

### 구현 엔드포인트
| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/clarifications` | STUDENT | 소명 제출. under_review 상태만 가능. 기존 소명 있으면 업데이트 |
| GET | `/api/clarifications/me/{attempt_id}` | STUDENT | 본인 소명 조회 |
| GET | `/api/admin/clarifications/pending` | ADMIN | 대기(pending) 소명 목록 |
| GET | `/api/admin/clarifications/{id}` | ADMIN | 소명 상세 |
| PATCH | `/api/admin/clarifications/{id}/decision` | ADMIN | 승인→in_progress / 거절→terminated |

### main.py 변경
- `proctoring`, `monitor`, `clarifications` 라우터 3개 추가 등록

### 다음 단계
D2-4. 프론트엔드 연동 (exam.html)
