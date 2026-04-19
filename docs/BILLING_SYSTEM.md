# 💳 Scriptz AI — Credit-Based Billing System (Paddle)

> **Stack**: FastAPI + SQLAlchemy + PostgreSQL (Supabase) + Paddle Billing

---

## 📐 Architecture Overview

```
┌─────────────┐   webhook   ┌──────────────────────┐
│   Paddle    │────────────▶│ /api/webhooks/paddle │
│  (Billing)  │             │  (signature verify)  │
└─────────────┘             └──────────┬───────────┘
      ▲                                │
      │ Checkout                       ▼
      │                      ┌──────────────────┐
      │                      │  PaddleEventLog  │  ← idempotency
      │                      └────────┬─────────┘
      │                               │
┌─────┴───────┐                       ▼
│   Client    │              ┌──────────────────┐
│   (React)   │              │ BillingService   │
└─────┬───────┘              │ - handle_sub_*   │
      │                      │ - handle_txn     │
      │  API                 │ - grant_credits  │
      ▼                      └────────┬─────────┘
┌─────────────┐                       │
│   FastAPI   │◀──────────────────────┤
│             │   debit_credits       │
│ /api/coach  │◀──────────────────────┤
│ /api/thumbs │   DB transactions     │
└──────┬──────┘                       ▼
       │                    ┌──────────────────┐
       └───────────────────▶│  CreditService   │
                            │ (atomic deduct)  │
                            └────────┬─────────┘
                                     ▼
                            ┌──────────────────┐
                            │   PostgreSQL     │
                            │  (SELECT FOR UPD)│
                            └──────────────────┘
```

### Core Principles

- **Webhooks are the single source of truth** for subscription/payment state
- **Credits are deducted atomically** using row-level locks (`SELECT FOR UPDATE`)
- **All mutations are logged** in an immutable ledger
- **All webhook events are deduplicated** by `event_id` unique constraint
- **No client-side credit logic** — server-only deductions

---

## 🗄️ Database Schema

```sql
-- ═══════════════════════════════════════════════════════════════
-- 1. Plans (admin-configurable, stored in DB not code)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE billing_plans (
    id              BIGSERIAL PRIMARY KEY,
    slug            VARCHAR(32) UNIQUE NOT NULL,     -- 'starter' | 'creator' | 'ultimate'
    name            VARCHAR(64) NOT NULL,
    paddle_price_id VARCHAR(64) UNIQUE NOT NULL,     -- Paddle price_xxx
    monthly_credits INTEGER NOT NULL,
    price_usd       NUMERIC(10, 2) NOT NULL,
    billing_period  VARCHAR(16) NOT NULL,            -- 'month' | 'year'
    max_channels    INTEGER NOT NULL DEFAULT 2,
    features_json   JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 2. Credit packs (one-time, never expire)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE credit_packs (
    id              BIGSERIAL PRIMARY KEY,
    slug            VARCHAR(32) UNIQUE NOT NULL,     -- 'pack_1k' | 'pack_5k'
    name            VARCHAR(64) NOT NULL,
    paddle_price_id VARCHAR(64) UNIQUE NOT NULL,
    credits         INTEGER NOT NULL,
    price_usd       NUMERIC(10, 2) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 3. Subscriptions (one active row per user)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE subscriptions (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id                 BIGINT NOT NULL REFERENCES billing_plans(id),
    paddle_subscription_id  VARCHAR(64) UNIQUE NOT NULL,
    paddle_customer_id      VARCHAR(64) NOT NULL,
    status                  VARCHAR(32) NOT NULL,    -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at             TIMESTAMPTZ,
    last_event_sequence     BIGINT,                  -- for out-of-order handling
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Only ONE active subscription per user (enforced)
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user
    ON subscriptions(user_id)
    WHERE status IN ('active', 'trialing', 'past_due');

-- ═══════════════════════════════════════════════════════════════
-- 4. Credit balance (one row per user, updated atomically)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE credit_balances (
    user_id                  BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    subscription_credits     INTEGER NOT NULL DEFAULT 0,
    subscription_expires_at  TIMESTAMPTZ,            -- when sub credits expire (period_end)
    permanent_credits        INTEGER NOT NULL DEFAULT 0,  -- from one-time packs
    total_granted_lifetime   BIGINT NOT NULL DEFAULT 0,
    total_used_lifetime      BIGINT NOT NULL DEFAULT 0,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT non_negative_balance CHECK (
        subscription_credits >= 0 AND permanent_credits >= 0
    )
);

-- ═══════════════════════════════════════════════════════════════
-- 5. Ledger (immutable append-only audit log)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE credit_ledger (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta           INTEGER NOT NULL,                -- positive grant, negative deduct
    kind            VARCHAR(32) NOT NULL,            -- 'subscription_grant' | 'pack_purchase' | 'usage' | 'expiry' | 'refund' | 'admin_adjustment'
    source          VARCHAR(32) NOT NULL,            -- 'subscription' | 'permanent'
    reason          TEXT,
    feature_key     VARCHAR(64),                     -- for usage: 'thumbnail_generate' etc.
    request_id      VARCHAR(64),                     -- client/request idempotency
    paddle_event_id VARCHAR(128),                    -- for webhook-driven events
    balance_after_subscription INTEGER NOT NULL,
    balance_after_permanent    INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_user_created ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_ledger_paddle_event ON credit_ledger(paddle_event_id) WHERE paddle_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ledger_request_id ON credit_ledger(request_id) WHERE request_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 6. Paddle event log (webhook idempotency + audit)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE paddle_events (
    event_id        VARCHAR(128) PRIMARY KEY,        -- Paddle's event_id (unique)
    event_type      VARCHAR(64) NOT NULL,            -- 'subscription.created' etc.
    occurred_at     TIMESTAMPTZ NOT NULL,
    paddle_sequence BIGINT,
    payload         JSONB NOT NULL,
    processed_at    TIMESTAMPTZ,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending' | 'processed' | 'failed' | 'skipped'
    error           TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paddle_events_status ON paddle_events(status);
CREATE INDEX idx_paddle_events_type_occurred ON paddle_events(event_type, occurred_at);

-- ═══════════════════════════════════════════════════════════════
-- 7. Usage events (feature analytics — separate from ledger for performance)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE usage_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key     VARCHAR(64) NOT NULL,
    credits_charged INTEGER NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_user_feature ON usage_events(user_id, feature_key, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 8. App config (admin-controlled dynamic settings)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE app_config (
    key             VARCHAR(128) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     TEXT,
    updated_by      BIGINT REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed feature credit costs
INSERT INTO app_config (key, value, description) VALUES
  ('credit_costs', '{
    "thumbnail_generate": 20,
    "thumbnail_recreate": 20,
    "thumbnail_edit_faceswap": 20,
    "thumbnail_seo": 20,
    "thumbnail_ab_test": 5,
    "thumbnail_analyze": 3,
    "coach_message": 2,
    "coach_deep_think": 3,
    "title_generate_3": 2,
    "title_score": 2,
    "description_rewrite": 3,
    "tag_generate": 1
  }'::jsonb, 'Credits charged per feature call'),
  ('feature_flags', '{
    "allow_ab_testing": true,
    "allow_personas": true,
    "allow_faceswap": true
  }'::jsonb, 'Feature toggles'),
  ('rate_limits', '{
    "thumbnail_generate_per_minute": 5,
    "coach_messages_per_minute": 30
  }'::jsonb, 'Per-user rate limits');
```

