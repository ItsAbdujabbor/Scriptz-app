# 🧪 Scriptz AI — A/B Testing System

> **Status:** Phase 2 shipped (multi-variant + automatic rotation + auto-apply winner + predictive lift + windowed metrics + TTL cache + background worker).
> **Last updated:** April 13, 2026.
> **Owners:** Product + Backend.
> **Audience:** engineering, product, support, ops.

This document is the single source of truth for the A/B Testing feature: what
it does, the architecture behind it, how it talks to YouTube, the credit
pricing, real-dollar economics, the rules we follow to stay statistically
honest, and the roadmap for v3+.

---

## Table of contents

1. [Product summary](#product-summary)
2. [Test types](#test-types)
3. [Feature matrix by SRX tier](#feature-matrix-by-srx-tier)
4. [User journey](#user-journey)
5. [Statistical model](#statistical-model)
6. [Architecture](#architecture)
7. [Data model](#data-model)
8. [API surface](#api-surface)
9. [Background worker](#background-worker)
10. [Honesty rules — what we will **not** do](#honesty-rules--what-we-will-not-do)
11. [YouTube quota & rate-limit budget](#youtube-quota--rate-limit-budget)
12. [Real-dollar cost per test](#real-dollar-cost-per-test)
13. [Credit pricing](#credit-pricing)
14. [Worked examples](#worked-examples)
15. [Margins](#margins)
16. [Failure modes & operational notes](#failure-modes--operational-notes)
17. [Roadmap](#roadmap)

---

## Product summary

A/B Testing lets a creator compare up to **5 variants** (thumbnail, title, or
both) on a real YouTube video using **real Analytics data** — impressions,
CTR, views per hour, watch-time. The system rotates variants on a schedule
(or on demand), reads per-window metrics from YouTube Analytics v2, runs a
two-proportion z-test to declare a winner once enough data exists, and can
**auto-apply** the winner back to YouTube without the creator lifting a
finger.

It is the only honest A/B testing surface in the YouTube creator stack:

- No simulated CTR.
- No "winner" declared without statistical significance.
- No fake "AI prediction" — just real measurements + a transparent z-test.
- Works the way YouTube's data actually arrives (delayed, windowed, sparse).

---

## Test types

| Kind            | What rotates                                                    | Use case                                         |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **`thumbnail`** | Variant thumbnail uploaded to YouTube via `thumbnails.set`      | Most common; thumbnails drive 90% of CTR         |
| **`title`**     | Variant title sent via `videos.update` (snippet)                | Words matter — punchier hook can lift CTR 5–15 % |
| **`both`**      | Both title and thumbnail rotated together (one logical variant) | Big creative pivot — new packaging round-trip    |

A single variant entry holds an optional title + an optional `thumbnail_url`
(public URL or `data:image/...;base64,…` for user-uploaded). The kind
determines which fields the create wizard shows; the engine doesn't care.

---

## Feature matrix by SRX tier

| Capability                                               | SRX-1 Lite | SRX-2 Pro | SRX-3 Ultra |
| -------------------------------------------------------- | :--------: | :-------: | :---------: |
| Max variants per test                                    |   **2**    |   **5**   |    **5**    |
| Manual rotation (you click _Activate_)                   |     ✅     |    ✅     |     ✅      |
| Automatic rotation on schedule                           |     —      |    ✅     |     ✅      |
| Real impressions / CTR / views from YT Analytics         |     ✅     |    ✅     |     ✅      |
| Two-proportion z-test confidence                         |     ✅     |    ✅     |     ✅      |
| Multi-color trend chart                                  |     —      |    ✅     |     ✅      |
| Time-window CTR breakdown (0–6h / 6–24h / 24–48h / 48h+) |     ✅     |    ✅     |     ✅      |
| Predicted 30-day lift (extra views)                      |     —      |    ✅     |     ✅      |
| AI insights ("why this won") bullet list                 |     —      |     —     |     ✅      |
| Auto-apply winning variant to YouTube                    |     —      |    ✅     |     ✅      |
| Concurrent tests per channel                             |     1      |     5     |     25      |

Plan gating (server-enforced): the route dependency
`require_plan_feature("ab_testing", min_tier="creator")` blocks any user
below the Creator plan. Variant cap + advanced surfaces are gated by
`MAX_VARIANTS_BY_TIER` and the SRX tier currently selected.

---

## User journey

1. **Sidebar → A/B Testing** — opens the list of all experiments.
2. **New experiment** wizard:
   - Pick a video from the channel's recent uploads.
   - Choose `thumbnail` / `title` / `both`.
   - Add up to 5 variants — variant A is auto-prefilled with the live title
     - thumbnail. For each additional variant, upload a thumbnail file (saved
       as base64 inline) or paste an image URL, and/or type a new title.
   - Choose **Manual** or **Automatic** mode.
     - Automatic: pick _Rotate every X hours_ and optionally _Auto-apply the
       winner when confidence is medium+_.
3. **Detail view** shows live state per variant:
   - Status pill (running / paused / completed), mode, SRX tier, active slug.
   - Per variant: thumbnail preview, title, CTR %, views, impressions,
     views/hr, time the variant has been live.
   - **Summary**: CTR delta, ranking, p-value, confidence badge, verdict
     line ("Variant C wins — 2.3 pp higher CTR (high confidence, p=0.004)").
   - **Predicted lift** card (Pro+): 30-day extra views projected from the
     leader's current views/hour and CTR delta vs the weakest variant.
   - **CTR by time window** table.
   - Multi-color SVG trend chart.
4. **Apply winner**: one click — backend calls `videos.update` (title) +
   `thumbnails.set` (image bytes) on YouTube, stamps `winner_applied_at`.
5. **Pause / Resume / Complete / Delete** in the header.

---

## Statistical model

The honest part. All numbers are real.

**Per variant** we accumulate snapshots from YouTube Analytics v2 inside the
window the variant was live (`started_at` → `ended_at` or now). Each snapshot
captures: views, impressions, impression CTR, average view duration,
estimated minutes watched.

**Winner detection** (`ABTestService._compare_n`):

1. Compute each variant's CTR = `views ÷ impressions` (ground truth — we
   don't trust YouTube's `cardClickRate`, that's not the same metric).
2. Rank by CTR descending.
3. **Honest gate** — every variant must have:
   - `impressions ≥ 300`
   - `hours_running ≥ 12`

   If not, return `enough_data: false` with a `reason` listing what's
   missing. **No winner is declared.**

4. Run a **two-proportion z-test** between the leader and the runner-up:
   `p = erfc(|z| / √2)` where
   `z = (p̂₁ − p̂₂) / √( p̄(1−p̄)·(1/n₁ + 1/n₂) )`.
5. Bucket the p-value:
   - `< 0.01` → **high**
   - `< 0.10` → **medium**
   - `< 0.30` → **low** (no winner declared — keep running)
   - else → **insufficient** (no winner)
6. Tie guard — if the absolute CTR delta is `< 0.2 pp`, we call it a tie even
   if the p-value bucket is high.

**Predicted lift** (`_predict_lift`, Pro+):

- Picks the leader's CTR vs the weakest variant's CTR → `ctr_lift_pp`,
  `ctr_lift_pct`.
- Projects 30-day views from the leader's `views_per_hour × 24 × 30`.
- Returns `{available: false, reason: …}` whenever there isn't a second
  measured variant — never extrapolates from one data point.

**Time-window breakdown** (`_build_windowed`):

- Buckets snapshots by _age since variant.started_at_: `0–6h`, `6–24h`,
  `24–48h`, `48h+`. Per bucket: mean CTR + summed views/impressions.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Frontend                                 │
│   src/app/ABTesting.jsx  ┐   list / create wizard / detail view     │
│   src/components/        │   ABTestPanel (legacy in-modal entry)    │
│   src/queries/abTests/   │   TanStack Query hooks (120 s polling)   │
└────────────────────────────────────────────────────────────────────┐ │
                            │  REST + Bearer JWT                     │ │
┌───────────────────────────▼────────────────────────────────────────┘ │
│                            Backend (FastAPI)                         │
│                                                                      │
│   app/api/routes/ab_tests.py  ── HTTP layer, plan gate              │
│   app/services/ab_test_service.py  ── core engine (N-variant, z-test│
│                                       ranking, lift, windowed, decoder)│
│   app/services/ab_test_worker.py  ── asyncio task on startup         │
│                                       (rotates + snapshots + applies)│
│   app/services/youtube_analytics_service.py                          │
│        wraps Analytics v2 reports.query, raises AnalyticsScopeMissing│
│        TTL cache (5 min, 1024-entry cap) keyed on (channel, video    │
│        set, start, end) — every call is read-through.                │
│   app/services/youtube_api.py                                        │
│        adds set_video_thumbnail (multipart upload to thumbnails.set) │
│        update_video_metadata (snippet PUT for title)                 │
└────────────────────────────────────────────────────────────────────┐ │
                            │                                       │ │
        ┌───────────────────▼───────┐      ┌────────────────────────▼─┐
        │   Postgres (Supabase)     │      │   YouTube Data API v3    │
        │   ab_tests                │      │   YouTube Analytics v2   │
        │   ab_test_variations      │      │   (yt-analytics.readonly)│
        │   ab_test_snapshots       │      └──────────────────────────┘
        └───────────────────────────┘
```

Worker lifecycle: started in `main.py` `@app.on_event("startup")`, stopped
on `shutdown`. One asyncio task; sleeps 60 s between ticks. Each tick opens
a short-lived `SessionLocal()`, walks every `running` test, and per test:
rotation → snapshot → auto-apply winner.

---

## Data model

**`ab_tests`** — one row per experiment (one running per video).

| Column                  | Type            | Notes                                                  |
| ----------------------- | --------------- | ------------------------------------------------------ |
| id                      | int PK          |                                                        |
| user_id                 | int FK users.id |                                                        |
| channel_id              | varchar(64)     | YouTube channel that owns the video                    |
| video_id                | varchar(64)     |                                                        |
| kind                    | varchar(16)     | `thumbnail` / `title` / `both`                         |
| active_variation        | varchar(8)      | slug currently live                                    |
| status                  | varchar(16)     | `running` / `paused` / `completed`                     |
| srx_tier                | varchar(16)     | tier when test created (drives analysis depth on read) |
| mode                    | varchar(16)     | `manual` / `automatic`                                 |
| rotation_interval_hours | int             | nullable; only set when automatic                      |
| last_rotated_at         | tz              | last automatic rotation                                |
| auto_apply_winner       | bool            | when true + confidence ≥ medium → worker applies       |
| winner_slug             | varchar(8)      | last applied winner                                    |
| winner_applied_at       | tz              | timestamp the winner was pushed to YT                  |
| notes                   | text            |                                                        |
| started_at / ended_at   | tz              |                                                        |

**`ab_test_variations`** — one row per variant. Slugs `A..E`.

| Column                | Type       | Notes                                            |
| --------------------- | ---------- | ------------------------------------------------ |
| id                    | int PK     |                                                  |
| ab_test_id            | int FK     | cascade delete                                   |
| slug                  | varchar(8) | A / B / C / D / E (unique per test)              |
| title                 | text       | nullable                                         |
| thumbnail_url         | text       | URL or `data:image/…;base64,…` for inline upload |
| is_active             | bool       | true on the live variant                         |
| started_at / ended_at | tz         | the **window** for this variant                  |

**`ab_test_snapshots`** — append-only telemetry. One row per variant per
worker tick (or per UI fetch), stamped with the period it covers.

| Column                                                                               | Type    | Notes                            |
| ------------------------------------------------------------------------------------ | ------- | -------------------------------- |
| id                                                                                   | int PK  |                                  |
| ab_test_id / variation_id                                                            | int FKs |                                  |
| captured_at                                                                          | tz      | when we read it                  |
| period_start / period_end                                                            | tz      | window passed to Analytics       |
| views, impressions, impression_ctr, estimated_minutes_watched, average_view_duration | numeric | nullable when YT returns nothing |
| raw                                                                                  | jsonb   | full payload for forensics       |

---

## API surface

All routes prefixed `/api/ab-tests`. Plan-gated by
`require_plan_feature("ab_testing", min_tier="creator")`.

| Method   | Path               | Purpose                                                                       |
| -------- | ------------------ | ----------------------------------------------------------------------------- |
| `POST`   | `/`                | Create test (1..N variants, mode, rotation, auto-apply)                       |
| `GET`    | `/`                | List user's tests (filters: channel_id, video_id, status)                     |
| `GET`    | `/{id}`            | Results — refresh snapshot, opportunistic auto-rotate, return windowed + lift |
| `POST`   | `/{id}/variations` | Add a variant (within plan cap)                                               |
| `POST`   | `/{id}/activate`   | Manually rotate the live variant                                              |
| `POST`   | `/{id}/promote`    | Apply a variant's title/thumbnail to YouTube                                  |
| `POST`   | `/{id}/pause`      | Stop the active window                                                        |
| `POST`   | `/{id}/resume`     | Reopen a window                                                               |
| `POST`   | `/{id}/complete`   | Mark completed                                                                |
| `DELETE` | `/{id}`            | Hard-delete test + snapshots                                                  |
| `POST`   | `/{id}/switch`     | (Legacy) two-variant switch shim                                              |

Every response is the schema in `app/schemas/ab_test.py`. Important fields
in `ABTestResultsResponse`: `variations`, `comparison`, `trend`, `windowed`,
`lift`, `scope_missing`, `connection_missing`.

---

## Background worker

`app/services/ab_test_worker.py` runs every **60 seconds**.

For every `running` test:

1. Resolve YouTube connection by `User.supabase_user_id` (Postgres stores
   `youtube_connections.user_id` as the Supabase UUID, not the local int).
2. **Rotate if due** (`rotate_if_due`): when `mode='automatic'` and the
   rotation interval has elapsed, advance to the next slug round-robin and
   call `_apply_variant` (push title via `videos.update`, push thumbnail via
   `thumbnails.set`).
3. **Refresh snapshot**: call `YouTubeAnalyticsService.fetch_video_metrics`
   per variant window → write one row to `ab_test_snapshots`. Same-day
   ranges (or future end dates) are skipped — Analytics rejects them.
4. **Auto-apply winner**: if `auto_apply_winner=true` and we don't already
   have a `winner_applied_at`, recompute results; if `comparison.winner` is
   set with confidence ≥ `medium`, push it to YouTube and stamp the
   timestamp.

The worker is **idempotent** — if the user opens the results page, the
opportunistic snapshot in the route returns cached values from the analytics
TTL cache and skips the write if no time has passed.

---

## Honesty rules — what we will **not** do

These are non-negotiable. They are why this A/B feature is trustworthy.

1. **Never fabricate metrics.** If `yt-analytics.readonly` is missing on the
   OAuth grant, we set `scope_missing=true` and prompt the user to
   reconnect. We **never** swap in Data API v3 lifetime view counts.
2. **Never declare a winner under threshold** (`MIN_IMPRESSIONS_PER_VARIATION
= 300`, `MIN_HOURS_PER_VARIATION = 12`). UI shows "Not enough data" and
   lists exactly what's missing.
3. **Never declare a winner without statistical confidence.** p-value must
   be `< 0.10` (medium bucket) AND CTR delta `≥ 0.2 pp`.
4. **Never rotate a paused or completed test.** Worker checks `status` first.
5. **Never push a thumbnail to YouTube the user didn't upload.** We only
   call `thumbnails.set` with bytes the user provided (decoded from a
   `data:` URL stored inline on the variant row).
6. **Never block on YouTube failures.** Apply / rotate / snapshot are all
   best-effort; failures get logged and the next tick retries. The single
   exception is `POST /promote` which the user explicitly invoked — that
   one returns a 502 so the user sees what went wrong.

---

## YouTube quota & rate-limit budget

| API              | Endpoint                  | Cost per call | Daily quota (free) |
| ---------------- | ------------------------- | ------------- | ------------------ |
| Data API v3      | `videos.update` (snippet) | **50 units**  | 10,000 / project   |
| Data API v3      | `thumbnails.set`          | **50 units**  | 10,000 / project   |
| Analytics API v2 | `reports.query`           | **1 unit**    | 50,000 / project   |

**Effective cost per test per day**:

- Worker tick: 60s × 1440 = 1,440 ticks/day.
- TTL cache (5 min) collapses identical Analytics calls — per test we make
  **at most 12 unique Analytics calls per hour per variant**, but in
  practice fewer because variant windows share start/end dates after the
  first snapshot.
- Realistic worst case: **~144 Analytics units per test per day** (5
  variants × 12 unique calls × 24 h / 5 min cache hit ratio ≈ 100×
  amortized).
- Apply / rotate calls happen **only when the rotation interval elapses**
  (≥ 1 h typical) → ≤ 24 mutations per test per day → **≤ 1,200 Data API
  units per test per day** in the absolute pathological case (rotate every
  hour for a full day).

**Headroom on the free tier**:

- Analytics: `50,000 / 144 ≈ 347 concurrent tests/day`.
- Data API mutations: `10,000 / 100` (typical creator rotates 1–4×/day) =
  **safely supports 100+ concurrent tests/day**.

When we hit ~50 % quota utilisation we apply for a YouTube quota increase
(standard form, usually granted in 7–10 days). Until then, the worker
backs off automatically because every YT 4xx surfaces as a logged warning
and the snapshot row simply isn't written.

---

## Real-dollar cost per test

Per test, the only spend is shared infrastructure. There is **no AI cost**
in the standard A/B Testing flow (no Gemini calls, no image generation —
the thumbnails are uploaded by the user).

| Cost component             | Per test per month          | Notes                                                                     |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| YouTube Analytics calls    | $0.00                       | Free tier (Analytics is free, 50k units/day)                              |
| YouTube Data API mutations | $0.00                       | Free tier (10k units/day)                                                 |
| Postgres storage           | < $0.001                    | ~10 KB / snapshot × 24 / day × 30 days × N variants ≈ 7 MB / test / month |
| FastAPI worker compute     | < $0.001                    | Async task — sub-millisecond per test per tick on Fargate                 |
| Thumbnail bytes (base64)   | < $0.0005                   | ~150 KB / variant stored inline; for 5 variants × 200 KB avg = 1 MB       |
| **Total marginal cost**    | **< $0.005 / test / month** | Effectively free                                                          |

Where the cost **does** appear: if the test runs for months with 5 variants
rotating frequently, snapshot row count grows (~3,600 / month / test). Even
at 1,000 active tests, that's 3.6 M rows / month — well under a single
Supabase Pro instance's headroom.

---

## Credit pricing

A/B testing is **plan-gated** (Creator+) and **tier-aware credit-charged**.
Costs scale with ambition (number of variants) and the SRX tier the user
has selected, not duration. Rotations and winner application stay free so
the product never punishes running tests.

| Action                                         | SRX-1 Lite | SRX-2 Pro | SRX-3 Ultra |
| ---------------------------------------------- | ---------: | --------: | ----------: |
| 🧪 **Create test** (includes first 2 variants) |         10 |    **15** |      **25** |
| ➕ Each additional variant beyond 2            |  — (cap 2) |         5 |           8 |
| 🔁 Manual rotate / activate variant            |          0 |         0 |           0 |
| 🏆 Promote winner / apply variant              |          0 |         0 |           0 |
| 🤖 Auto-apply winner (worker)                  |          0 |         0 |           0 |
| 🛡️ Restore original (variant A)                |          0 |         0 |           0 |
| 💡 AI Insights refresh (opt-in)                |          — |         — |       **5** |
| 🗑 Delete test                                 |          0 |         0 |           0 |

Config keys inside `app_config.credit_costs`:
`ab_test_create`, `ab_test_variant`, `ab_test_insights` — each is a
`{SRX-1, SRX-2, SRX-3}` triple. Set via the
`tiered_credit_costs_and_new_plans` Alembic migration.

### Why this pricing works

- **Predictable for the creator.** On Pro a 3-variant test is `15 + 5 = 20
credits`. At Creator's 4,000-credit quota that's 200 tests / month of
  headroom.
- **Tied to the value, not the duration.** A test that runs for 30 days and
  generates a 5 % CTR lift earns the user thousands of extra views —
  charging 15–25 credits for that is trivial.
- **Worker overhead is paid upfront.** Snapshot polling for the test's
  lifetime is bundled in the create cost — no surprise drip charge.
- **AI Insights are opt-in.** The `GET /{id}` endpoint only returns / charges
  insights when the caller explicitly passes `?insights=true`. Polling the
  results page every 120 s never triggers charges.

---

## Worked examples

**Solo Creator on Pro plan, runs 4 tests / month, 3 variants each.**

```
4 tests × (15 + 5)          = 80 credits / mo  →  ~1 % of the 7,000-credit Creator quota
```

Leaves 6,920 credits for thumbnails, coaching, and SEO.

**Power user on Ultimate, runs 12 tests / month, 5 variants each + AI
insights twice per test.**

```
12 tests × (25 + 3×8)       = 588 credits     (test creation + 3 extra variants)
12 tests × 2 × 5 (insights) = 120 credits     (Ultra AI insights, opt-in)
                              ───
                          708 credits / mo  →  ~5 % of the 15,000-credit
                                              Ultimate quota
```

Even an aggressive workflow consumes only ~5 % of Ultimate's quota.

**Edge case — tester opens 50 tests in a week.**
`50 × 15 = 750 credits` on Pro — ~10 % of the Creator quota. Worker runs
them all; plan limits cap abuse without explicit rate-limits.

---

## Margins

Per-test economics at the new tier-aware pricing:

| Test shape                       |     Credits charged | Credit revenue (avg $0.0014/cr) | Real-$ cost |     Per-test margin |
| -------------------------------- | ------------------: | ------------------------------: | ----------: | ------------------: |
| 2-variant test on Pro            |                  15 |                          $0.021 |    < $0.005 | **+ $0.016 (76 %)** |
| 5-variant test on Pro            |       15 + 5×3 = 30 |                          $0.042 |     < $0.01 | **+ $0.032 (76 %)** |
| 5-variant on Ultra w/ 2 insights | 25 + 8×3 + 5×2 = 59 |                          $0.083 |    < $0.014 | **+ $0.069 (83 %)** |

Stacking plan margin on top (Creator nets $28 / user / month before A/B
credits are spent), A/B testing **expands plan margin, not shrinks it** —
even when creators run hundreds of tests.

---

## Failure modes & operational notes

| Failure                                                           | Symptom                                  | Surface                                                                             | Mitigation                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `yt-analytics.readonly` scope missing on OAuth grant              | `scope_missing=true` in results          | Yellow warning banner asking user to reconnect channel                              | Detected via 401/403 from Analytics + body match; no metrics fabricated     |
| YouTube channel disconnected after test created                   | `connection_missing=true`                | Yellow banner, cached snapshots still shown                                         | Backend falls back to user's most-recent connection; if none, surfaces flag |
| Same-day window                                                   | Worker logs "skipped"                    | None — no row written                                                               | Snapshot loop checks `end_date > start_date` before calling Analytics       |
| YouTube 4xx on `thumbnails.set` (channel not eligible / bad MIME) | 502 from `/promote`, warning from worker | User sees inline error in detail page; auto-apply retries next tick                 | We don't pre-validate the file — let YT decide, surface its message         |
| Worker dies                                                       | No new snapshots                         | Health probe in `/api/health`; logs in CloudWatch via `app.services.ab_test_worker` | Restart on next deploy; the engine is stateless so resume is automatic      |
| Postgres connection lost                                          | Worker tick fails                        | Logged; next tick re-opens a session                                                | `_tick_once` always closes the session in `finally`                         |
| Plan downgrade mid-test                                           | User suddenly over the variant cap       | `add_variation` returns 400, existing variants keep running                         | Cap is enforced at write time, not at read time                             |

Logging — every meaningful event:

- `ab_test_worker started (interval=60s)` on boot.
- `ab_test {id} rotated to {slug} and applied to YouTube` on automatic rotation.
- `ab_test {id} auto-applied winner {slug} ({confidence})` on auto-apply.
- `ab_test {id} snapshot skipped: {reason}` on skipped fetches.
- `ab_test snapshot fetch failed: {…}` on Analytics 4xx/5xx.
- `promote_winner: apply failed` on user-triggered apply failures.

---

## Roadmap

### Phase 1 ✅ (shipped)

- Multi-variant schema (slugs A..E, per-tier cap)
- Manual rotation + apply-to-YouTube
- Promote-winner endpoint (title via `videos.update`, thumbnail via
  `thumbnails.set`)
- Sidebar entry + dedicated `/#ab-testing` page (list + create wizard +
  detail)

### Phase 2 ✅ (shipped)

- Real recurring background worker (asyncio, 60 s, lifecycle-managed)
- Auto-apply winner on confidence ≥ medium
- TTL cache (5 min, 1024-cap) on Analytics calls
- Time-window CTR breakdown (0–6h / 6–24h / 24–48h / 48h+)
- Predicted 30-day lift card
- Compact + appealing sidebar polish

### Phase 3 (next)

- **Channel-baseline normalisation** — surface CTR vs the channel's 28-day
  baseline on every variant card. Will require nightly precompute job.
- **Cross-test learning** — "thumbs with red boxed text outperformed by
  +1.4 pp on average across your last 6 tests."
- **Sequential testing (mSPRT)** — replace the simple z-test with the
  sequential probability ratio so we can stop tests early without inflating
  Type-I error. Lifts statistical rigor and shortens experiments.
- **Multi-armed bandit mode** — instead of round-robin rotation, allocate
  more time to better-performing variants automatically. Opt-in toggle on
  Ultimate.
- **Webhook on winner** — POST to a user-supplied URL (Zapier / n8n) when
  a winner is detected, so users can plug A/B Testing into their own
  workflow stack.
- **CSV export** + per-test PDF report for agencies reporting to clients.

### Phase 4 (vision)

- **Title generation pipeline** — call Gemini to generate 4 title variants
  from the current title, score them with the SEO scorer, auto-create an
  A/B test from the top 3. Charges separately for the generation step.
- **Thumbnail generation pipeline** — same idea, but with the thumbnail
  generator: take the existing thumbnail, generate 3 stylistic variations,
  auto-create the test.
- **Audience segmentation** — surface CTR per traffic source (Browse,
  Search, Suggested) so the winner is the variant that wins on the user's
  primary discovery surface, not just overall.
- **Multi-video tests** — share a winning thumbnail pattern across a series
  of videos (a "playbook").

---

## Appendix — files of interest

| File                                         | Purpose                                                         |
| -------------------------------------------- | --------------------------------------------------------------- |
| `app/api/routes/ab_tests.py`                 | HTTP layer, plan gate, helper for YT apply                      |
| `app/services/ab_test_service.py`            | Engine (create / activate / rotate / compute / lift / windowed) |
| `app/services/ab_test_worker.py`             | Recurring background task                                       |
| `app/services/youtube_analytics_service.py`  | Analytics v2 wrapper + TTL cache                                |
| `app/services/youtube_api.py`                | `update_video_metadata`, `set_video_thumbnail`                  |
| `app/models/ab_test.py`                      | SQLAlchemy models                                               |
| `app/schemas/ab_test.py`                     | Pydantic IO schemas                                             |
| `alembic/versions/add_ab_tests_tables.py`    | initial schema                                                  |
| `alembic/versions/ab_tests_multi_variant.py` | mode / rotation / auto-apply / is_active                        |
| `src/app/ABTesting.jsx` + `.css`             | Top-level page                                                  |
| `src/components/ABTestPanel.jsx` + `.css`    | Legacy in-modal entry point                                     |
| `src/api/abTests.js`                         | Frontend client                                                 |
| `src/queries/abTests/abTestsQueries.js`      | TanStack Query hooks                                            |
