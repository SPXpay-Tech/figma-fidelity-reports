# Testing Guide

Three layers:

1. **Unit / integration** — `pnpm test` (jest-expo + RNTL + MSW). Fast, no
   simulator needed. Tests live in `__tests__/`.
2. **E2E** — `pnpm e2e e2e/<flow>.yaml` (Maestro). Drives the running iOS
   simulator end-to-end.
3. **CI** — `.github/workflows/e2e.yml` runs both on `pull_request` against
   `main`, on `macos-14` runners, with an EAS `development-sim` build (not
   Expo Go).

This file covers all three. The original Maestro-focused write-up is at the
bottom and remains accurate for hands-on simulator work.

## Unit / integration tests

Stack: `jest-expo` preset + `@testing-library/react-native` + `msw` for
network mocks. Config: `jest.config.js`, setup file: `jest.setup.js`.

```bash
pnpm test                # one-shot
pnpm test:watch          # watch mode
pnpm test:coverage       # with coverage
```

Where to put what:

- `__tests__/lib/**/*.test.ts` — pure logic (e.g. `toNumber`,
  `extractCookieValue`, `generateUUID`)
- `__tests__/components/**/*.test.tsx` — RNTL component tests
  (`render(<Button .../>)` etc.)
- `__tests__/mocks/handlers.ts` — shared MSW handlers; per-test cases use
  `server.use(...)`

Mocked native modules in `jest.setup.js`: `expo-secure-store`,
`expo-localization`, `react-native-mmkv`, `react-native-reanimated`,
`expo-updates`. Add to this list when you import a new native module from
test files.

## E2E (Maestro)

Two entry points:

```bash
# direct CLI
MAESTRO_CLI_NO_ANALYTICS=1 maestro test e2e/smoke-login.yaml

# wrapper that archives screenshots into docs/mobile-e2e-<date>/<flow>/
# (the `spxpay-mobile-e2e` Claude skill)
bash ~/.claude/skills/spxpay-mobile-e2e/scripts/run-flow.sh smoke-login

# everything in sequence
bash ~/.claude/skills/spxpay-mobile-e2e/scripts/run-all.sh
```

### Maestro MCP (Claude Code direct drive)

`.mcp.json` at the repo root registers two mobile MCP servers so any
Claude Code session opened in this directory can drive the simulator
directly:

- `maestro` — official `maestro mcp` (built into the CLI since v2.5).
  Tools: list/run flow, screenshot, read accessibility tree.
- `mobile-mcp` — `@mobilenext/mobile-mcp`. AI-vision driven simulator
  control, useful for one-shot bug reproductions without writing YAML.

When you start a session in `spxpay-mobile/`, Claude will pick up these
servers automatically. Phrases like "run smoke-login" or "tap the cards
tab and screenshot" route to the right MCP.

## UI/UX fidelity (figma-fidelity)

A 4th, design-facing layer: verify the **coded UI matches Figma numerically**
(tokens) **and behaves right** (interactions/motion). Driven by the user-level
`figma-fidelity` skill (`~/.claude/skills/figma-fidelity/`). It compares numbers,
not pixels — see that skill's `METHODOLOGY.md`.

Two checks per screen:

- **Static token diff** — Figma node tokens (geometry / type / color / radius /
  padding) vs the running page's `getComputedStyle`. Needs a `FIGMA_TOKEN`.
- **Behavioral / motion (Principle 7)** — drives the real interactions
  (focus / type / hover / press / reveal) on the running **web** build and checks
  each state is *reachable*, lands on the right Figma variant tokens, and
  *eases* (not snaps): computed `transition-duration`/`-timing-function` vs the
  `motion` tokens in `src/lib/ui/tokens.ts`. **No Figma token needed** — it only
  drives the live page.
