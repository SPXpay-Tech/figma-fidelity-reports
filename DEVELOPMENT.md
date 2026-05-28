# Development Guide

How to develop, debug, and run `spxpay-mobile` end-to-end on macOS. Distilled from
the bootstrap session — only the things that actually worked are written here.

## Stack

- **Expo SDK 54** (New Architecture on) + **React Native 0.81** + **React 19**
- **Expo Router 6** (file-based, `app/` folder)
- **TypeScript strict**
- **NativeWind v4** (Tailwind for RN) + Tailwind v3 preset
- **axios** + **TanStack Query** + **Zustand**
- **react-i18next** + **expo-localization** + **expo-secure-store**
- **react-hook-form** + **zod** (when forms grow)
- **jsencrypt** for RSA-encrypted password fields against spxpay-server
- **EAS** for cloud build / submit; **DevSettings.reload** / **Updates.reloadAsync** for live locale reload

## First-time setup

```bash
pnpm install
# iOS simulator
pnpm ios
# or just start Metro and pick a target
pnpm start
```

The first launch downloads Expo Go into the simulator (~30s). After that
launches are seconds.

`pnpm typecheck` before pushing. Always.

## Environments

`APP_ENV` toggles between staging and prod at app.config.ts time.

| Env | Bundle ID | API base |
|---|---|---|
| staging (default) | `com.spxpay.mobile.staging` | `https://staging-api.spxpay.com/api` |
| prod | `com.spxpay.mobile` | `https://api.spxpay.com/api` |

```bash
pnpm start:staging   # default
pnpm start:prod      # talks to prod API; do NOT submit forms here
```

`src/lib/env/index.ts` reads `Constants.expoConfig?.extra.appEnv`. Don't read
`process.env` from React code — that only works server-side.

## Layout

```
app/                       # Expo Router pages (file = route)
  _layout.tsx              # Root: GestureHandler → SafeArea → QueryClient → Stack
  index.tsx                # Redirect by auth state
  (auth)/                  # Public routes
    _layout.tsx            # <Slot /> (DO NOT nest Stack here, see gotchas)
    login.tsx
    register.tsx
    forgot-password.tsx
  (app)/                   # Authed routes
    home.tsx
src/
  components/ui/           # Button, TextField, AuthScreen, Checkbox, Segmented, PhoneInput, LanguageToggle
  constants/               # Static enums + phoneCodes
  lib/
    api/client.ts          # axios + envelope unwrap + dev request log
    auth/
      api.ts               # /sys/login, /sys/registerByEmail, /sys/sendVerificationCode, ...
      rsa.ts               # JSEncrypt wrapper over /sys/common/generateRsaKeyPair
      store.ts             # zustand auth slice
      uuid.ts              # checkKey generator
    env/                   # APP_ENV + apiBase resolution
    i18n/                  # zh_CN + en + setLocale via reload
    storage/secure.ts      # expo-secure-store wrapper for tokens/locale
e2e/                       # Maestro flows
docs/                      # This folder
```

## API conventions

- Server returns `{ code, message, result, success }`. `code === 0` (or 200, or
  `success === true`) is OK. Anything else throws `ApiError` from
  `src/lib/api/client.ts` `unwrap()`.
- Auth header is **`X-Access-Token`** (Sa-Token / JeecgBoot convention) — NOT
  `Authorization: Bearer`.
- `lang` header is auto-attached as `zh_CN` or `en` so the backend returns
  localized messages. Matches the web client convention.
- Form bodies for `/sys/*` endpoints use `application/x-www-form-urlencoded`
  (the `api.postForm()` helper).
- Passwords pass through RSA: call `getRsaKeyPair()`, `encryptWithRsaPublicKey()`,
  and pass `rsaCacheKey` in the form so the server can decrypt.

## Logging API calls

`src/lib/api/client.ts` already attaches request/response interceptors that
print to Metro in `__DEV__`:

```
→ POST /sys/sendVerificationCode { email: ..., scene: REGISTER }
← 200 POST /sys/sendVerificationCode { code: 0, message: "", result: null, success: true }
```

Sensitive fields (`password`, `newPassword`, `confirmPassword`, `token`,
`rsaCacheKey`) are redacted. Use this as the source of truth when an E2E flow
"silently fails" — the Metro window is where the real request/response live.

Tail Metro logs while the test runs:

```bash
tail -F <metro-task-output>  # the path is printed when you start `pnpm start`
```

## Reloading

Three layers of reload, from cheap to nuclear:

1. **Fast Refresh** — auto, file-save triggers it. Sometimes silently fails on
   imports of newly installed modules.
2. **Manual reload**: `curl -X POST http://localhost:8081/reload` or `r` in the
   Metro terminal.
3. **Cold restart Expo Go** when a new native module was installed or when
   Fast Refresh got confused:
   ```bash
   xcrun simctl terminate booted host.exp.Exponent
   xcrun simctl openurl booted "exp://192.168.0.10:8081/--/login"
   ```
4. **Nuclear**: kill Metro, restart with `--clear`:
   ```bash
   pkill -f "expo start"
   pnpm start --ios --clear
   ```
   `--clear` is required after `pnpm expo install <new-package>`, otherwise
   Metro keeps stale `node_modules` resolution and you'll see
   `Unable to resolve module …` even though the package is installed.

## Working with Expo Router

- The root `_layout.tsx` must own the only `<Stack>`. Group layouts
  (`(auth)/_layout.tsx`, `(app)/_layout.tsx`) should use `<Slot />`. Nesting
  `<Stack>` inside a group caused
  `Couldn't find a navigation context` to fire on every state-induced unmount.
- Use `router.push()` / `router.replace()` instead of `<Link>` for buttons that
  are part of a Pressable composition — `<Link asChild>` works but is fussier
  about child types.

## Deep linking for fast manual testing

You can jump straight to any screen via Expo Go:

```bash
xcrun simctl openurl booted "exp://192.168.0.10:8081/--/login"
xcrun simctl openurl booted "exp://192.168.0.10:8081/--/register"
xcrun simctl openurl booted "exp://192.168.0.10:8081/--/forgot-password"
```

The IP after `exp://` must match the LAN address Metro printed (it's printed
right after Bundler start).

## Build / submit

`eas.json` already declares `staging` / `production` / `preview` profiles.

```bash
eas build --profile staging --platform ios
eas submit --profile staging --platform ios
```

OTA hotfixes (JS-only) go via `eas update --branch production` — they skip
App Store review.
