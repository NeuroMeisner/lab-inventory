from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import SearchResultItem

router = APIRouter(tags=["search"])

SEARCH_SQL = text("""
    WITH stock AS (
        SELECT nomenclature_id, COUNT(*) AS cnt, COALESCE(SUM(current_amount), 0) AS amt
        FROM packages
        WHERE placement_status = 'placed'
        GROUP BY nomenclature_id
    )
    SELECT n.id, n.name, n.synonyms, n.cas_number, n.unit, n.category, n.tracking_mode,
           n.storage_temp, n.nomenclature_code,
           COALESCE(s.cnt, 0) AS packages_available,
           COALESCE(s.amt, 0) AS total_amount,
           (
             CASE WHEN n.name ILIKE '%' || :q || '%' THEN 3 ELSE 0 END
             + CASE WHEN to_tsvector('english', n.name) @@ websearch_to_tsquery('english', :q) THEN 2 ELSE 0 END
             + CASE WHEN similarity(n.name, :q) > 0.3 THEN 1 ELSE 0 END
           ) AS relevance
    FROM nomenclature n
    LEFT JOIN stock s ON s.nomenclature_id = n.id
    WHERE n.name ILIKE '%' || :q || '%'
       OR n.cas_number ILIKE '%' || :q || '%'
       OR coalesce(array_to_string(n.synonyms, ' '), '') ILIKE '%' || :q || '%'
       OR to_tsvector('english', n.name) @@ websearch_to_tsquery('english', :q)
       OR similarity(n.name, :q) > 0.3
    ORDER BY relevance DESC, n.name ASC
    LIMIT :limit
""")


@router.get("/search", response_model=list[SearchResultItem])
async def search(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        raise HTTPException(status_code=422, detail="Query is too short")
    rows = (await db.execute(SEARCH_SQL, {"q": q, "limit": limit})).all()
    return [SearchResultItem(**row._mapping) for row in rows]