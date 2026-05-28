# Gotchas

The non-obvious traps. Each has a real reproduction from this codebase.

---

## 1. NativeWind shadow + active: → View remount → navigation context lost

**Symptom**: tapping a button that updates state crashes with
`Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?`
even though the root `<Stack>` is definitely there. The crash stack points at
the tapped Pressable's `useState` line, which is misleading.

**Root cause**: `react-native-css-interop` (NativeWind's runtime) upgrades a
View / Pressable into an `Animated` version when it sees pseudo-class styles
like `active:`, `disabled:`, `hover:`, `focus:`, or shadow utilities like
`shadow-sm` (which generate iOS-side `shadowColor` / `shadowOffset` props that
need the animated wrapper). The first render bakes in the wrapper. On the
**next** render, if the className changes (e.g. an `active ? '…' : ''`
ternary), NativeWind re-evaluates and decides to upgrade again — which is a
component swap, which unmounts the old subtree, which calls the cleanup of
React Navigation's `useNavigationBuilder`, which calls `getKey()` on a
context that's already gone.

**Fix**: avoid dynamic styles that toggle pseudo-classes or shadows on the
same element. Either:

- Use a static class set (replace `shadow-sm` with a `border border-border`
  in dynamic strings).
- Move `active:` / `disabled:` styles to a Pressable that always has them
  (never appearing / disappearing).
- Express visual state via `style` props or RN `Pressable` render-callback
  (`{({pressed}) => ...}`) instead of NativeWind pseudo-classes.

**Commit reference**: `e48bcac` — fixed by dropping `shadow-sm` from the tab
toggle and language pill, and stripping `active:` from the Button variants.

---

## 2. `i18n.changeLanguage` at runtime breaks navigation context

**Symptom**: tapping the language toggle crashes with the same
"navigation context missing" error as #1, even after fixing all NativeWind
issues.

**Root cause**: react-i18next dispatches a `languageChanged` event that
triggers every `useTranslation()` subscriber to re-render. The cascading
re-render touches enough of the tree that — combined with Expo Router 6's
navigator lifecycle — a Stack screen unmounts mid-commit. Wise / Revolut have
the same issue, which is why they reload the JS bundle when switching language
rather than patching it live.

**Fix**: route `setLocale()` through a JS-bundle reload:

```ts
// src/lib/i18n/index.ts
export async function setLocale(locale) {
  await SecureStore.setItemAsync(STORAGE_KEY, locale);
  if (Updates.isEnabled) {
    await Updates.reloadAsync();          // production builds
  } else if (__DEV__ && DevSettings?.reload) {
    DevSettings.reload('locale-change');  // Expo Go / dev client
  } else {
    // last-resort: live changeLanguage (may glitch)
    await i18n.changeLanguage(locale);
  }
}
```

Sub-second flash, navigation tree starts clean with the new bundle.

**Commit reference**: `e48bcac` — `feat(i18n): switch locale via DevSettings.reload`.

---

## 3. Nested `<Stack>` in route group layouts amplifies unmount races

**Symptom**: `Couldn't find a navigation context` thrown during otherwise
benign state changes. Sometimes traced to `(auth)/_layout.tsx`.

**Root cause**: each `<Stack>` calls `useNavigationBuilder` which registers a
cleanup that needs the parent's NavigationStateContext at unmount time. When
the root `<Stack>` already lives in `app/_layout.tsx`, having another
`<Stack>` in `app/(auth)/_layout.tsx` duplicates state and makes the unmount
cascade unstable.

**Fix**: use `<Slot />` in group layouts:

```tsx
// app/(auth)/_layout.tsx
import { Slot } from 'expo-router';
export default function AuthLayout() {
  return <Slot />;
}
```

The root `<Stack>` is still responsible for screen transitions.

---

## 4. Pressable with nested Text collapses A11y label

**Symptom**: Maestro `tapOn: "创建账户"` fails with "Element not found" even
though the text is visibly on screen.

**Root cause**: iOS accessibility merges nested `<Text>` inside a single
`<Pressable>` into one combined label. The Pressable shows up in the A11y
tree with label `"新用户？ 创建账户"` (one element), not as two separate text
nodes.

**Fix**: split the surrounding text and the link into siblings, and add
`testID` + `accessibilityLabel` to the Pressable. Pattern that works:

```tsx
<View className="flex-row items-center">
  <Text className="text-sm text-ink-muted">{t('auth.login.newHere')} </Text>
  <Pressable
    onPress={() => router.push('/(auth)/register')}
    testID="link-register"
    accessibilityLabel={t('auth.login.newHereCta')}
  >
    <Text className="text-sm font-semibold text-ink">{t('auth.login.newHereCta')}</Text>
  </Pressable>
</View>
```

Then in Maestro, target by id:

```yaml
- tapOn: { id: "link-register" }
```

---

## 5. iOS 26 Simulator filters synthetic mouse events

**Symptom**: `cliclick c:x,y` moves the cursor (visible) but no app responds.
Same for `osascript "click at {x,y}"`.

**Root cause**: starting around iOS 26 / Xcode 26, the Simulator binary ignores
mouse events that come from `CGEventPost` outside of `_legitimate_` UI sources
(real HID hardware, or Apple's accessibility chain). cliclick + osascript both
fall in the rejected bucket.

**Fix**: use Maestro. Its XCTest driver injects via private CoreSimulator APIs
which the simulator accepts. There's no realistic alternative that worked in
this session.

---

## 6. RN New Architecture + Maestro `hideKeyboard` doesn't work

**Symptom**: `- hideKeyboard` in a Maestro flow returns an error:
> Couldn't hide the keyboard. This can happen if the app uses a custom input...

**Root cause**: RN 0.81 with the New Architecture on iOS no longer responds to
the `UIKit` dismiss action Maestro sends.

**Fix**: don't call `hideKeyboard`. Maestro's next `tapOn` will scroll the
target and shift focus, which dismisses the keyboard. Or `tapOn` a static
label as a no-op focus shift.

---

## 7. expo-router 6 + i18next requires `useSuspense: false`

**Symptom**: language change throws even after deferring updates to
`requestAnimationFrame`.

**Root cause**: react-i18next 17 defaults to suspending on `languageChanged`,
which interacts badly with Expo Router's screen mounting.

**Fix**:

```ts
i18n.use(initReactI18next).init({
  ...
  react: { useSuspense: false },
});
```

Already set in `src/lib/i18n/index.ts`.

---

## 8. Bash agent CWD isn't sticky across `run_in_background` tasks

**Symptom**: a background `pnpm ios` started in `spxpay-mobile/` reports
`ENOENT` on `package.json`.

**Root cause**: each background shell invocation starts from the original cwd
of the parent harness, not the cwd left by the previous foreground command.

**Fix**: always prefix `cd /absolute/path && …` for backgrounded commands.

---

## 9. `pnpm expo install <pkg>` requires a Metro hard restart

**Symptom**: new module installs cleanly into `node_modules` but the bundler
emits `Unable to resolve module <pkg>`.

**Fix**: kill metro and re-start with `--clear`:

```bash
pkill -f "expo start"
pnpm start --ios --clear
```

`r` (reload) and `curl http://localhost:8081/reload` are NOT enough — Metro
caches the resolution map.

---

## 10. spxpay-server password fields must be RSA-encrypted

**Symptom**: posting a raw plaintext password to `/sys/login` returns
`{ code: 500, message: "RSA decrypt failed" }`.

**Root cause**: the JeecgBoot-derived backend expects:
1. First call `POST /sys/common/generateRsaKeyPair` → `{ publicKey, cacheKey }`
2. Encrypt the password with that public key (`jsencrypt`)
3. Submit `password=<encrypted>` AND `rsaCacheKey=<cacheKey>` together

`src/lib/auth/rsa.ts` wraps this. Use `loginWithPassword`, `registerByEmail`,
`recoverPassword` from `src/lib/auth/api.ts` — never call `/sys/login` directly.

---

## 11. The token name lives on `userInfo`, not on the envelope

The login response is:

```json
{
  "code": 0,
  "result": {
    "userInfo": {
      "token": "...",
      "tokenName": "X-Access-Token",
      "username": "...",
      ...
    }
  }
}
```

After `loginWithPassword(...)`, pull both fields off `result.userInfo` (the
`store.setSession` helper already does this). Don't read `result.token`.

---

## 12. Staging API has CORS configured for known domains only

If you ever wire `pnpm web` to talk to staging directly, expect CORS errors —
nginx whitelists `staging.spxpay.com` etc. but not `localhost:5300`. The
mobile app is unaffected because RN doesn't enforce CORS, but web previews of
the same code will fail. Use the Vite proxy in spxpay-client for web preview,
or point Expo at the running web client's proxy.
