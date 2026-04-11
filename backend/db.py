import os
import aiomysql
from contextlib import asynccontextmanager

_pool = None

async def init_pool():
    global _pool
    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", "3306"))
    db_user = os.getenv("DB_USER", "root")
    db_pass = os.getenv("DB_PASSWORD", "root")
    db_name = os.getenv("DB_NAME", "proctorai")
    print(f"[DB] Connecting to {db_user}@{db_host}:{db_port}/{db_name}")
    _pool = await aiomysql.create_pool(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_pass,
        db=db_name,
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
