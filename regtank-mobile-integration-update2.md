# 更新（2026-05-27 续）：我们已采用并实测「直连 onboarding 后端」方案

> 上一节（D 节）提出的「移动端改打托管页同款 onboarding 后端」已由我方**自行验证并落地**，因此原 ASK #2（能否用 verifyLink token 直连）**已自答 = 能**。本节记录实测结果，并把需要 Regtank 处理的事项收敛到**一条真正的安全问题**。

## 1. 已采用的接入方式（与托管页完全一致）

移动端现在**直连 `*-onboarding-proxy.regtank.com`**（托管 verifyLink 页用的同一后端），**只在请求 body 带 verifyLink 的 token** 鉴权，不再使用我方后端代理、不再使用 Portal `/v3` 的 OAuth2 client_credentials Bearer、不接触 `clientSecret`。

端点（相对 onboarding-proxy base）：

| 用途 | 端点 | 鉴权 |
|---|---|---|
| 证件上传 | `POST /onboarding/liveness/document-upload` | body `token` |
| 实时人脸框 | `POST /verify/detect-face` | body `token` |
| 人脸活体 | `POST /onboarding/liveness/check`（multipart）| body `token` |
| 状态/OCR | `POST /onboarding/liveness/status` | body `token` |

API host 由我方移动端**从 verifyLink 的域名自动派生**（`spxpay[-env]-onboarding.regtank.com` → `…-onboarding-proxy.regtank.com`），无硬编码，自动跟随环境。

## 2. 实测结果（sandbox，真实证件 + 真人脸，仅 body token）

| 步骤 | 结果 |
|---|---|
| `/onboarding/liveness/status`（握手后）| 200，`URL_GENERATED` |
| `/onboarding/liveness/document-upload` | 200，`status: ID_UPLOADED` |
| `/verify/detect-face` | 200，返回 `faceRectangle` + `faceNum` |
| `/onboarding/liveness/check` | 200，`verifyStatus: LIVENESS_PASSED`，confidence **88.43** |
| `/onboarding/liveness/status`（最终）| `WAIT_FOR_APPROVAL`，OCR 正确读出姓名/出生日期 |

**全程不带任何 Authorization 头、不带 x-api-key，仅 body `{requestId, token}` 即通过。** 证明 proxy 在服务端注入 `x-api-key/x-api-secret`，客户端无需任何服务凭证。

## 3. 因此，原 ASK 的处理

- **ASK #1（两套 token / 两条后端的理解）**：已通过读源码 + 实测确认无误。✅
- **ASK #2（能否直连 onboarding 后端）**：**能，已落地**。✅ 无需 Regtank 额外开放接口。
- **ASK #3（官方移动端 SDK）**：仍想了解 Regtank 是否有面向移动端的官方 SDK（仓库里有 `Native_Android_SDK`），若有我们乐意迁移；当前的"直连 proxy + body token"方案已可用。
- **ASK #4 / #5（detect-face 端点、document-upload 不返回 OCR）**：实测已确认，按此实现。

## 4. ⭐ 唯一真正需要 Regtank 关注/确认的：token 安全

这是我们最希望 Regtank 评估的一点：

- verifyLink 里的 token 是 HS256 JWT，**`iss` claim 就是该租户的 `clientSecret`**（`sub` = clientId）。
- 该 token 由**全局硬编码密钥 `"regtank2021"`** 签名（`ClientPortalLivenessBackend` 的 `CommonUtils.generateToken`/`getTokenInfo`）。

含义：
1. **任何拿到 verifyLink 的人，无需任何密钥即可 base64 解码 JWT payload，直接读到我方 `clientSecret`**（payload 是明文，签名只防篡改不防读取）。
2. 由于签名密钥是所有租户共享的固定值 `regtank2021`，理论上可离线伪造任意租户的合法 onboarding token。

**请 Regtank 确认**：
- 这是否符合预期设计？
- 是否可改为**不在 token 内嵌 clientSecret**（改用随机的、服务端可查的一次性会话 ID），并使用**每租户独立的签名密钥**？

在 Regtank 调整前，我方会把 verifyLink 视为敏感凭证（不记录到客户端日志、不外发），但根本修复需要 Regtank 侧调整 token 设计。

---

*更新整理：SPXpay 技术 · 2026-05-27 · 直连方案已在 feat/sgb 落地并 sandbox 实测通过*
