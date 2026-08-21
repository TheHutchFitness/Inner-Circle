# RevenueCat — integrated (2026-08)
Memory for interacting with the user's RevenueCat account via the integration proxy.

## Identifiers (from /setup + /products)
- rc_project_id: proj93f78c96
- apple_app_id: app0bde2aecfa
- play_app_id: appd1528a3a2c
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prodf8cdb8e2a3  ($9.00 / P1M, trial: none)
  - $rc_annual  -> prod850a4129b3  ($90.00 / P1Y, trial: none)
- Other entitlement products attached to `pro`: prod39636707d8, prode71547556a, prodd6b8de7a14, prod7d5d260969
- Dashboard: https://app.revenuecat.com/projects/proj93f78c96

## Extra entitlements used by app (client-gated + server webhook verified)
- custom_program ($200 one-time), backer ($25). These use the app's own server-side webhook
  verification, not the `pro` subscription entitlement.

## Updates (integration proxy ONLY — NEVER call RevenueCat REST API directly)
AUTH header: `Authorization: Bearer <emergent key>` (pre-substituted by platform; not stored here).
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/1d06066f-2d9c-477f-b7c4-1d505ce29157/products
  body: {"products":[{"package":"$rc_monthly","price":9.00,"currency":"USD","period":"P1M","prices":[{"amount_micros":9000000,"currency":"USD"}]}]}
- Remove a package:
  DELETE .../products/%24rc_monthly
- Status:
  GET  .../status
- Recover keys / repopulate .env: re-run the idempotent /setup call.

## History
- 2026-08-21: updated $rc_monthly $5->$9 and $rc_annual $39.99->$90 via /products (per user request).
