from fastapi import APIRouter, HTTPException, Depends
from schemas import ClarificationCreate, DecisionRequest
from auth import get_current_user, require_admin
from db import get_conn

router = APIRouter()


# POST /api/clarifications — 학생 소명 제출
@router.post("/clarifications", status_code=201)
async def submit_clarification(body: ClarificationCreate, user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        # attempt 확인
        await cur.execute(
            "SELECT id, exam_id, user_id, status FROM attempts WHERE id = %s",
            (body.attempt_id,),
        )
        attempt = await cur.fetchone()
        if not attempt:
            raise HTTPException(404, "attempt not found")
        if attempt["user_id"] != user["id"]:
            raise HTTPException(403, "not your attempt")
        if attempt["status"] != "under_review":
            raise HTTPException(400, "attempt is not under review")

        # 기존 소명 있으면 업데이트
        await cur.execute(
            "SELECT id FROM clarifications WHERE attempt_id = %s", (body.attempt_id,)
        )
        existing = await cur.fetchone()

        if existing:
            await cur.execute(
                """UPDATE clarifications
                   SET reason_type = %s, reason_detail = %s, student_message = %s,
                       status = 'pending', teacher_comment = NULL, reviewed_at = NULL
                 WHERE id = %s""",
                (body.reason_type, body.reason_detail, body.student_message, existing["id"]),
            )
            clar_id = existing["id"]
        else:
            await cur.execute(
                """INSERT INTO clarifications
                   (attempt_id, exam_id, student_id, reason_type, reason_detail, student_message)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (body.attempt_id, attempt["exam_id"], user["id"],
                 body.reason_type, body.reason_detail, body.student_message),
            )
            clar_id = cur.lastrowid

        await cur.execute("SELECT * FROM clarifications WHERE id = %s", (clar_id,))
        row = await cur.fetchone()
    return row


# GET /api/clarifications/me/{attempt_id} — 학생 본인 소명 조회
@router.get("/clarifications/me/{attempt_id}")
async def my_clarification(attempt_id: int, user: dict = Depends(get_current_user)):
    async with get_conn() as (conn, cur):
        await cur.execute(
            "SELECT * FROM clarifications WHERE attempt_id = %s AND student_id = %s",
            (attempt_id, user["id"]),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "no clarification found")
    return row


# GET /api/admin/clarifications/pending — 관리자 대기 소명 목록
@router.get("/admin/clarifications/pending")
async def pending_list(user: dict = Depends(require_admin)):
    async with get_conn() as (conn, cur):
        await cur.execute(
            """SELECT c.id, c.attempt_id, c.reason_type, c.reason_detail,
                      c.status, c.created_at,
                      u.name AS student_name, e.title AS exam_title
                 FROM clarifications c
                 JOIN users u ON c.student_id = u.id
                 JOIN exams e ON c.exam_id = e.id
                WHERE c.status = 'pending'
             ORDER BY c.created_at DESC"""
        )
        rows = await cur.fetchall()
    return rows


# GET /api/admin/clarifications/{id} — 관리자 소명 상세
@router.get("/admin/clarifications/{clarification_id}")
async def clarification_detail(clarification_id: int, user: dict = Depends(require_admin)):
    async with get_conn() as (conn, cur):
        await cur.execute(
            """SELECT c.*, u.name AS student_name, e.title AS exam_title
                 FROM clarifications c
                 JOIN users u ON c.student_id = u.id
                 JOIN exams e ON c.exam_id = e.id
                WHERE c.id = %s""",
            (clarification_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "clarification not found")
    return row


# PATCH /api/admin/clarifications/{id}/decision — 관리자 판정
@router.patch("/admin/clarifications/{clarification_id}/decision")
async def decide(clarification_id: int, body: DecisionRequest, user: dict = Depends(require_admin)):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status must be approved or rejected")

    async with get_conn() as (conn, cur):
        await cur.execute(
            "SELECT * FROM clarifications WHERE id = %s", (clarification_id,)
        )
        clar = await cur.fetchone()
        if not clar:
            raise HTTPException(404, "clarification not found")
        if clar["status"] != "pending":
            raise HTTPException(400, "already decided")

        # 소명 상태 변경
        await cur.execute(
            """UPDATE clarifications
               SET status = %s, teacher_comment = %s, reviewed_at = NOW()
             WHERE id = %s""",
            (body.status, body.teacher_comment, clarification_id),
        )

        # attempt 상태 변경: 승인→in_progress, 거절→terminated
        new_status = "in_progress" if body.status == "approved" else "terminated"
        await cur.execute(
            "UPDATE attempts SET status = %s WHERE id = %s",
            (new_status, clar["attempt_id"]),
        )

        await cur.execute("SELECT * FROM clarifications WHERE id = %s", (clarification_id,))
        row = await cur.fetchone()
    return row
