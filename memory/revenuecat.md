# RevenueCat — integrated (2026-05)

## Identifiers (from /setup response)
- rc_project_id: proj93f78c96
- apple_app_id: app0bde2aecfa
- play_app_id: appd1528a3a2c
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages:
  - $rc_monthly -> prodf8cdb8e2a3   ($5.00 / P1M, trial: none)   # recreated to apply $5 price
  - $rc_annual  -> prod499e14ff1b   ($79.99 / P1Y, trial: none) [not used by app but provisioned]
- Dashboard: https://app.revenuecat.com/projects/proj93f78c96

## Status check
curl -sS -H "Authorization: Bearer sk-emergent-d1870BbC12273Fe879" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/1d06066f-2d9c-477f-b7c4-1d505ce29157/status"

## Later product updates
- Upsert price:
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/1d06066f-2d9c-477f-b7c4-1d505ce29157/products
  body: {"products":[{"package":"$rc_monthly","price":5.00,"currency":"USD","period":"P1M","prices":[{"amount_micros":5000000,"currency":"USD"}]}]}
- Remove: DELETE .../products/%24rc_monthly

## Store-side prerequisites (user manual — required for real purchases)
See payments panel FAQ.

## Server-side purchase verification (lifetime tiers — custom_program & backer)
The $200 Custom Program (`custom_program`) and $25 Founder Backer (`backer`) grant
PERSISTENT server-side privileges, so the backend must NOT trust the client's word.
Verification is done via a RevenueCat **webhook**:
- Endpoint: `POST /api/revenuecat/webhook` (server.py). Authenticated by a shared secret
  stored in backend/.env as `REVENUECAT_WEBHOOK_AUTH` (value lives only in .env).
- The webhook is the ONLY writer of the `verified_purchases` collection + the paid flags
  (`custom_program_purchased`/`athletes_center_access`, `founder_backer`). Idempotent via
  `rc_webhook_events` (unique event id). REFUND events revoke.
- `POST /api/custom-program/unlock` and `POST /api/founders/back` are fail-closed: they
  return 402 unless a matching verified_purchases row exists (frontend retries for webhook lag).
- USER MANUAL STEP (post-deploy): RevenueCat Dashboard → Integrations → Webhooks → add a
  webhook. URL = `https://<deployed-domain>/api/revenuecat/webhook`, Authorization header =
  the REVENUECAT_WEBHOOK_AUTH value. Without this, real purchases won't auto-grant server access.
