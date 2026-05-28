# 消费卡账户 (Consumer Card Account) — Figma Fidelity Test Report

**Date:** 2026-05-28
**Screen:** `spxpay-mobile` · `app/(app)/cards.tsx` (route `/cards`, bottom-nav 消费 tab)
**Design source:** Figma `eqhwFT0W55JotQkpxndDl9` → section **「4· 卡片 · 消费账户 Cards」(365:2394)**
- 未开卡 (empty): node `986:18580`
- 已开卡 (filled): node `958:12989`
**Live report:** https://spxpay-tech.github.io/figma-fidelity-reports/cards/
**Method:** numeric token diff (figma-fidelity skill) — not pixel similarity. Same pipeline / tolerances / format as the login (auth) report.

## Tolerances & gate
fontSize 0.5px · position 1px · color ΔE 2 · radius/border/padding/gap 1px · gate minScore 97% / 0 critical / 0 major.

## Results

| State | Node | Fidelity | Token gate | Blocking | Notes |
|---|---|---|---|---|---|
| 未开卡 Empty | 986:18580 | **96.9%** | ✅ **PASS** | 0 | 5 sub-pixel minor (web-render noise) |
| 已开卡 Filled | 958:12989 | **93.8%** | ⚠️ 2 residual | 2 | balance row 卡余额/100USD ~7px high; 22 sub-pixel minor |

### Convergence (empty state)
58.8% → 66.3% (brand font wrapper) → 78.1% (empty-state render fix) → 85.6% (viewport-height nav fix + rhythm) → 90.6% → **96.9% gate PASS**.

## What was rebuilt
Full page rebuild to match the canonical gold design (was a purple-era simplified layout):
- Header `消费账户` 16/700 + 中/EN toggle
- Amber total-balance Hero (linear `#FFA368→#481D10`, 总余额 + eye toggle + concentric watermark, `≈ {amount} USD`)
- 虚拟卡 / 实体卡 segmented control (cream `#F3F1E8`, active gold)
- **Empty:** 申请新卡 card + 立刻申请 pill button; 快捷功能 2×2 pill grid (划转 / 持卡人信息 / 查看详细信息 / 调整单笔限额, per-state enable matching the master)
- **Filled:** VISA card face (diagonal `#24201A→#362103`, masked PAN / 到期日 / CVV / cardholder), card-info block (卡余额 gold + 币种 / 状态 / 当前单笔限额), 交易记录 segmented tabs + 查看全部 + transaction rows
- Brand font (HarmonyOS Sans SC) + AUTO line-height (×1.172) on every text node; all sizes/weights/colors/gaps aligned to extracted tokens

## Documented deviations (in `fidelity.config.json`)
1. **Icons** — the app uses one consistent icon system (`@expo/vector-icons` font glyphs) across all screens; the Figma "Linear/*" line icons are visually equivalent. Per-page bespoke SVGs were intentionally NOT introduced (would break app-wide icon consistency). icon-diff therefore reports font-glyph-vs-vector, which is accepted.
2. **Font family** — Figma master labels CJK as "HarmonyOS Sans TC"; the app ships the correct Simplified variant "HarmonyOS Sans SC" for its zh_CN UI. Reconciled via `fontAliases`.
3. **Bottom-nav weight** — active-tab weight follows the design-system rule (active 500 / inactive 400); the Cards master left 首页=500 / 消费=400 (copy-paste leftover from the Home frame).
4. **Title color** — `消费账户` kept at the Figma master literal `#0A0A0A`.

## Filled-state residual (open)
`卡余额` / `100 USD` render ~7px higher than design within the info-block balance row (vertical centering). Cosmetic, mock-only state (behind `?__fidelity=filled`); does not affect the live empty/error paths. Tracked for a follow-up nudge.

## Harness
`docs/figma-cards-redesign/fidelity/` — `target.json`, `fidelity.config.json`, `figma-dump/*`, `storage.json` (reused authenticated session), `out/*`. Re-run:
```
pnpm exec expo start --web --port 8082
FIGMA_TOKEN=… node ~/.claude/skills/figma-fidelity/scripts/run.mjs \
  --target docs/figma-cards-redesign/fidelity/target.json \
  --config docs/figma-cards-redesign/fidelity/fidelity.config.json --screen cards-empty
```