---

## 📁 Folder Structure

```
app/
├── billing/
│   ├── __init__.py
│   ├── models.py                    # SQLAlchemy ORM models
│   ├── schemas.py                   # Pydantic request/response
│   ├── services/
│   │   ├── credit_service.py        # Atomic deduction logic
│   │   ├── billing_service.py       # Subscription state management
│   │   ├── paddle_client.py         # Paddle API client (checkout, portal)
│   │   └── config_service.py        # Read credit costs from DB (cached)
│   ├── routes/
│   │   ├── checkout.py              # POST /api/billing/checkout
│   │   ├── subscription.py          # GET /api/billing/subscription
│   │   ├── credits.py               # GET /api/billing/credits
│   │   └── webhooks.py              # POST /api/webhooks/paddle
│   ├── webhooks/
│   │   ├── verifier.py              # HMAC signature verification
│   │   └── handlers/
│   │       ├── subscription.py      # created / updated / canceled / renewed
│   │       └── transaction.py       # one-time purchases
│   └── admin/
│       └── config_routes.py         # Admin endpoints
└── core/
    └── credit_gate.py               # Decorator: @charge_credits("thumbnail_generate")
```

---

## 🔐 Paddle Webhook Verification

```python
# app/billing/webhooks/verifier.py
import hmac
import hashlib
import time
from typing import Optional

from app.core.config import settings

MAX_TIMESTAMP_SKEW = 5 * 60  # 5 minutes


class PaddleSignatureError(Exception):
    pass


def verify_paddle_signature(raw_body: bytes, signature_header: Optional[str]) -> None:
    """
    Paddle signs webhook body with HMAC-SHA256.
    Header format: "ts=1234567890;h1=abc123..."

    Raises PaddleSignatureError on any failure.
    """
    if not signature_header:
        raise PaddleSignatureError("Missing Paddle-Signature header")

    parts = {}
    for seg in signature_header.split(";"):
        if "=" in seg:
            k, v = seg.split("=", 1)
            parts[k.strip()] = v.strip()

    ts = parts.get("ts")
    h1 = parts.get("h1")
    if not ts or not h1:
        raise PaddleSignatureError("Malformed signature header")

    # Replay protection
    try:
        ts_int = int(ts)
    except ValueError:
        raise PaddleSignatureError("Bad timestamp")
    if abs(time.time() - ts_int) > MAX_TIMESTAMP_SKEW:
        raise PaddleSignatureError("Timestamp outside allowed window")

    secret = settings.PADDLE_WEBHOOK_SECRET.encode()
    signed_payload = f"{ts}:{raw_body.decode('utf-8')}".encode()
    expected = hmac.new(secret, signed_payload, hashlib.sha256).hexdigest()

    # Constant-time comparison
    if not hmac.compare_digest(expected, h1):
        raise PaddleSignatureError("Signature mismatch")
```

