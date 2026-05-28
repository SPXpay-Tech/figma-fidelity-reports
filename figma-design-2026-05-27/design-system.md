# SPXpay Mobile — New Design System (2026-05-27)

Source: Figma `eqhwFT0W55JotQkpxndDl9`
- Login section node `506:4836` (12 frames)
- Home section node `365:2388` (full home + filters + transaction list)

## Hero change
Primary brand color flipped from **violet `#601CFE`** to **warm gold/amber `#EABB62`**, with a **dark warm brown text** (`#3D3218`) that sits on top of the gold instead of white. Hero card is now a black→amber gradient (`#1C1306 → #5D3A0A`) rather than a flat purple. The full app reads as **gold-on-cream over white**, with HarmonyOS Sans TC as the CJK face and Plus Jakarta Sans reserved for Latin labels only (status bar time, "EN" language seg).

## Tokens (canonical)

### Colors
```ts
brand:       '#EABB62'  // gold/amber — primary CTA, active states, accents
brandFg:     '#3D3218'  // text on brand (warm dark brown, NOT white)
brandTint:   '#F3F1E8'  // soft amber tint — language toggle bg, dividers

heroStart:   '#1C1306'  // hero gradient origin (near-black warm)
heroEnd:     '#5D3A0A'  // hero gradient destination (deep amber-brown)
heroBody:    '#FFFFFF'  // hero amount text
heroLabel:   '#F3F1E8'  // hero secondary text (USD, total assets label)

textPrimary: '#24201A'  // page body, section titles, account name
textHeading: '#3D3218'  // page heading H1, amounts, back-page title
textMuted:   '#AAA286'  // placeholder, inactive, secondary labels (查看全部, 总余额)
textHelper:  '#8A8F98'  // helper/disclaimer body
textSubtle:  '#9499A2'  // transaction date subtitle (cool grey)

bgPage:      '#F9F9FA'  // app background
bgCard:      '#FFFFFF'  // input, card surfaces
bgSearch:    '#F6F6F4'  // search input bg
bgSurface:   '#F7F7FC'  // quick-action strip bg

borderDefault: 'rgba(170,162,134,0.20)'  // #AAA286 @ 20%
borderActive:  '#EABB62'                  // focus / selected
borderCheckbox:'#C9C9D0'

error:        '#F52F32'
errorTint:    'rgba(245,47,50,0.10)'
success:      '#00D17D'
successTint:  'rgba(0,209,125,0.10)'
warning:      '#F9AC1C'
```

### Typography (HarmonyOS Sans TC unless stated)
```
displayBig    24 / 700  – hero amount
heading       20 / 700  – screen H1 (欢迎回来, 创建账户)
pageTitle     16 / 700  – sub-page back-button title (交易明细)
sectionTitle  14 / 700  – 快捷功能, 近期交易
cardTitle     15 / 700  – account-type card title (个人, 企业)
button        16 / 700  – primary CTA label (Noto Sans SC OK as fallback)
bodyLg        14 / 500  – hero label, transaction row title
body          14 / 400  – input value, subtitle
amount        16 / 500  – account total amount
caption       12 / 700  – field label (邮箱, 密码), section subhead
captionRegular 12 / 400 – placeholder, view-all link
unit          12 / 500  – USD suffix, account name, tab label, quick-action label
date          12 / 400  – transaction date subtitle (color #9499A2)
helper        13 / 400  – Terms / "已有账户？" hints (Noto Sans SC)
link          13 / 500  – inline link text (Noto Sans SC)
status        15 / 700  – status-bar 9:41 (Plus Jakarta Sans)
en            12 / 600  – "EN" inactive seg (Plus Jakarta Sans)
```

### Radii
```
2   – left accent strip
6   – chip / icon-bubble / language pill
12  – inputs, buttons, cards, account row, filter pill, back button (CANONICAL)
16  – status pill (compliance verified)
20  – hero card (EXCEPTION)
999 – fully round (dots, avatars)
```

### Dimensions
```
inputHeight   54
buttonHeight  54
backButton    42 (radius 12, NOT 48)
chip          38 (account-type card icon chip)
checkbox      26 (radius 8)
appHeader     33 main row (status bar 54 above)
tabBar        65 (1 px top divider + 64 row, divider color #F3F1E8)
quickAction   48 circle (radius full)
heroCard      350 × 118
accountRow    350 × 87
screenPaddingX 20
labelToInput  6 (was 8)
fieldStride   90 (label 14 + 6 + input 54 + 16 gap)
```

## Login frames (12)
1. 密码登录 (email + password + captcha)
2. 邮箱登录 (email + OTP, 发送验证码 inline)
3. 忘记密码 (email + OTP + new password + confirm)
4. 密码登录 — focused state (input filled, focus border gold)
5. 重置密码 — final
6. 重置密码 — error state (red borders, ⚠ helper text under each)
7. 创建账户 — 个人 selected
8. 创建账户 — 企业 selected
9. 创建账户 — full filled
10. 创建账户 — country picker open
11. 创建账户 — multi-error
12. 弹窗 — 账户创建成功 (green check + CTA)

## Home composition
- Status bar (54 px)
- App header (33 px main row): SPX PAY wordmark left + 中/EN toggle right (gold pill)
- Hero card (350 × 118, radius 20, gradient + cream watermark + eye toggle on right)
- Account row stack: SPX 资金账户 / SGB 银行账户 / 消费账户 (350 × 87 each, radius 12, gold tinted icon chip)
- Quick actions strip (radius 12, bg #F7F7FC): 入金/出金/划转/兑换/管理 (5 actions, gold circle 48 px @ 20%)
- Section: 近期活动 (header with gold accent strip + 查看全部 link)
- Transaction rows (icon bubble 32 radius 6: green tint for income, lilac for outgoing — flag to redesign with brand neutral)
- Bottom nav (65 px, 4 tabs: 首页/账户/消费/我的, active gold)

## Renaming map (old → new)
```
#601CFE  → #EABB62  (primary)
#1C1A24  → #24201A  (text primary, slight warm shift)
#A49CB6  → #AAA286  (text muted, cool grey → warm taupe)
#E6E2F5  → rgba(170,162,134,0.20) (border)
#F2EBFF  → #F3F1E8  (brand tint surface)
text-white on primary → text-[#3D3218] on brand
HeroCard bg-primary → LinearGradient(#1C1306 → #5D3A0A) with cream watermark
```

## Outstanding design decisions
1. Outgoing transaction icon bubble uses `#884DFE` purple @ 10% — likely legacy. Replace with `#AAA286` @ 20% (neutral) until Charlie confirms otherwise.
2. Bottom tab bar currently doesn't exist; Figma shows 4 tabs (首页/账户/消费/我的). Need to add a tab navigator under `(app)/_layout.tsx`.
3. Font: HarmonyOS Sans TC for CJK is already loaded for web (global.css). For native iOS/Android need `expo-font` registration — may defer until brand fonts shipped, fall back to system in interim.
