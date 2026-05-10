# Clixa — Project Backlog

Living document of what's left to do across the three repos:

- **Clixa-app** — user-facing React SPA at https://clixa.app
- **Clixa-Api** — FastAPI backend at https://d7kxty5tnk6a8.cloudfront.net (single EC2 lite-stack)
- **Clixa-Admin** — internal admin SPA

Last reviewed: 2026-05-10. Items are tagged `[P0]` (blocks usage / data integrity), `[P1]` (visible UX gap), `[P2]` (nice-to-have), `[INFRA]` (devops / CI), `[FUTURE]` (product extension).

---

## §1 — Known Incomplete Work (functional but documented gaps)

### `[P1]` Editor-mode failure persistence

**Where:** `src/app/ThumbnailGenerator.jsx` — the in-line region editor (face-swap / region-edit dialog) catch path.
**State:** Editor errors still go through `setEditFooterError` → toast only. They are NOT routed through `pushFailureEntry`, so they don't persist as a failure card in the chat thread the way prompt / titles / recreate / analyze failures do.
**Why deferred:** Replaying the editor flow from a failure card requires the original ROI (region-of-interest) selection + canvas state, which isn't currently captured in the failure entry. Adding this means storing the ROI bounds + base image url in `failure.options` and teaching the retry dispatcher how to reopen the editor pre-loaded.
**Impact:** Editor failures don't survive a navigate-away. Toast shows the error in the moment but the user has no card to retry from after refresh.

### `[P1]` Async-job (chat/submit) failure persistence

**Where:** `Clixa-Api/app/api/routes/thumbnails.py:1582-1750` (the `/chat/submit` async path).
**State:** When the async job fails, the failure is recorded in the `Job.error` / `Job.result_json` columns but **not** as a `thumbnail_messages` row. The frontend's poll handler surfaces it as a toast.
**Fix sketch:** When `JobContext` enters a terminal `failed` state for a `thumbnail_chat` job, also call the same `add_event(kind='failure', ...)` service path that the synchronous catch block uses. Wire it into `app/services/job_runner.py` near where `_publish_event(job_id, "job.failed")` fires.
**Impact:** Failures from the async submit pathway (long-running jobs) only live in `Job` rows, not in the chat history. Users on the async path don't see a persistent failure card.

### `[P2]` `localOnlyMessages` cleared on conversation switch

