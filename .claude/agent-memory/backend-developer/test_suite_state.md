---
name: Pre-existing pytest fixture is broken — use isolated engines for new tests
description: tests/conftest.py engine fixture fails on Base.metadata.create_all because models use JSONB (postgres-only) on SQLite and Role has a duplicate ix_roles_slug index
type: project
---

Running `pytest tests/` against `main` errors out for ALL existing tests at the shared `engine` fixture in `tests/conftest.py`, with two compounding pre-existing bugs:

1. `app/models/role.py` declares `slug` with both `index=True` AND `__table_args__ = (Index("ix_roles_slug", ...), )` — SQLAlchemy then tries to create two indices with the same name and SQLite fails on the second.
2. `frontend_events.properties` uses `JSONB` (postgres-only) which SQLite can't render at `create_all` time.

The email tests in `tests/test_email_*.py` were merged in a state that has never run green locally; whoever wrote them must have used a postgres test DB or skipped the suite. There's no CI test job — `.github/workflows/deploy.yml` builds and deploys without running pytest.

**Why:** Two unrelated drift events accumulated: someone added the explicit Index after the column-level `index=True` was already there, and someone else added a JSONB column without considering the SQLite test path.

**How to apply:** When writing new tests against this repo, do NOT rely on the global `engine` fixture in `tests/conftest.py` — it will fail before your test code runs. Instead, build a self-contained engine fixture inside your test file that creates only the specific `__table__` rows you need (e.g., `ThumbnailConversation.__table__.create(bind=engine)`). This is exactly the pattern in `tests/test_thumbnail_chat_user_message.py`. Fixing the root cause is out of scope for most tasks — flag it but don't bundle it with unrelated work.