- **Error feedback / validation (Principle 7, error states)** — types an invalid
  or mismatching value (`error` / `mismatch` / `required` states, with cross-field
  `precondition` steps for 两次密码不一致) and asserts the error surfaces in the
  designed **channel**: an **inline** field error (red border + ⚠ helper text =
  Figma 错误 variant), not a dialog, not silence. The behavioral table's
  **Feedback** column shows `inline ✓` / `dialog` / `silent ✗` per state. Caught a
  real gap: login/forgot routed field validation through `Alert.alert` → a dialog
  (and RN-web's `Alert.alert` is a no-op unless shimmed), so the Figma inline error
  never rendered; both now show inline errors (register's established pattern).

Config lives in `docs/figma-auth-redesign/fidelity/` (`target.json` +
`login.ux.targets.json`). Run against a live Expo **web** build:

```bash
# 1. boot the web build (HMR; note the port)
pnpm exec expo start --web --port 8082

# 2. behavioral/motion only (no Figma token) — login screen
cd ~/.claude/skills/figma-fidelity/scripts
node ux-probe.mjs --url http://localhost:8082/login --width 390 --root body \
  --targets <repo>/docs/figma-auth-redesign/fidelity/login.ux.targets.json --out /tmp/ux.impl.json \
  --wait "[data-testid='btn-login-submit']"
node ux-diff.mjs --ux /tmp/ux.impl.json \
  --targets <repo>/docs/figma-auth-redesign/fidelity/login.ux.targets.json \
  --config ../references/fidelity.config.example.json --out /tmp/ux.findings.json

# 3. full run (static + behavioral) once FIGMA_TOKEN is set
FIGMA_TOKEN=figd_xxx node run.mjs --target <repo>/docs/figma-auth-redesign/fidelity/target.json \
  --config references/fidelity.config.example.json
```

**Gate:** 0 critical + 0 major. `motion-minor` = polish (chase for 100%, doesn't
block); `info` notes = states needing a stub harness (loading / countdown).

**Published report:** https://spxpay-tech.github.io/figma-fidelity-reports/
(side-by-side Figma vs live render + per-element token table + behavioral matrix,
regenerate + republish via `scripts/publish-ghpages.mjs`).

**Auth screens status (2026-05-28) — all 3 gate PASS (static + behavioral):**

| screen | static gate | ux gate | note |
|---|---|---|---|
| login | ✅ 0 blocking (94.9%) | ✅ PASS | — |
| register | ✅ 0 blocking (84.8%) | ✅ PASS | fields→terms gap +6px (`mt-[10px]`) closed the bottom-cluster drift |
| forgot-password | ✅ 0 blocking (86.7%) | ✅ PASS | — |

Every field + segmented tab ease on focus/fill (150ms ease-out, `webTransition()`
motion token); password/confirm eye reveal flips `password→text` (testIDs
`input-{password,confirm}-eye`). The residual % is sub-pixel render-floor noise
(never reaches 100). **Documented non-defects** (in `fidelity.config.json`):
the iOS status-bar mock (`9:41` + battery) is `ignoreText` (device chrome, not
app UI); the phone field's `区号` label is a `deviation` (impl shows the live
`+86 ▾` dial code instead — functional equivalent). **Field error states**
(格式错误 / 两次密码不一致 / 必填) are now driven **live** by the probe — typing a
bad value and asserting the inline error variant renders — so they no longer need
a static states-harness. Only stub-only states (button `loading`, `disabled`,
OTP `countdown-end`, server-only errors) remain harness/`needs-harness` rows.

> Native note: `webTransition()` emits CSS `transition*` only on web (react-native-web,
> same as the existing `boxShadow` usage); native is a no-op. Real native motion would
> use reanimated — add it there when native motion fidelity is in scope.

## CI

`.github/workflows/e2e.yml`:

- **`unit` job** (ubuntu-latest, ~2 min): `pnpm typecheck` + `pnpm test`.
- **`maestro-ios` job** (macos-14, ~12 min): boots iPhone 15 simulator,
  EAS local build with the `development-sim` profile, installs the `.app`,
  runs `maestro test e2e/<flow>.yaml`. Uploads `~/.maestro/tests/**` as a
  GitHub artifact on failure.

Triggers: `workflow_dispatch` (manual, pick a flow) and `pull_request`
against `main` when `app/`, `src/`, `e2e/`, `package.json`, or the workflow
file changes.

### Why EAS development-sim, not Expo Go

Expo Go is fine for local hand-driven work but doesn't run native modules
you add via `expo install <native-pkg>` once you go beyond what Expo Go
ships. CI needs the real binary. `eas.json` has the `development-sim`
profile (iOS simulator, APK for Android), built locally on the runner so
it doesn't consume EAS cloud minutes.

---

# Maestro — manual reference (original)

How to drive the running app from a script. The short answer is **Maestro**.

## Tools that didn't work, and why

These are documented so the next person doesn't burn a day on them again.

| Tool | Result | Reason |
|---|---|---|
| `xcrun simctl io booted tap` | not a real subcommand | `simctl io` only does `recordVideo` / `screenshot` / `enumerate`; no tap API exists |
| `cliclick c:x,y` | mouse cursor moves, click is dropped | iOS 26 Simulator filters synthetic mouse events |
| `osascript "click at {x,y}"` | same as cliclick — no click delivered | same iOS 26 filter |
| `idb` / `idb_companion` | not installed | works in theory; needs separate install + companion binary |
| iOS Simulator menu hotkeys | only useful for app-wide actions | no per-element targeting |

## Maestro — the one that works

**Install:**

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
```

It uses CoreSimulator native APIs (via an XCTest runner it installs into the
simulator on first run), so taps and text input go through the same path real
user interaction does.

**Run a flow:**

```bash
MAESTRO_CLI_NO_ANALYTICS=1 maestro test e2e/smoke-login.yaml
```

Two flows are already checked in:

- `e2e/smoke-login.yaml` — 26-step login walk: lang toggle (中↔EN), tab switch,
  captcha + send-code API call, back to password tab. Green end-to-end on
  iPhone 17 / iOS 26.2.
- `e2e/register-and-login.yaml` — fills the full register form with a unique
  timestamped email and `HZ9LWVNL` invite code, then logs back in via the
  email-code path.

## Maestro patterns that took trial and error

### Launching the app

Don't `launchApp` followed by `openLink` — `launchApp` resets Expo Go to its
home page and `openLink` fires before the JS bundle is ready, so the deep
link gets dropped.

The pattern that works:

```yaml
- launchApp:
    appId: host.exp.Exponent
- tapOn:
    text: "SPXpay \\(Staging\\)"
    optional: true
```

The `optional: true` means "tap if there, skip if we already left the home
page" — useful when reusing flows that don't always start cold.

### Selectors

- **Text matching is regex**. `创建账户` will match the substring inside
  `新用户？ 创建账户` only if the parent collapses children. iOS A11y often
  collapses nested `<Text>` inside `<Pressable>` into a single label.
  Workaround: **split into separate Pressable** so the tap target has its own
  accessible label, then add `testID` and `accessibilityLabel`.
- Prefer `tapOn: { id: "..." }` over text matching for primary actions
  (submit buttons, link CTAs). `testID="btn-register-submit"` etc. are
  already on the auth screens.
- For lists / repeated labels use `index:`:
  `tapOn: { text: "登录", index: 1 }`.

### Keyboards

`hideKeyboard` fails silently on RN with the New Architecture on iOS 26. Don't
rely on it. Instead:

- Skip it — Maestro's next `tapOn` will scroll the target into view and shift
  focus naturally.
- Or tap a non-interactive label (e.g. `tapOn: "邮箱"`) to dismiss.

### Scroll until visible

For long forms the submit button starts off-screen. Use:

```yaml
- scrollUntilVisible:
    element: { id: "btn-register-submit" }
    direction: DOWN
```

### State that survives between runs

`expo-secure-store` persists per app install. The locale ends up sticking
across test runs — always normalize at the top of the flow:

```yaml
- extendedWaitUntil:
    visible: "中"
    timeout: 30000
- runFlow:
    when:
      notVisible: "欢迎回来"
    commands:
      - tapOn: "中"
      - extendedWaitUntil:
          visible: "欢迎回来"
          timeout: 8000
```

### Generating unique data per run

```yaml
- evalScript: ${output.email = 'yixinmtest' + Date.now() + '@spx.com'}
- inputText: ${output.email}
```

Capture it once at the top, reuse downstream for the matching login attempt.

## Debug artifacts

Every failed run drops a debug folder:

```
/Users/<you>/.maestro/tests/<timestamp>/
  ├── commands-(<flow>.yaml).json   # what was attempted
  ├── maestro.log                   # XCTest driver log
  └── screenshot-❌-<ts>-(<flow>.yaml).png   # the screen at the failure
```

The screenshot is full-resolution (1206×2622 on iPhone 17 Pro), too big for
many image viewers — `sips -Z 1000 -s format jpeg in.png --out out.jpg` to
shrink. The orange/red banner means a runtime JS error; tap **Minimize** in
the simulator to see the actual app state if the error panel covers it.

## Manual screenshots while flow is running

```bash
xcrun simctl io booted screenshot /tmp/now.png
# Then if needed:
sips -Z 1000 /tmp/now.png --out /tmp/now.jpg --setProperty format jpeg
```

iOS 26 native screenshots are 1206 wide, which exceeds many image-API width
caps — always shrink before posting / inspecting.

## Booting / inspecting simulator

```bash
xcrun simctl boot "iPhone 17"
xcrun simctl list devices booted
open -a Simulator                          # bring window forward
osascript -e 'tell application "System Events" to tell process "Simulator" to get {position, size} of window 1'
```

The last command prints `<x>, <y>, <w>, <h>` of the simulator window — useful
if you ever need to do real coordinate math (we don't anymore, since Maestro).

## When the JS bundle crashes mid-flow

The component-stack panel that appears in the simulator looks scary but it's
just the dev error overlay. To distinguish:

- **Crashes during a tap on `EN` / `中`**: likely a NativeWind animated-component
  upgrade. See `docs/GOTCHAS.md`.
- **Crashes during `setTab` / any setState**: same root cause; check `shadow-sm`
  or `active:` pseudo-classes added to a styled View.
- **`Couldn't find a navigation context`**: a nested `<Stack>` is unmounting
  before the parent navigator finishes. See `docs/GOTCHAS.md` again.

Always read the **Metro window** first — the JS stack trace there is more
useful than the in-app overlay.