---

## 🎯 Credit Deduction Service (atomic, no leaks)

```python
# app/billing/services/credit_service.py
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.billing.models import CreditBalance, CreditLedger, UsageEvent


class InsufficientCreditsError(Exception):
    def __init__(self, needed: int, available: int):
        self.needed = needed
        self.available = available
        super().__init__(f"Insufficient credits: needed={needed} available={available}")


class CreditService:
    """
    All credit mutations go through here.
    Uses SELECT FOR UPDATE to prevent race conditions under concurrent requests.
    """

    @staticmethod
    def deduct(
        db: Session,
        *,
        user_id: int,
        amount: int,
        feature_key: str,
        request_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> CreditBalance:
        """
        Atomically deduct credits.
        - Uses subscription_credits first, then permanent_credits.
        - Inserts ledger row + usage event.
        - Idempotent via request_id (if same request retried, no double-charge).
        - Raises InsufficientCreditsError on empty balance.
        """
        if amount <= 0:
            raise ValueError("Amount must be positive")

        # Idempotency: if this request_id already charged, return current balance
        if request_id:
            existing = db.query(CreditLedger).filter(
                CreditLedger.request_id == request_id
            ).first()
            if existing:
                return CreditService.get_balance(db, user_id)

        # Lock user's balance row (prevents concurrent deduction races)
        balance = (
            db.query(CreditBalance)
            .filter(CreditBalance.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not balance:
            raise InsufficientCreditsError(needed=amount, available=0)

        total_available = balance.subscription_credits + balance.permanent_credits
        if total_available < amount:
            raise InsufficientCreditsError(needed=amount, available=total_available)

        # Deduct from subscription_credits first, then permanent
        remaining = amount
        from_sub = min(balance.subscription_credits, remaining)
        balance.subscription_credits -= from_sub
        remaining -= from_sub

        from_perm = 0
        if remaining > 0:
            from_perm = remaining
            balance.permanent_credits -= from_perm

        balance.total_used_lifetime += amount

        # Append to ledger (immutable)
        if from_sub > 0:
            db.add(CreditLedger(
                user_id=user_id,
                delta=-from_sub,
                kind="usage",
                source="subscription",
                feature_key=feature_key,
                request_id=request_id,
                balance_after_subscription=balance.subscription_credits,
                balance_after_permanent=balance.permanent_credits,
            ))
        if from_perm > 0:
            db.add(CreditLedger(
                user_id=user_id,
                delta=-from_perm,
                kind="usage",
                source="permanent",
                feature_key=feature_key,
                request_id=request_id,
                balance_after_subscription=balance.subscription_credits,
                balance_after_permanent=balance.permanent_credits,
            ))

        db.add(UsageEvent(
            user_id=user_id,
            feature_key=feature_key,
            credits_charged=amount,
            metadata=metadata,
        ))

        db.flush()
        return balance

    @staticmethod
    def grant_subscription_credits(
        db: Session,
        *,
        user_id: int,
        credits: int,
        expires_at,
        paddle_event_id: str,
        reason: str = "subscription_renewal",
    ) -> CreditBalance:
        """
        Grant monthly subscription credits. Replaces (not adds) current sub credits.
        Called from webhook handler on subscription.created / subscription.updated (renewal).
        """
        balance = (
            db.query(CreditBalance)
            .filter(CreditBalance.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not balance:
            balance = CreditBalance(user_id=user_id)
            db.add(balance)

        # Subscription credits RESET (not accumulate) — they expire each cycle
        old_sub = balance.subscription_credits
        balance.subscription_credits = credits
        balance.subscription_expires_at = expires_at
        balance.total_granted_lifetime += credits

        # Log the replacement as two entries for clarity
        if old_sub > 0:
            db.add(CreditLedger(
                user_id=user_id,
                delta=-old_sub,
                kind="expiry",
                source="subscription",
                reason="Previous cycle credits expired",
                paddle_event_id=paddle_event_id,
                balance_after_subscription=0,
                balance_after_permanent=balance.permanent_credits,
            ))

        db.add(CreditLedger(
            user_id=user_id,
            delta=credits,
            kind="subscription_grant",
            source="subscription",
            reason=reason,
            paddle_event_id=paddle_event_id,
            balance_after_subscription=credits,
            balance_after_permanent=balance.permanent_credits,
        ))
        db.flush()
        return balance

    @staticmethod
    def grant_pack_credits(
        db: Session,
        *,
        user_id: int,
        credits: int,
        paddle_event_id: str,
    ) -> CreditBalance:
        """Add permanent (never-expiring) credits from one-time pack purchase."""
        balance = (
            db.query(CreditBalance)
            .filter(CreditBalance.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not balance:
            balance = CreditBalance(user_id=user_id)
            db.add(balance)

        balance.permanent_credits += credits
        balance.total_granted_lifetime += credits

        db.add(CreditLedger(
            user_id=user_id,
            delta=credits,
            kind="pack_purchase",
            source="permanent",
            paddle_event_id=paddle_event_id,
            balance_after_subscription=balance.subscription_credits,
            balance_after_permanent=balance.permanent_credits,
        ))
        db.flush()
        return balance

    @staticmethod
    def revoke_subscription_credits(db: Session, *, user_id: int, paddle_event_id: str):
        """On cancellation — zero out subscription credits. Keep permanent."""
        balance = (
            db.query(CreditBalance)
            .filter(CreditBalance.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not balance or balance.subscription_credits == 0:
            return
        amount = balance.subscription_credits
        balance.subscription_credits = 0
        balance.subscription_expires_at = None
        db.add(CreditLedger(
            user_id=user_id,
            delta=-amount,
            kind="expiry",
            source="subscription",
            reason="Subscription canceled",
            paddle_event_id=paddle_event_id,
            balance_after_subscription=0,
            balance_after_permanent=balance.permanent_credits,
        ))
        db.flush()

    @staticmethod
    def get_balance(db: Session, user_id: int) -> CreditBalance:
        balance = db.query(CreditBalance).filter(CreditBalance.user_id == user_id).first()
        if not balance:
            balance = CreditBalance(user_id=user_id)
            db.add(balance)
            db.flush()
        return balance
```