**Where:** `src/app/ThumbnailGenerator.jsx:2103-2110`
**State:** On conversation switch, `localOnlyMessages` is wiped. This is correct for already-persisted entries (the server pair takes over), but optimistic local entries still in flight (POST hasn't returned yet) get lost.
**Edge case:** Submit a generation → immediately switch conversations before the response lands → response data ends up appended to the OLD conversation server-side but the user is now in a different conversation. Visually: the submission "vanishes."
**Mitigation idea:** Keep a small "in-flight" map keyed by submission id + target conversation. If the user is still on that conversation when the response lands, commit. Otherwise just rely on the conversation refetch when they navigate back.

---

## §2 — Infrastructure / DevOps `[INFRA]`

### `[P0]` Frontend GitHub Actions auto-deploy disabled

**Where:** `Clixa-app/.github/workflows/deploy-main.yml`
**State:** `push: branches: [main]` is commented out (was spamming failure emails because `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets aren't set). Manual `workflow_dispatch` still works.
**To re-enable auto-deploy:**

1. Open https://github.com/ItsAbdujabbor/Scriptz-app/settings/secrets/actions
2. Add two repo secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the dedicated `gh-actions-deploy` IAM user (deploy-only perms; see commit `73de597`). Generate a fresh pair with `aws iam create-access-key --user-name gh-actions-deploy` and delete the old one afterwards — the keys originally embedded in this doc were redacted after GitHub secret-scanning flagged them.
3. Uncomment the `push:` block in the workflow file
   **Impact:** Until done, every push to `main` requires manual deploy via `aws s3 cp + sync + cloudfront create-invalidation`.

### `[P0]` Backend GitHub Actions workflow points at non-existent infra

**Where:** `Clixa-Api/.github/workflows/deploy.yml`
**State:** References `ECR_REPOSITORY: scriptz-api`, `ECS_CLUSTER: scriptz-cluster`, OIDC role `AWS_DEPLOY_ROLE_ARN` — none of which exist in the AWS account (`195874016451`). Real prod runs on a single EC2 (`32.193.111.220`) via `infra/lite/scripts/deploy.sh`.
**Fix:** Either delete the workflow entirely (since lite-stack is the documented path) or rewrite it to call `deploy.sh` over SSH using the same `clixa-deploy.pem` key. Both are clean options; deletion is simpler.
**Impact:** Backend deploys are manual via `bash scripts/deploy.sh` only.

### `[P1]` Backend repo has 173 uncommitted files

**Where:** `Clixa-Api/` working tree
**State:** A long history of edits (channel deletion, dashboard removal, etc.) was never committed. The Docker build copies the working tree, so the deployed image contains those changes — but git `main` doesn't.
**Risk:** Disaster recovery from git would lose those edits. Anyone cloning the repo gets a non-working state.
**Fix:** Audit + commit the pile in logical chunks, OR snapshot it as a single "WIP working state" commit and start fresh.

### `[P1]` Same issue in Clixa-Admin

173 uncommitted files. Same audit + commit recommendation.

### `[P2]` Backend deploy script bakes "-dirty" suffix into image tag

**Where:** `Clixa-Api/scripts/deploy.sh:44-49`
**State:** When the working tree is dirty, the image tag becomes `${sha}-dirty`. Not a bug — it's a feature that signals untrustworthy builds — but combined with the previous item it means EVERY deploy currently produces a dirty tag.
**Fix:** Falls out naturally from cleaning up the uncommitted-files situation.

---

## §3 — Backend Gaps `[BACKEND]`

### `[P1]` Reset password email never sent

**Where:** `Clixa-Api/app/api/routes/auth.py:276` — `# TODO: Send email with reset token`
**State:** The forgot-password endpoint generates a reset token and stores it but never emails it to the user. The user has no way to receive the link.
**Fix:** Wire up Brevo (already configured for waitlist) or AWS SES. Email should include the reset link with the token.

### `[P1]` Backend has no SSE for non-prompt jobs

**Where:** `Clixa-Api/app/services/job_runner.py` — `_publish_event` / `_publish_progress`
**State:** Only `thumbnail_chat` jobs publish progress over SSE. Recreate / analyze / titles / edit are synchronous and don't have a job loop, so no progress signal — the loader on the UI uses a fake decay curve.
**Fix:** Either (a) move those flows to the async job runner so they get the same SSE pipeline, or (b) accept that non-chat is synchronous and skip the progress bar for those modes.

### `[P2]` No automated tests for chat persistence path

**State:** The `commitServerChatPair` + cache-hydration flow is critical path for "messages survive a reload" but has no test. A regression here would be silent until a user reports it.
**Fix:** Add a backend integration test that POSTs to `/chat`, then GETs `/conversations/{id}` and asserts the new pair is in the response.

---

## §4 — Frontend Gaps `[FRONTEND]`

### `[P1]` Edit-mode retry not wired in `handleRetryFailedAttempt`

**Where:** `src/app/ThumbnailGenerator.jsx:2455-2475` — the dispatch switch
**State:** Cases for `'titles'`, `'recreate'`, `'analyze'`, and the default `'prompt'` are all wired. There's no `'edit'` case because editor failures don't push a failure entry (see §1).
**Fix:** Together with §1's editor-failure persistence, add an `'edit'` branch that re-opens the EditThumbnailDialog pre-loaded with the stored ROI + base image.

### `[P2]` `FailedGenerationCard` is 16:9 for every mode

**Where:** `src/components/FailedGenerationCard.css:18-42`
**State:** The card is 16:9 to match the success thumbnail card. For title-mode failures (where the success would be a vertical stack of title-card rows, NOT a 16:9 image), a 16:9 error card looks oversized and out of proportion with what was being attempted.
**Fix:** Conditional sizing per `entry.mode` — keep 16:9 for `prompt` / `recreate` / `analyze`; use a more compact card for `titles`.

### `[P2]` Multi-tab same-conversation conflict

**State:** Two browser tabs open on the same conversation. Tab A submits a message. Tab B never sees it (no broadcast channel). Tab B refreshes → sees it.
**Fix:** Wire React Query into a `BroadcastChannel` listener so `setQueryData` in one tab updates the cache in others.

### `[P2]` Empty-state visuals are minimal

**Where:** `src/app/ThumbnailGenerator.jsx` — the `coach-chat-shell--thumb-empty` state
**State:** Empty thumbnail screen shows a kicker + h1 + composer. No example prompts, no sample thumbnails, no "what can I do here" affordances.
**Fix:** Add 4-6 example prompt chips users can click to pre-fill the composer.

### `[P2]` No loading skeleton for sidebar conversation list on first load

**Where:** `src/app/Sidebar.jsx` — history loading state
**State:** `isHistoryLoading` shows the skeleton, but if the API is slow the user sees a blank list for ~300ms before skeleton appears.
**Fix:** Render skeleton immediately; replace when data lands.

---

## §5 — UX Polish `[POLISH]`

### `[P2]` Mobile composer doesn't shrink when keyboard appears

**Where:** Mobile thumbnail screen, composer footer
**State:** When the soft keyboard opens, the composer stays the same size — pushed up but not adjusted for the reduced viewport.
**Fix:** Listen for the visual viewport API and reduce composer padding when keyboard is up.

### `[P2]` Conversation right-click / long-press menu is sparse

**Where:** `src/app/Sidebar.jsx:687-690` (`historyMenu` state)
**State:** Rename + delete supported. Could add: pin, duplicate, archive, export.
**Fix:** Iterate on the menu, requires backend endpoints for new actions.

### `[P2]` No "scroll to bottom" affordance when the user is far up in a long thread

**State:** Once a user scrolls up to read history, there's no jump-to-latest button. They have to scroll all the way back manually.
**Fix:** Floating "↓ N new messages" pill in the bottom-right of the thread when `scrollTop < scrollHeight - viewport - 200`.

### `[P3]` Toast auto-dismiss timing

**State:** All toasts auto-dismiss after a fixed duration. Action-bearing toasts (with a Retry button) should stay until dismissed.
**Fix:** When `toast.action` is set, skip the auto-dismiss timer.

---

## §6 — Testing & Observability `[QA]`

### `[P1]` No E2E test for OAuth round-trip

**State:** Critical path; one mistake silently breaks sign-in. We've already had bugs here (CORS, redirect_uri, intent persistence).
**Fix:** Playwright test that walks through the full happy-path Google sign-in via a test account.

### `[P1]` No automated test for failure persistence

**State:** Just shipped (commit `bfe4055`); regressions would be silent.
**Fix:** Frontend integration test (Vitest + MSW) that mocks a 500 from `/chat`, asserts the failure card appears, mocks the `/events` POST returning a server pair, asserts the local entry is dropped + cache is hydrated.

### `[P2]` No client-side error reporting (Sentry / similar)

**State:** Errors caught by `friendlyMessage` are surfaced to the user but not reported to a monitoring service.
**Fix:** Add Sentry. Hook into the toast bus + `console.error`.

### `[P2]` Backend has logging but no aggregate dashboards

**Where:** `Clixa-Api/app/services/analytics_logger.py` writes events, but there's no Grafana / DataDog dashboard reading them.
**Fix:** Set up CloudWatch dashboards (cheap; data already flows through CloudWatch Logs).

---

## §7 — Auth / Account `[AUTH]`

### `[P1]` Email/password sign-up doesn't exist (only Google OAuth)

**State:** The OAuth dialog only offers Google + a "Coming soon" Apple button. No email/password fallback.
**Fix:** Either ship Apple OAuth (medium effort) or add email/password sign-up (more effort, needs verification email pipeline + password reset).

### `[P2]` No "delete account" flow

**State:** Users have no UI to delete their own account. Manual DB intervention required.
**Fix:** Add Settings → Danger Zone → Delete account button. Backend already has the cascade logic in some routes; needs a unified endpoint.

---

## §8 — Pricing / Billing `[BILLING]`

### `[P1]` Annual savings text on Pro screen is hardcoded "Save 30%"

**Where:** `src/app/ProPricingContent.jsx`
**State:** The savings percentage is computed differently per plan (creator monthly $39.99 → annual $27.99 = 30%, but other tiers might differ). The "Save 30%" line is hardcoded.
**Fix:** Compute per active plan or remove the percentage.

### `[P2]` Trial countdown not surfaced

**State:** During the 7-day trial, the user has no visible "X days left in trial" indicator.
**Fix:** Add to the sidebar account panel or the Pro screen `TrialActiveStrip`.

---

## §9 — Future Features `[FUTURE]`

These aren't gaps — they're expansion options the user has hinted at or that obviously fit the product.

- Multi-channel support beyond the current single-channel layout (some scaffolding exists in `Clixa-Admin/src/api/channels.js` but UI is shallow).
- Bulk thumbnail export (download all generated thumbnails as a ZIP).
- A/B test mode (the backend has `ab_tests` route stubs that were deleted in a refactor — could be restored).
- Public share links for individual thumbnails.
- Team workspaces (multiple users on one channel).
- Webhook callbacks for completed generations (for Zapier-style integrations).

---

## §10 — Documentation `[DOCS]`

### `[P2]` `CLAUDE.md` files are well-maintained but no end-user docs

**State:** The repos have excellent CLAUDE.md / README files for engineers. There's no user-facing documentation site (how-tos, video walkthroughs, FAQ beyond what's on the landing page).
**Fix:** A `docs.clixa.app` subdomain with Markdown-driven docs (e.g. via Vitepress or Docusaurus), or just an in-app `?` modal with quick tips.

### `[P3]` API docs (FastAPI auto-docs) are accessible but unstyled

**State:** `/docs` and `/redoc` work but aren't branded. If we ever want third-party API users they'll need a polished spec page.
**Fix:** Customize the FastAPI OpenAPI title, description, version + serve a branded docs page.

---

## Recently Completed (last 2 weeks — for reference)

These were the major shippable items that landed before this backlog snapshot:

- ✅ **Failure persistence to backend** — every failure now has a server id and lives in `thumbnail_messages` with `extra_data.kind === 'failure'`. Survives reload.
- ✅ **Mode tab active state** — specificity collision fixed, violet gradient body shows on the active chip across viewports.
- ✅ **Failure card UX** — Dismiss button removed, single Try-Again centered inside the same gradient card body, 16:9 to match success card.
- ✅ **Last thumbnail centers in viewport** — bottom padding now `calc(--coach-composer-stack-px + 38vh)`.
- ✅ **Toast hairline border** — 4px coloured left edge dropped.
- ✅ **Chat cache hydration** — `commitServerChatPair` + `persistEvent` now write to React Query cache so navigate-back doesn't briefly serve stale data.
- ✅ **Auth dialog mode lock** — once you start signing up, you stay on signup; OAuth callback re-opens the same dialog with an in-dialog loading overlay; welcome splash before routing to thumbnails.
- ✅ **Slim landing header** — 64→52px base, 46px on scroll, smooth contraction.
- ✅ **Pro screen** — inline FAQ, violet current-plan badge, billing-cycle tabs selected state, Skip Trial CTA inline.
- ✅ **Mobile UX** — top tab strip compact, attach pills stay 36px circles with overlay X badge, sidebar account panel smooth.
- ✅ **Backend SSE progress** — `JobContext.set_progress` publishes through the notification bus so `ThumbnailGenFill` reflects real backend progress.
- ✅ **Dev OAuth fix** — Vite pinned to port 5173, dev-mode hint when redirect_uri_mismatch fires, prod backend CORS now allows localhost:5173.
- ✅ **Max-tier lock removal** — both Pro and Max are unlocked for everyone; backend `PLAN_TIER_GRANT[None] = 'SRX-3'`.

---

_This backlog reflects what I (Claude) can see across the three repos as of 2026-05-10.
Items marked `[P0]` would block normal usage if not addressed; `[P1]` items are visible UX
gaps users will notice; `[P2]` items are nice-to-haves; `[P3]` items are pure polish.
Re-prioritize based on actual user feedback and business priorities._
