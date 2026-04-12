# 💰 Scriptz AI — Credit-Based Pricing System

> Last updated: April 12, 2026

---

## 🎫 Credit Costs Per Feature

| Action                       | Credits |
| ---------------------------- | ------- |
| 🎨 Generate thumbnail        | **20**  |
| 🔄 Recreate thumbnail        | **20**  |
| ✏️ Edit & FaceSwap           | **20**  |
| 🖼️ SEO thumbnails (optimize) | **20**  |
| 🧪 A/B test thumbnails       | **5**   |
| 🔍 Analyze thumbnail         | **3**   |
| 🤖 AI Coach message          | **2**   |
| 💭 Deep-thinking message     | **3**   |
| ✍️ Generate 3 titles         | **2**   |
| 🏷️ Score a title             | **2**   |
| 📝 SEO description rewrite   | **3**   |
| 🏷️ Generate tags             | **1**   |

---

## 💳 Plans

### 🟢 Starter — $19.99/mo (fixed)

**1,700 credits / month** — up to **85 thumbnails**

| Usage option              | Max qty |
| ------------------------- | ------- |
| 🎨 Thumbnails only        | **85**  |
| 🤖 AI Coach messages only | 850     |
| ✍️ Title generations only | 850     |
| 🏷️ Tags only              | 1,700   |

- 2 YouTube channels
- Annual: $13.99/mo ($167.88/yr)

---

### 🟡 Creator — $39.99+/mo (slider)

**Up to 180 thumbnails**

| Credits | Thumbnails | Price/mo | Annual |
| ------- | ---------- | -------- | ------ |
| 3,600   | **180**    | $39.99   | $27.99 |
| 5,000   | 250        | $49.99   | $34.99 |
| 6,000   | 300        | $59.99   | $41.99 |

- 4 YouTube channels
- Personas & Styles
- A/B Testing

---

### 🔴 Ultimate — $79.99+/mo (slider)

**Up to 450 thumbnails**

| Credits | Thumbnails | Price/mo | Annual |
| ------- | ---------- | -------- | ------ |
| 9,000   | **450**    | $79.99   | $55.99 |
| 12,000  | 600        | $99.99   | $69.99 |
| 15,000  | 750        | $119.99  | $83.99 |
| 18,000  | 900        | $139.99  | $97.99 |

- 10 YouTube channels
- Unlimited Personas & Styles
- Priority Support
- A/B Testing + Advanced Analytics

---

## 🏗️ Infrastructure (Fixed)

| Service       | Cost/mo |
| ------------- | ------- |
| ECS Fargate   | $15     |
| ALB           | $16     |
| S3+CloudFront | $1.50   |
| ECR+Route53   | $1.50   |
| Supabase      | $0      |
| **Total**     | **$34** |

---

## 💸 Real AI Costs Per Credit

| Action       | AI cost | Credits | $/credit |
| ------------ | ------- | ------- | -------- |
| Thumbnail    | $0.035  | 20      | $0.00175 |
| AI message   | $0.002  | 2       | $0.001   |
| Optimization | $0.003  | 3       | $0.001   |
| Tag gen      | $0.001  | 1       | $0.001   |

**Avg cost: $0.0014/credit** (thumbnails are most expensive)

---

## 📊 Margins

| Plan              | Revenue | Max AI cost | Infra share | **Margin**        |
| ----------------- | ------- | ----------- | ----------- | ----------------- |
| Starter 1,700cr   | $19.99  | $2.38       | $1.70       | **$15.91 (80%)**  |
| Creator 3,600cr   | $39.99  | $5.04       | $1.70       | **$33.25 (83%)**  |
| Creator 6,000cr   | $59.99  | $8.40       | $1.70       | **$49.89 (83%)**  |
| Ultimate 9,000cr  | $79.99  | $12.60      | $1.70       | **$65.69 (82%)**  |
| Ultimate 18,000cr | $139.99 | $25.20      | $1.70       | **$113.09 (81%)** |

---

## 📈 Revenue Projections

### 50 users (early stage)

| Mix                                           | Revenue | AI   | Infra | **Profit** |
| --------------------------------------------- | ------- | ---- | ----- | ---------- |
| 25 Starter + 20 Creator(4K) + 5 Ultimate(10K) | $1,699  | $168 | $34   | **$1,497** |

### 200 users

| Mix                               | Revenue | AI     | Infra | **Profit** |
| --------------------------------- | ------- | ------ | ----- | ---------- |
| 100S + 80C(avg 5K) + 20U(avg 12K) | $7,598  | $1,036 | $50   | **$6,512** |

### 1,000 users

| Mix                                 | Revenue | AI     | Infra | **Profit**  |
| ----------------------------------- | ------- | ------ | ----- | ----------- |
| 500S + 400C(avg 5K) + 100U(avg 12K) | $37,990 | $5,180 | $120  | **$32,690** |

---

## ✅ Summary

| Plan        | Credits | Thumbs  | Price          | Channels | Margin |
| ----------- | ------- | ------- | -------------- | -------- | ------ |
| 🟢 Starter  | 1,700   | 85      | $19.99         | 2        | 80%    |
| 🟡 Creator  | 3.6K–6K | 180–300 | $39.99–$59.99  | 4        | 83%    |
| 🔴 Ultimate | 9K–18K  | 450–900 | $79.99–$139.99 | 10       | 81%    |

### Key design principles:

- 🎯 **Thumbnails drive pricing** — they're 60% of AI cost
- 🎚️ **Slider lets users pick** — pay more for more credits
- 🛡️ **80%+ margins protected** across all tiers
- 💡 **Clear value** — "85 thumbnails" is easier to sell than "1,700 credits"