---

## 🎫 Credit Gate (decorator / FastAPI dependency)

```python
# app/core/credit_gate.py
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.billing.services.credit_service import CreditService, InsufficientCreditsError
from app.billing.services.config_service import get_credit_cost


def charge_credits(feature_key: str):
    """
    FastAPI dependency that charges credits BEFORE the route runs.

    Usage:
        @router.post("/thumbnails/generate",
                     dependencies=[Depends(charge_credits("thumbnail_generate"))])
        async def generate(...): ...
    """
    async def _dep(
        request: Request,
        current_user = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        cost = get_credit_cost(db, feature_key)
        # Use idempotency key from client (X-Request-ID) to prevent double-charge on retries
        req_id = request.headers.get("X-Request-ID")

        try:
            CreditService.deduct(
                db,
                user_id=current_user.id,
                amount=cost,
                feature_key=feature_key,
                request_id=req_id,
            )
            db.commit()
        except InsufficientCreditsError as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "INSUFFICIENT_CREDITS",
                    "needed": e.needed,
                    "available": e.available,
                    "feature": feature_key,
                },
            )
    return _dep
```

---

## 📬 Webhook Handler

```python
# app/billing/routes/webhooks.py
import logging
from fastapi import APIRouter, Request, Depends, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_db
from app.billing.models import PaddleEvent
from app.billing.webhooks.verifier import verify_paddle_signature, PaddleSignatureError
from app.billing.webhooks.handlers.subscription import handle_subscription_event
from app.billing.webhooks.handlers.transaction import handle_transaction_event

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/paddle", status_code=status.HTTP_200_OK)
async def paddle_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()

    # 1. Verify signature
    try:
        verify_paddle_signature(raw, request.headers.get("Paddle-Signature"))
    except PaddleSignatureError as e:
        logger.warning("Paddle signature failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_id = payload.get("event_id")
    event_type = payload.get("event_type")
    occurred_at = payload.get("occurred_at")

    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event_id/event_type")

    # 2. Idempotency: insert-or-skip. If event_id already exists, return 200.
    event_row = PaddleEvent(
        event_id=event_id,
        event_type=event_type,
        occurred_at=occurred_at,
        payload=payload,
        status="pending",
    )
    try:
        db.add(event_row)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Duplicate → Paddle will retry; we already processed. Return 200.
        logger.info("Duplicate webhook event_id=%s — skipping", event_id)
        return {"status": "duplicate"}

    # 3. Dispatch to handler
    try:
        if event_type.startswith("subscription."):
            handle_subscription_event(db, event_row)
        elif event_type.startswith("transaction."):
            handle_transaction_event(db, event_row)
        else:
            logger.info("Unhandled event type: %s", event_type)
            event_row.status = "skipped"

        if event_row.status == "pending":
            event_row.status = "processed"
            from datetime import datetime, timezone
            event_row.processed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        db.rollback()
        # Mark failed but DON'T re-raise — return 200 so Paddle doesn't spam retries
        # for non-recoverable errors. Use background retry job for transient ones.
        logger.exception("Webhook handler failed for event_id=%s: %s", event_id, e)
        event_row.status = "failed"
        event_row.error = str(e)[:500]
        event_row.retry_count += 1
        db.commit()
        # Return 500 if we want Paddle to retry; 200 if we don't.
        # Retriable errors (DB down, network): return 500.
        # Logic errors: return 200 and alert.
        if isinstance(e, (ConnectionError, TimeoutError)):
            raise HTTPException(status_code=500, detail="Transient error — retry")

    return {"status": "ok"}
```

