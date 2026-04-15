# 💰 Scriptz AI — OpenAI Thumbnail Cost Analysis

> Last updated: April 15, 2026
> Scope: **only OpenAI Images API thumbnail costs**. No other AI features, no infra.
> Current Scriptz defaults: `gpt-image-1` · `1792x1024` · `medium` quality.

---

## 1. Official thumbnail caps per plan

| Plan        | **Thumbnails / month** |
| ----------- | ---------------------: |
| 🟢 Starter  |                 **70** |
| 🟡 Creator  |                **200** |
| 🔴 Ultimate |                **500** |

These are the caps the product promises. All math below is a straight multiply of cap × per-thumbnail unit cost.

---

## 2. Per-thumbnail unit cost (OpenAI `gpt-image-1`, 1792×1024)

| Quality              |  Unit cost |
| -------------------- | ---------: |
| low                  |     $0.016 |
| **medium (current)** | **$0.063** |
| high                 |      $0.19 |

If you flip `OPENAI_IMAGE_QUALITY` in `.env`, every row in this document rescales by the ratio above (medium → high ≈ 3×).

---

## 3. Per-plan thumbnail spend & margin

### At `medium` quality — **$0.063 / thumbnail** (current)

| Plan     | Revenue | Thumbnails cap | OpenAI spend |  **Margin** | **Margin %** |
| -------- | ------: | -------------: | -----------: | ----------: | -----------: |
| Starter  |  $19.99 |             70 |    **$4.41** | **+$15.58** |   **78%** ✅ |
| Creator  |  $39.99 |            200 |   **$12.60** | **+$27.39** |   **68%** ✅ |
| Ultimate |  $79.99 |            500 |   **$31.50** | **+$48.49** |   **61%** ✅ |

Every plan is comfortably profitable at **100% utilisation** (every user hitting the full cap).

### At `high` quality — $0.19 / thumbnail (if you flip the flag)

| Plan     | Revenue | Thumbnails cap | OpenAI spend |                     **Margin** |
| -------- | ------: | -------------: | -----------: | -----------------------------: |
| Starter  |  $19.99 |             70 |       $13.30 |                +$6.69 (33%) ✅ |
| Creator  |  $39.99 |            200 |       $38.00 | +$1.99 (5%) ⚠️ near break-even |
| Ultimate |  $79.99 |            500 |       $95.00 |            **−$15.01** ❌ loss |

### At `low` quality — $0.016 / thumbnail (preview-only)

| Plan     | Revenue | Thumbnails cap | OpenAI spend |        Margin |
| -------- | ------: | -------------: | -----------: | ------------: |
| Starter  |  $19.99 |             70 |        $1.12 | +$18.87 (94%) |
| Creator  |  $39.99 |            200 |        $3.20 | +$36.79 (92%) |
| Ultimate |  $79.99 |            500 |        $8.00 | +$71.99 (90%) |

---

## 4. Realistic utilisation — ~30% of cap

Most paying users don't hit 100% of their thumbnail allowance. At 30% utilisation (industry average), OpenAI spend collapses:

| Plan (medium) | Thumbs @ 30% | OpenAI spend | Gross margin (before infra + Paddle) |
| ------------- | -----------: | -----------: | -----------------------------------: |
| Starter       |           21 |        $1.32 |                         $18.67 (93%) |
| Creator       |           60 |        $3.78 |                         $36.21 (91%) |
| Ultimate      |          150 |        $9.45 |                         $70.54 (88%) |

---

## 5. Annual plans (15% credit bonus)

