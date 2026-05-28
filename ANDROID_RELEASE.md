# Android Release Build (CI)

`.github/workflows/android-release.yml` builds a **signed APK** on manual trigger and uploads it to a GitHub Release, then posts the download link to the Lark deploy channel.

## Trigger

GitHub UI → **Actions** → **Android Release Build** → **Run workflow**. Pick `staging` or `production`, optionally type release notes, hit run.

Or via CLI:

```bash
gh workflow run android-release.yml -R SPXpay-Tech/spxpay-mobile \
  -f env=staging \
  -f release_notes="bug fixes"
```

## Output

- **GitHub Release**: tag `android-<env>-v<version>-<build>`, with the APK attached. Browse: <https://github.com/SPXpay-Tech/spxpay-mobile/releases>
- **Lark message**: posted via `LARK_WEBHOOK` (same channel as other deploys), contains APK direct link + SHA-256
- **APK file name**: `spxpay-<env>-<version>-<env>-<build>.apk`

Download requires GitHub login (repo is private). Future: migrate to Cloudflare R2 + `apk.spxpay.com` for public install URL.

## Versioning

- `versionName` in the APK = `<app.config.ts version>-<env>-<github.run_number>`, e.g. `0.1.0-staging-7`
- `versionCode` = `github.run_number` (monotonically increasing across all triggers)

## Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `ANDROID_KEYSTORE_STAGING` | base64 of `spxpay-staging.keystore` |
| `ANDROID_KEYSTORE_STAGING_PASSWORD` | keystore + key password (same value) |
| `ANDROID_KEYSTORE_PROD` | base64 of `spxpay-prod.keystore` |
| `ANDROID_KEYSTORE_PROD_PASSWORD` | keystore + key password (same value) |
| `LARK_WEBHOOK` | Lark bot webhook for deploy notifications |

Keystore aliases are hard-coded in the workflow: `spxpay-staging` and `spxpay-prod`.

## Keystore management

The release keystores were generated **once** with `keytool` (2048-bit RSA, 10000-day validity). They live **outside the repo** — back them up:

1. Local copy: `.keys/` (gitignored)
2. **Required**: copy `.keystore` files + passwords to 1Password / secure vault. **Losing the prod keystore means losing the ability to ship updates to existing installs** — every user must uninstall + reinstall.

Fingerprints (SHA-256):

- staging: `C1:CB:F7:71:03:19:86:D3:EC:7A:A4:E8:C0:22:1A:BD:FE:2E:15:33:9E:16:AA:70:52:A0:B8:3F:D4:61:59:3B`
- prod:    `73:23:25:47:CE:CC:57:03:86:8D:FB:6C:59:17:BC:03:DB:A6:10:2C:9E:F4:9C:4A:61:3D:F1:62:73:EA:71:90`

## Build cost

GitHub-hosted runners: ~10–15 min per build, free under 2000 min/month for private repos.

## Next steps (post-MVP)

- [ ] Migrate APK hosting to Cloudflare R2 + `apk.spxpay.com` (one-tap install link, no GH login needed) — requires R2 enabled in CF dashboard
- [ ] Add iOS build (`workflow_dispatch` with `platform` input, macOS runner, Apple Dev account required for signing)
- [ ] Switch to AAB + Play Store internal testing track once company has Google Play Developer account