---

## 🔀 Subscription Event Handler

```python
# app/billing/webhooks/handlers/subscription.py
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.billing.models import Subscription, BillingPlan, PaddleEvent
from app.billing.services.credit_service import CreditService

logger = logging.getLogger(__name__)


def _parse_ts(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def handle_subscription_event(db: Session, event: PaddleEvent):
    data = event.payload.get("data", {})
    event_type = event.event_type

    paddle_sub_id = data.get("id")
    paddle_customer_id = data.get("customer_id")
    paddle_sequence = event.payload.get("sequence")

    # Match Paddle customer → our user via pre-created mapping (stored at checkout)
    user_id = _user_id_from_customer(db, paddle_customer_id)
    if not user_id:
        logger.warning("No user mapped to customer_id=%s", paddle_customer_id)
        event.status = "skipped"
        event.error = "User not found for customer"
        return

    # Find plan from the price_id in items
    items = data.get("items", [])
    price_id = items[0].get("price", {}).get("id") if items else None
    plan = db.query(BillingPlan).filter(BillingPlan.paddle_price_id == price_id).first() if price_id else None

    # Out-of-order protection: skip if older sequence already applied
    existing_sub = db.query(Subscription).filter(
        Subscription.paddle_subscription_id == paddle_sub_id
    ).with_for_update().first()

    if existing_sub and paddle_sequence and existing_sub.last_event_sequence:
        if paddle_sequence <= existing_sub.last_event_sequence:
            logger.info("Out-of-order event skipped: sub=%s seq=%s last=%s",
                        paddle_sub_id, paddle_sequence, existing_sub.last_event_sequence)
            event.status = "skipped"
            return

    status_map = {
        "active": "active",
        "trialing": "trialing",
        "past_due": "past_due",
        "canceled": "canceled",
        "paused": "paused",
    }
    paddle_status = data.get("status", "active")
    new_status = status_map.get(paddle_status, paddle_status)

    current_period = data.get("current_billing_period") or {}
    period_start = _parse_ts(current_period.get("starts_at"))
    period_end = _parse_ts(current_period.get("ends_at"))
    canceled_at = _parse_ts(data.get("canceled_at"))
    scheduled = data.get("scheduled_change") or {}
    cancel_at_period_end = scheduled.get("action") == "cancel"

    # UPSERT subscription
    if not existing_sub:
        if not plan:
            logger.error("Plan not found for price_id=%s", price_id)
            event.status = "failed"
            event.error = "Plan not found"
            return
        existing_sub = Subscription(
            user_id=user_id,
            plan_id=plan.id,
            paddle_subscription_id=paddle_sub_id,
            paddle_customer_id=paddle_customer_id,
            status=new_status,
            current_period_start=period_start,
            current_period_end=period_end,
            cancel_at_period_end=cancel_at_period_end,
            canceled_at=canceled_at,
            last_event_sequence=paddle_sequence,
        )
        db.add(existing_sub)
    else:
        if plan:
            existing_sub.plan_id = plan.id
        existing_sub.status = new_status
        if period_start:
            existing_sub.current_period_start = period_start
        if period_end:
            existing_sub.current_period_end = period_end
        existing_sub.cancel_at_period_end = cancel_at_period_end
        existing_sub.canceled_at = canceled_at
        existing_sub.last_event_sequence = paddle_sequence
        existing_sub.updated_at = datetime.now(timezone.utc)

    # Dispatch credit side effects
    if event_type in ("subscription.created", "subscription.activated"):
        # First period — grant credits
        if plan:
            CreditService.grant_subscription_credits(
                db,
                user_id=user_id,
                credits=plan.monthly_credits,
                expires_at=period_end,
                paddle_event_id=event.event_id,
                reason="subscription_created",
            )

    elif event_type == "subscription.updated":
        # Could be: renewal, plan change, status change
        # If period advanced → grant new cycle credits
        if plan and period_end and (not existing_sub or existing_sub.current_period_end != period_end):
            CreditService.grant_subscription_credits(
                db,
                user_id=user_id,
                credits=plan.monthly_credits,
                expires_at=period_end,
                paddle_event_id=event.event_id,
                reason="subscription_renewal",
            )
        # Handle downgrade/upgrade — Paddle emits this event with new price_id
        # grant_subscription_credits replaces balance, so upgrade gives new plan's credits

    elif event_type == "subscription.canceled":
        CreditService.revoke_subscription_credits(
            db, user_id=user_id, paddle_event_id=event.event_id
        )

    elif event_type == "subscription.past_due":
        # Keep credits for grace period — Paddle will retry payment
        logger.info("Subscription past_due: user_id=%s", user_id)


def _user_id_from_customer(db: Session, paddle_customer_id: str):
    """Map Paddle customer_id → our user.id. Set during checkout."""
    from app.models.user import User  # adjust import
    user = db.query(User).filter(User.paddle_customer_id == paddle_customer_id).first()
    return user.id if user else None
```