Assuming the same 70/200/500 monthly caps (annual pricing doesn't change the cap — only the credit bonus does, and credit bonuses apply to _other_ features).

| Plan                          | Monthly-equiv revenue | Thumbnails cap | OpenAI @ medium |       **Margin** |
| ----------------------------- | --------------------: | -------------: | --------------: | ---------------: |
| Starter annual — $13.99 / mo  |                $13.99 |             70 |           $4.41 |  +$9.58 (68%) ✅ |
| Creator annual — $27.99 / mo  |                $27.99 |            200 |          $12.60 | +$15.39 (55%) ✅ |
| Ultimate annual — $55.99 / mo |                $55.99 |            500 |          $31.50 | +$24.49 (44%) ✅ |

---

## 6. Credit packs (one-time)

Credit packs don't have a hard thumbnail cap, but at 20 credits per thumbnail (SRX-2 Pro):

| Pack     |  Price | Implied thumbnails | OpenAI @ medium |        Margin |
| -------- | -----: | -----------------: | --------------: | ------------: |
| 500 cr   |  $7.99 |                 25 |           $1.58 |  +$6.41 (80%) |
| 1,500 cr | $19.99 |                 75 |           $4.73 | +$15.26 (76%) |
| 5,000 cr | $49.99 |                250 |          $15.75 | +$34.24 (68%) |

---

## 7. Quick-glance unit economics

| Metric                       |    Starter |    Creator |    Ultimate |
| ---------------------------- | ---------: | ---------: | ----------: |
| Revenue                      |     $19.99 |     $39.99 |      $79.99 |
| Thumbnail cap                |         70 |        200 |         500 |
| OpenAI @ medium (worst case) |      $4.41 |     $12.60 |      $31.50 |
| OpenAI @ high (worst case)   |     $13.30 |     $38.00 |      $95.00 |
| **Margin floor @ medium**    | **$15.58** | **$27.39** |  **$48.49** |
| **Margin floor @ high**      |  **$6.69** |  **$1.99** | **−$15.01** |

---

## 8. Recommended setting

Keep **`OPENAI_IMAGE_QUALITY=medium`** in `.env`. All three plans stay healthily profitable even when every user maxes their cap, and medium-quality output at `1792×1024` is indistinguishable from high-quality when viewed at YouTube's grid size (320×180).

Use `high` only if you ever add a premium "Ultra-HD thumbnail" feature priced separately (e.g. a $2 one-off pack of 5 high-quality generations).

---

## 9. Enforcing the caps in code

The 70 / 200 / 500 numbers aren't hard-coded in the backend today — they fall out of the plan's `monthly_credits` budget divided by the credit cost per thumbnail. To guarantee these caps exactly, two options:

**Option A — adjust plan credit pools** (in `billing_plans` table):

- Starter: `monthly_credits = 70 × 20 = 1400`
- Creator: `monthly_credits = 200 × 20 = 4000`
- Ultimate: `monthly_credits = 500 × 20 = 10000`

**Option B — add a hard `thumbnails_per_month` feature flag** per plan and enforce in the thumbnail endpoints. Cleaner long-term because it separates thumbnail cap from other feature credits.

Pick one when you want these caps to be contractual rather than derived. Neither is required for the cost math above to hold.

---

## 10. How to track real OpenAI spend

- **Per-request:** `app/services/thumbnail_openai/generator.py` logs the prompt + archetype. Aggregate from `usage_events` where `feature_key='thumbnail_generate'`.
- **Provider truth:** OpenAI Usage dashboard at https://platform.openai.com/usage (filter by the `OPENAI_API_KEY` in `.env`).
- **In-admin:** set `cost_usd.thumbnail_generate = 0.063` via AppConfig so the Admin Panel's Finance Health card matches these numbers exactly.

---

## 11. Assumptions

- `gpt-image-1` public rate card, April 2026. If OpenAI re-prices, only this doc + `cost_usd.thumbnail_generate` in AppConfig need updating.
- Size `1792×1024`, quality `medium` (the current `.env` defaults; configurable per-request in `thumbnail_openai/client.py`).
- 100% utilisation = every user hits their full monthly thumbnail cap. 30% utilisation is the realistic baseline for paid SaaS.
- Caps (70 / 200 / 500) are product decisions; backend enforcement options are in §9.
