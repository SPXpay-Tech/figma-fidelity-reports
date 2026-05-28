# iPhone 真机 Dev Client 开发指南

免费 Apple ID + Xcode Personal Team 签名，在自己 iPhone 上跑 spxpay-mobile dev client。
证书 7 天过期；过期后重跑一次 `expo run:ios` 续 7 天。

---

## 当前环境（一次性已配好，无需重复）

- **Apple ID** 已加到 Xcode → Settings → Accounts
- **iPhone** 13 Pro (iOS 26.4) 已配对 Mac，开发者模式已开
- **Xcode Signing**: Team `4CG2FHDCS6` (Personal Team), Bundle ID `com.spxpay.mobile.staging`
- **Podfile** 已加 Xcode 26 兼容补丁（`SWIFT_VERSION = 5.0` + `SWIFT_STRICT_CONCURRENCY = minimal`）
- **iPhone 设置** → VPN 与设备管理 → 已 Trust 开发者证书

---

## 日常启动（证书未过期时）

App 已经在手机上，只需要起 Metro：

```bash
cd /Users/yixinlu/Desktop/workspace/payment/spx/spxpay-mobile
APP_ENV=staging pnpm start --dev-client
```

终端会显示一个 QR + URL，例如 `exp+spxpay-mobile://expo-development-client/?url=http://192.168.0.10:8081`。

**iPhone 上**：
1. 打开主屏的 **SPXpay (Staging)** app
2. 它会自动连 Metro 拉 JS bundle（第一次有进度条）
3. 看到登录页 = OK

⚠️ Mac + iPhone **必须同 WiFi**（当前 Mac IP `192.168.0.10`）。换网络后 IP 变了，重启 Metro 即可。

⚠️ **不要关那个终端窗口**，关了 Metro 就断、app 显示「No script URL」红屏。

---

## 测试

### 验证 hot reload

随便改一个文件保存：

```bash
# 例如改首页里的某段文字
nano src/app/index.tsx
```

保存后 iPhone 上 1-2 秒内界面自动刷新。

### 看 JS console / 报错

- **iPhone 摇一摇手机** → 弹 Dev Menu → `Open JS Debugger`（Chrome devtools 在 Mac 浏览器打开）
- 或者 Mac 上跑 Metro 的终端窗口直接看 console.log
- 红屏报错点 `Extra Info` 看 stack

### API 环境

`app.config.ts` 里 `APP_ENV=staging` 时打 `https://staging-api.spxpay.com/api`。
要打 prod 后端：

```bash
APP_ENV=prod pnpm start --dev-client
```

但 prod 写接口慎用，参考 [GOTCHAS.md](./GOTCHAS.md)。

### E2E 跑 Maestro

数据线连着 iPhone：

```bash
pnpm e2e e2e/smoke-login.yaml --device <udid>
```

或用 spxpay-mobile-e2e skill 跑 simulator 流程。

---

## 7 天后证书过期，app 闪退

免费 Personal Team 的签名只活 7 天，过期后点 app 图标会一闪退。重新签名 + 装机：

```bash
# 1. 把 iPhone 用数据线接 Mac，解锁屏幕
# 2. 确认 device connected:
xcrun devicectl list devices
# 应该看到 iPhone ... connected

# 3. 重跑（增量编译，1-2 分钟）
cd /Users/yixinlu/Desktop/workspace/payment/spx/spxpay-mobile
APP_ENV=staging pnpm exec expo run:ios --device "iPhone" --no-install
```

完成后 app 自动重启，证书续 7 天。可以拔线，回到日常 `pnpm start --dev-client` 流程。

> 如果想免每周续签：买 $99/年 Apple Developer Program，证书有效期变 1 年，并且可以走 EAS Build internal distribution。

---

## 常见问题

### 「No script URL provided」红屏

Metro 没跑或者连不上。
- 确认 Mac 上 `pnpm start --dev-client` 还在前台
- Mac + iPhone 同 WiFi
- 点屏幕底部 `Reload JS`

### Mac IP 变了 / 换了 WiFi

杀掉 Metro 重启即可。`expo start` 会自动用当前 IP。

### `Unable to launch ... has an invalid code signature`

证书过期或未 trust。
- 7 天到期 → 走「7 天后证书过期」流程重签
- 第一次装的 trust 步骤没做 → iPhone 设置 → 通用 → VPN 与设备管理 → 信任

### `No device UDID or name matching ...`

UDID 大小写或 Xcode 26 devicectl JSON 版本问题。**始终用设备名字** `"iPhone"`，不要传 UDID：

```bash
pnpm exec expo run:ios --device "iPhone"   # ✅
pnpm exec expo run:ios --device <udid>     # ❌
```

### `concurrency-safe` / `not Sendable` Swift 编译错

Xcode 26 Swift 6 严格并发。`ios/Podfile` 的 `post_install` hook 已经把所有 pod 降级到 Swift 5 + minimal concurrency，照理不再出现。
如果 `pod install` 跑过后又出，确认 Podfile 没被 revert，重新 `cd ios && pod install`。

### iPhone 在 devicectl 显示 `unavailable`

锁屏 / 数据线松了 / 信任过期。
- 解锁 iPhone
- 重插数据线，iPhone 弹「信任这台电脑」点信任

### Personal Team 一个 Apple ID 限制

- 同一 Apple ID 最多签 **10 个不同的 device-app 组合**（7 天滚动窗口）
- 同时 active 最多 **3 个 app bundle ID**
- 超了删旧的开发者条目（iPhone → VPN 与设备管理）

---

## 参考

- 项目说明：[../README.md](../README.md)
- 通用开发流程：[DEVELOPMENT.md](./DEVELOPMENT.md)
- 已知坑：[GOTCHAS.md](./GOTCHAS.md)
- 测试架构：[TESTING.md](./TESTING.md)