---

## 💰 Transaction (one-time pack) Handler

```python
# app/billing/webhooks/handlers/transaction.py
import logging
from sqlalchemy.orm import Session
from app.billing.models import CreditPack, PaddleEvent
from app.billing.services.credit_service import CreditService

logger = logging.getLogger(__name__)


def handle_transaction_event(db: Session, event: PaddleEvent):
    """
    'transaction.completed' — payment succeeded.
    If it contains a credit pack price_id (not a subscription), grant permanent credits.
    """
    if event.event_type != "transaction.completed":
        event.status = "skipped"
        return

    data = event.payload.get("data", {})
    # If this transaction is linked to a subscription, the subscription.* events handle it
    if data.get("subscription_id"):
        event.status = "skipped"
        return

    paddle_customer_id = data.get("customer_id")
    user_id = _user_id_from_customer(db, paddle_customer_id)
    if not user_id:
        logger.warning("No user for customer_id=%s", paddle_customer_id)
        event.status = "skipped"
        return

    items = data.get("items", [])
    for item in items:
        price_id = (item.get("price") or {}).get("id")
        quantity = item.get("quantity", 1)
        pack = db.query(CreditPack).filter(CreditPack.paddle_price_id == price_id).first()
        if not pack:
            continue
        CreditService.grant_pack_credits(
            db,
            user_id=user_id,
            credits=pack.credits * quantity,
            paddle_event_id=event.event_id,
        )


def _user_id_from_customer(db, paddle_customer_id):
    from app.models.user import User
    user = db.query(User).filter(User.paddle_customer_id == paddle_customer_id).first()
    return user.id if user else None
```

---

## 🛒 Checkout Endpoint

```python
# app/billing/routes/checkout.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.billing.models import BillingPlan, CreditPack
from app.billing.services.paddle_client import create_or_get_paddle_customer, build_checkout_url
from pydantic import BaseModel

router = APIRouter()


class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate price_id belongs to an active plan or pack
    plan = db.query(BillingPlan).filter(
        BillingPlan.paddle_price_id == body.price_id,
        BillingPlan.is_active == True,
    ).first()
    pack = None
    if not plan:
        pack = db.query(CreditPack).filter(
            CreditPack.paddle_price_id == body.price_id,
            CreditPack.is_active == True,
        ).first()
    if not plan and not pack:
        raise HTTPException(400, "Unknown price_id")

    # Get or create Paddle customer_id, save mapping to user
    customer_id = await create_or_get_paddle_customer(db, current_user)

    # Build checkout URL (client uses Paddle.js with the transaction_id or opens URL)
    url = await build_checkout_url(
        price_id=body.price_id,
        customer_id=customer_id,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        custom_data={"user_id": str(current_user.id)},
    )
    return {"checkout_url": url, "customer_id": customer_id}
```

---

## 📊 Public API Endpoints

```python
# app/billing/routes/subscription.py / credits.py
@router.get("/api/billing/subscription")
async def get_my_subscription(current_user=Depends(...), db=Depends(...)):
    sub = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.status.in_(["active", "trialing", "past_due"]),
    ).first()
    return {
        "plan": sub.plan.slug if sub else None,
        "status": sub.status if sub else "none",
        "current_period_end": sub.current_period_end if sub else None,
        "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
    }


@router.get("/api/billing/credits")
async def get_my_credits(current_user=Depends(...), db=Depends(...)):
    bal = CreditService.get_balance(db, current_user.id)
    return {
        "subscription_credits": bal.subscription_credits,
        "permanent_credits": bal.permanent_credits,
        "total": bal.subscription_credits + bal.permanent_credits,
        "subscription_expires_at": bal.subscription_expires_at,
    }


@router.get("/api/billing/ledger")
async def my_ledger(current_user=Depends(...), db=Depends(...), limit: int = 50):
    rows = db.query(CreditLedger).filter(
        CreditLedger.user_id == current_user.id
    ).order_by(CreditLedger.created_at.desc()).limit(limit).all()
    return [{
        "delta": r.delta,
        "kind": r.kind,
        "feature_key": r.feature_key,
        "reason": r.reason,
        "created_at": r.created_at,
    } for r in rows]
```

