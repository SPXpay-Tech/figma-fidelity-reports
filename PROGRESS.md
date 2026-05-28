# Progress Log

What's built, what's verified, what's next. Updated 2026-05-16.

## ✅ Phase 0–4 · Scaffolding, auth, i18n, smoke E2E

- Expo SDK 54 + TS strict + Expo Router 6 + NativeWind v4, brand palette
- EAS profiles: staging / production / preview, `APP_ENV` switch
- axios client with envelope unwrap, `X-Access-Token` injection, dev redaction,
  RSA helper, expo-secure-store wrapper, zustand auth store
- Auth endpoints + password / email-code login, register (matches web 1:1),
  forgot-password
- zh_CN + en bilingual with `expo-localization` auto-detect, locale persisted,
  `lang` header attached, `Updates.reloadAsync` on switch
- Maestro `e2e/smoke-login.yaml` and `e2e/register-and-login.yaml` green

## ✅ Phase 5 · Home + accounts list + card detail

- `(app)/` tab shell: Home / Accounts / Cards / Me
- Home dashboard: per-account-group USD totals (SPX / SGB / CONSUMER), FX
  rates strip, recent transactions feed, quick actions
- Accounts list filtered by `accountGroup`, account detail with transactions
- Cards tab: list + per-card actions
- `/card/[id]` detail screen with actions: activate, reset PIN, update limit,
  freeze/unfreeze
- `/card-pan` WebView surfaces uqpay-hosted iframe (60s countdown,
  expiry-guarded)

## ✅ Phase 6 · Compliance

- Compliance screen reads SPX status + Regtank state, shows next-step CTA
- Banner on Home when status pending; gated transitions for "Continue
  verification" / disabled while under review

## ✅ Phase 7–11 · Money movement & settings

- Deposit (fiat bank info + crypto cascading address picker)
- Withdrawal — full compliance field set added in Phase 17 (see below)
- Internal transfer (with fee preview + processing/instant copy added in
  Phase 17)
- Internal exchange with rate / fee preview, empty-state for no-pair edges
  (Phase 17)
- Settings (profile, change password, sign out, locale toggle)
- Card application flow (cardholder + bind to consumer account)

## ✅ Phase 12–14 · uqpay PAN reveal + Financial + Bank accounts

- WebView-hosted iframe for full PAN reveal with token expiry
- Financial entrypoint (since removed in Phase 16 — see below)
- Bank accounts CRUD; multi-currency selector added 2026-05-16

## ✅ Phase 15 · State-transition guards

- Force-change-password screen wired to first-login flow
- Set-pay-password screen + `OpenSafeDialog` second-factor on money ops
- KYC gating, compliance "disable while under review" semantics

## ✅ Phase 16 · UI polish + remove DK/Financial + real-API fixes

- DK group + Financial removed from front (out of MVP scope)
- Multiple field-name fixes verified against staging with real money
  (yixin51402 / yixin51504)
- Card mgmt 4-piece UI (activate / freeze / reset-pin / limit)
- FX block on Home; phone + agent on Profile

## ✅ Phase 17 · Web-parity polish (2026-05-16)

Driven by web↔mobile parity audit:

- [x] Withdraw: P1 — full compliance fields (selfChoice, beneficiary picker,
  incomeSources multi, paymentPurpose, others-* free text, paymentNotes).
  Shared `DictSelect` + `BankAccountSelect` components added.
- [x] Bank-accounts: currency selector (was hardcoded USD).
- [x] Transfer: live fee preview via `/calculateIntAccTransferFee`, two-tone
  success copy for TRANSFER_PROCESSING vs COMPLETED.
- [x] Exchange: explicit empty-state when no rate pairs or no target for
  picked source — was a silent dead-end before.

## 🟦 Next up

- Verify withdraw / transfer / exchange end-to-end on staging (yixin51504
  has balance + KYC + bank account)
- Compare card-application UX against web's `CardApplicationFlow`
- Card-detail: surface fee history, daily-limit progress (web shows them)
- Tighten error toasts (currently `Alert.alert` — consider Sonner-style)

## How to verify the current state

```bash
git clone git@github.com:SPXpay-Tech/spxpay-mobile.git
cd spxpay-mobile
pnpm install
pnpm typecheck                 # green
pnpm start --ios               # boots simulator
MAESTRO_CLI_NO_ANALYTICS=1 maestro test e2e/smoke-login.yaml
```

Open `docs/DEVELOPMENT.md` for env / API conventions, `docs/TESTING.md` for
E2E setup, `docs/GOTCHAS.md` when something blows up unexpectedly.
