import os
import aiomysql
from contextlib import asynccontextmanager

_pool = None

async def init_pool():
    global _pool
    _pool = await aiomysql.create_pool(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        db=os.getenv("DB_NAME", "proctorai"),
        charset="utf8mb4",
        autocommit=True,
        minsize=2,
        maxsize=10,
    )

async def close_pool():
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()

@asynccontextmanager
async def get_conn():
    async with _pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            yield conn, cur