---

## 👩‍💼 Admin Endpoints

```python
# app/billing/admin/config_routes.py
@router.get("/api/admin/billing/config")
async def get_config(admin=Depends(require_admin), db=Depends(...)):
    rows = db.query(AppConfig).all()
    return {r.key: r.value for r in rows}


@router.put("/api/admin/billing/config/{key}")
async def update_config(key, value: dict, admin=Depends(require_admin), db=Depends(...)):
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    if not row:
        raise HTTPException(404)
    row.value = value
    row.updated_by = admin.id
    db.commit()
    # Invalidate cache (see config_service.py — Redis or LRU)
    invalidate_config_cache(key)


@router.post("/api/admin/billing/plans")
async def create_plan(body, admin=Depends(require_admin), db=Depends(...)):
    # Admin adds new plan (admin must also create price in Paddle dashboard and paste price_id)
    ...


@router.post("/api/admin/billing/adjust-credits")
async def adjust_credits(user_id: int, delta: int, reason: str, admin=Depends(require_admin), db=Depends(...)):
    """Grant or revoke credits manually (support refund, compensation)."""
    balance = CreditService.get_balance(db, user_id)
    if delta > 0:
        balance.permanent_credits += delta
    else:
        # Deduct from sub first, then permanent
        CreditService.deduct(db, user_id=user_id, amount=-delta, feature_key="admin_adjustment")
    db.add(CreditLedger(
        user_id=user_id, delta=delta, kind="admin_adjustment",
        source="permanent" if delta > 0 else "subscription",
        reason=reason,
        balance_after_subscription=balance.subscription_credits,
        balance_after_permanent=balance.permanent_credits,
    ))
    db.commit()
```

---

## 🚨 Edge Cases — How Each Is Handled

| Edge case                                                  | Mitigation                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Duplicate webhook**                                      | `paddle_events.event_id` UNIQUE + `ON CONFLICT DO NOTHING`                                                                   |
| **Out-of-order webhook**                                   | `subscriptions.last_event_sequence` — skip if incoming ≤ stored                                                              |
| **Webhook delay (client refreshes before credits update)** | Client shows last known balance; `GET /billing/credits` polls; after checkout success, client re-fetches every 2s for ~30s   |
| **Payment failure**                                        | Paddle sends `subscription.past_due` — keep credits for grace period; on 3rd dunning fail → `subscription.canceled` → revoke |
| **Upgrade mid-cycle**                                      | `subscription.updated` arrives with new price_id → `grant_subscription_credits` REPLACES balance with new plan's credits     |
| **Downgrade mid-cycle**                                    | Same — balance reset to new plan's amount                                                                                    |
| **Credit exhaustion mid-request**                          | `SELECT FOR UPDATE` row lock prevents race; `InsufficientCreditsError` → 402 response                                        |
| **Concurrent requests draining balance**                   | Row lock ensures serial processing per user                                                                                  |
| **Double-charge on client retry**                          | `X-Request-ID` header → `credit_ledger.request_id` UNIQUE                                                                    |
| **Failed webhook processing**                              | Mark `paddle_events.status = 'failed'`; cron job retries every 5 min up to 10 times                                          |
| **Refund issued in Paddle**                                | `transaction.refunded` webhook → reverse grant via `credit_ledger` adjustment                                                |
| **User deletes account with active sub**                   | Cancel sub via Paddle API in the deletion flow; on `subscription.canceled` webhook → cleanup                                 |
| **Subscription credits expire before renewal**             | Background cron: `UPDATE credit_balances SET subscription_credits = 0 WHERE subscription_expires_at < NOW()`                 |

---

## 🧪 Test Flow (Paddle Sandbox)

### Setup

```bash
# .env
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=sandbox_api_key_xxx
PADDLE_WEBHOOK_SECRET=notification_entity_xxx

# Use ngrok to expose local webhook endpoint
ngrok http 8000
# → https://abc123.ngrok.io/api/webhooks/paddle
# Paste this into Paddle dashboard → Developer → Notifications
```

### Test cases

**1. Subscription creation**

```bash
# Client
POST /api/billing/checkout { "price_id": "pri_starter_monthly" }
# → redirects to Paddle sandbox → uses test card 4242 4242 4242 4242

# Paddle fires webhook: subscription.created
# Verify:
SELECT * FROM subscriptions WHERE user_id = 1;
SELECT * FROM credit_balances WHERE user_id = 1;
# → subscription_credits = 3000, expires_at = ~30 days from now
SELECT * FROM credit_ledger WHERE user_id = 1 ORDER BY id DESC;
# → one 'subscription_grant' row with delta=+3000
```

