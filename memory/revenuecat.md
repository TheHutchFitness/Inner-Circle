# RevenueCat — integrated (2026-05)

## Identifiers (from /setup response)
- rc_project_id: proj93f78c96
- apple_app_id: app0bde2aecfa
- play_app_id: appd1528a3a2c
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages:
  - $rc_monthly -> prod9f03d1e92b   ($5.00 / P1M, trial: none)
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