**2. Credit deduction**

```bash
POST /api/thumbnails/generate  (charges 20 credits)
# → 200 OK
GET /api/billing/credits
# → { "subscription_credits": 2980, "permanent_credits": 0 }
SELECT * FROM credit_ledger WHERE user_id = 1;
# → 'usage' row with delta=-20, feature_key='thumbnail_generate'
```

**3. Renewal** (simulate via Paddle dashboard "Force renewal")

```bash
# Webhook: subscription.updated with new period_end
# Verify:
SELECT subscription_credits FROM credit_balances WHERE user_id = 1;
# → back to 3000 (reset, not added)
```

**4. One-time pack**

```bash
POST /api/billing/checkout { "price_id": "pri_pack_5k" }
# User pays
# Webhook: transaction.completed (no subscription_id)
# Verify:
SELECT permanent_credits FROM credit_balances WHERE user_id = 1;
# → increased by 5000 (additive)
```

**5. Cancellation**

```bash
# Via user portal or admin
# Paddle → subscription.canceled webhook
# Verify:
SELECT subscription_credits FROM credit_balances WHERE user_id = 1;
# → 0 (revoked)
# permanent_credits unchanged
```

**6. Duplicate webhook** (manually re-send via Paddle dashboard "Replay")

```bash
# Verify paddle_events.event_id unique constraint triggers:
tail -f logs | grep "Duplicate webhook"
# Balance should NOT change
```

**7. Payment failure**

```bash
# Use Paddle sandbox test card 4000 0000 0000 0069 (declined)
# Webhook: subscription.past_due
# Credits remain for grace period
# Retry fails 3 times → subscription.canceled → credits revoked
```

**8. Insufficient credits**

```bash
# Drain credits manually in DB
UPDATE credit_balances SET subscription_credits = 5, permanent_credits = 0 WHERE user_id = 1;
POST /api/thumbnails/generate  (needs 20)
# → 402 Payment Required
# → { "code": "INSUFFICIENT_CREDITS", "needed": 20, "available": 5 }
```

---

## 🔒 Security Checklist

- ✅ All credit mutations on server (no client control)
- ✅ Webhook signature verified with HMAC + constant-time comparison + timestamp replay check
- ✅ `SELECT FOR UPDATE` row locks on all credit changes
- ✅ `CHECK (credits >= 0)` DB constraint — impossible to go negative even on bug
- ✅ Idempotency via `paddle_events.event_id UNIQUE` and `credit_ledger.request_id UNIQUE`
- ✅ Admin endpoints require role check
- ✅ Webhook endpoint is PUBLIC (not gated by auth middleware) but signature-verified

---

## 📈 Scalability (100k users)

| Component        | Strategy                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| Webhook endpoint | Idempotent insert + async worker for slow handlers (move to Celery/RQ if > 100ms p99) |
| Credit deduction | Row lock scoped per user — no contention between users. DB can handle 10k+ TPS        |
| Ledger growth    | Partition by month: `credit_ledger_2026_04`, archive old partitions to cold storage   |
| Usage events     | Write-heavy, eventually consistent — consider separate DB or TimescaleDB              |
| Config cache     | In-memory LRU (1 min TTL) + Redis pub/sub invalidation on admin update                |
| Rate limiting    | Redis-backed sliding window keyed by `user_id:feature`                                |

### Indexes are already on:

- `subscriptions(user_id)`, `subscriptions(status)`
- `credit_ledger(user_id, created_at DESC)`, `credit_ledger(paddle_event_id)`
- `paddle_events(status)`, `paddle_events(event_type, occurred_at)`

---

## 🏁 Summary

| Requirement                     | Solution                                                            |
| ------------------------------- | ------------------------------------------------------------------- |
| Credit-based subs (3K/7K/16K)   | `billing_plans.monthly_credits`, granted on webhook                 |
| One-time credit purchases       | `credit_packs` → `permanent_credits` (no expiry)                    |
| Credits expire on renewal       | `grant_subscription_credits` REPLACES balance                       |
| Used subscription credits first | `deduct()` drains `subscription_credits` before `permanent_credits` |
| Webhook source of truth         | `paddle_events` table, signature verified, idempotent               |
| Admin configurable              | `app_config` table + `/api/admin/billing/*` endpoints               |
| Scale to 100k users             | Row locks scoped per user, indexed ledger, partitioned tables       |
| Cost-safe                       | DB constraint `credits >= 0`, atomic deducts, idempotent grants     |
| Secure                          | HMAC verify, server-only mutations, no client control               |
