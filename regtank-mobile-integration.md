# SPXpay 移动端原生 Onboarding 接入 Regtank — 技术说明 & 讨论稿

> 面向 Regtank 技术团队。目的：说明我们目前在**移动端原生（App 内）**走 Regtank fast-track onboarding 的接入方式、为什么后端要代理几个接口，并就 **token 模型**与 Regtank 对齐认知、确认是否有更优的官方接入方式。
> 所有结论均基于真实代码 + 2026-05-27 用真实证件/真人脸在 sandbox 实测。

---

## 1. 背景与目标

Regtank 的标准 onboarding 是**托管页（hosted page）**：我们后端调 `request-fast-track` 拿到一个 `verifyLink`，用户在浏览器/WebView 里打开这个链接，在 Regtank 自己的页面上完成证件上传 + 人脸活体。

- **Web 端**：我们就是这么做的 —— `Linking.openURL(verifyLink)`，一切交给 Regtank 托管页，没有任何问题。
- **移动端（Android/iOS 原生）**：产品要求做成 **App 内原生流程**（原生相机 UI、原生表单、品牌化体验），不跳浏览器。所以 App 需要**自己直接调用** onboarding 的几个底层接口：
  - `document-upload`（证件上传 + OCR）
  - `liveness-check`（人脸活体视频）
  - `detect-face`（录制前实时人脸框检测，做"靠近/远离/居中"引导）
  - `query`（查 onboarding 详情 / OCR 结果 / 最终状态）

这份文档讨论的就是**移动端原生这条路怎么接、卡在哪、为什么现在用后端代理**。

---

## 2. 当前接入架构（全链路）

```
┌─────────────┐   ① client_credentials grant
│  SPX 后端    │ ─────────────────────────────────►  Regtank CRM Server
│ (持有        │      POST /oauth/token                 (crm-server)
│  clientId +  │ ◄─────────────────────────────────
│  clientSecret)│      access_token (RS256, ROLE_SERVICE)
└──────┬──────┘
       │ ② 用 access_token 作 Bearer
       │    POST /v3/onboarding/indv/request-fast-track   { email, referenceId }
       ▼
   Regtank Portal Server ──►  返回 { requestId, verifyLink, expiredIn }
       │                       verifyLink 里带 ?token=<HS256 会话票据>
       │ ③ 后端把 requestId + token 下发给 App
       ▼
┌─────────────┐
│  移动端 App   │  只持有 per-session 的 { requestId, token }
│ (原生流程)    │  —— 没有 clientSecret、没有 access_token
└──────┬──────┘
       │ ④ App 调【我们自己后端】的代理接口（带 SPX 登录态）
       │    POST /sys/regtank/onboarding/indv/{document-upload,liveness-check,detect-face,query}
       ▼
┌─────────────┐  ⑤ 后端补上 Authorization: Bearer <access_token>
│  SPX 后端代理 │      + 越权校验（requestId 必须属于当前登录用户）
└──────┬──────┘      + 透传 body 里的 { requestId, token, ... }
       │ ⑥ 转发到 Regtank Portal（带 RS256 Bearer）
       ▼
   Regtank Portal Server  ──►  document-upload / liveness-check / detect-face / query
```

**一句话**：App 手里只有 onboarding 会话票据（verifyLink 里的 token），**没有也不能有** clientSecret；而 Regtank 的这几个 onboarding 端点又要求 clientSecret 换来的 Bearer。所以我们在中间放了一层后端代理，由服务端补 Bearer。

---

## 3. 为什么必须由后端代理（核心论点）

### 3.1 这几个端点都要求 client_credentials Bearer

我们要调的 onboarding 端点都在 **Portal Server** 上，且都受 OAuth2 resource server 保护（等价 `@PreAuthorize("isAuthenticated()")`），**必须**带：

```
Authorization: Bearer <access_token>
```

而这个 `access_token` 是用 **`client_id` + `client_secret`（client_credentials grant）** 在 `/oauth/token` 换来的（scope = `ROLE_SERVICE`，拥有 Regtank API 的读写权限）。

### 3.2 clientSecret 不能进 App

`client_secret` 是 SPX 的服务端密钥，一旦打进 APK 就能被逆向提取，等于把整个 Regtank API 的读写权限泄露。**绝不能下发到客户端**。

→ 结论：App 无法自己生成合法的 Bearer，只能由**后端**在服务端持有 secret、换 token、补 header 后转发。这就是代理存在的根本原因。

### 3.3 实测证据（2026-05-27 sandbox）

| 请求 | 结果 |
|---|---|
| `document-upload` 只带 body 里的 `token`（即 verifyLink 的 token），**不带** Authorization 头 | **401** |
| 同一请求**加上** `Authorization: Bearer <client_credentials access_token>` | **200**，`status: ID_UPLOADED`，OCR `SUCCESS` |
| `detect-face` 只带 body `token`，不带 Bearer | **401** |
| `detect-face` 加 RS256 Bearer | **200**，返回人脸框 `{faceNum, faces:[{faceRectangle}]}` |

→ 反复验证：**body 里的会话 token 不足以通过 Portal 端点的鉴权，必须额外有 RS256 Bearer。**

### 3.4 代理的附带收益

除了"不得不代理"，这层代理还带来：

- **越权防护**：后端校验 `requestId` 必须等于当前 SPX 登录用户记录里的 `regtankRequestId`，防止 A 用户用 B 的 requestId。
- **统一可观测 / 限流**：所有对 Regtank 的调用都过我们后端，有日志、告警、可加限流（detect-face 是高频端点）。
- **契约收敛**：documentType 映射、`formId` 回填、data-URI 包装等都在一处处理。

---

## 4. 后端代理的 4 个接口

| App 调用（SPX 后端，带 SPX 登录态） | 转发到 Regtank | 方法 | 备注 |
|---|---|---|---|
| `POST /sys/regtank/onboarding/indv/document-upload` | `POST {portal}/v3/onboarding/indv/document-upload` | JSON | 后端补 Bearer + 回填 formId + 越权校验 |
| `POST /sys/regtank/onboarding/indv/liveness-check` | `POST {portal}/v3/onboarding/indv/liveness-check` | multipart | form: requestId / token / video(mp4) |
| `POST /sys/regtank/onboarding/indv/detect-face` | `POST {portal}/v1/onboarding/exchange/verify/detect-face` | JSON | 高频，失败静默降级 |
| `GET/POST /sys/regtank/onboarding/indv/query` | `GET {portal}/v3/onboarding/indv/query?requestId=` | — | 取 status + ocrResults |

> 三个写接口的 body 里都同时带 `requestId` + `token`（来自握手 verifyLink），Authorization 头由后端补。

---

## 5. ⭐ Token 模型 —— "verifyLink 里的 token" 和 "我们后端用的 token" 是不是同一个？

**不是同一个，是两套完全不同的 token。** 这是我们最想和 Regtank 对齐的点。

### 5.1 verifyLink 里的 `?token=` —— onboarding 会话票据

从真实 `verifyLink` 里解出来的 token 结构：

```jsonc
// header
{ "alg": "HS256" }
// payload
{
  "jti": "...",
  "iat":  <签发时间>,
  "exp":  <iat + 86400>,        // 24h 有效
  "sub": "<我们的 clientId>",
  "iss": "<我们的 clientSecret>"
}
```

- **HS256**，用我们的 `clientSecret` 对称签名；
- 绑定**这一次** onboarding 会话，24h 过期；
- 不含密钥本身、是一次性会话票据，所以**可以安全放进 URL / App**。

### 5.2 后端用的 `access_token` —— client_credentials 服务令牌

- 通过 `POST /oauth/token` 用 `client_id`+`client_secret`（`grant_type=client_credentials`）换取；
- 是 OAuth2 的 **RS256** 令牌（资源服务器用 JWK 公钥验签），scope `ROLE_SERVICE`，代表"SPX 这个服务"，拥有 Regtank API 读写权限；
- **只能留在服务端**。

### 5.3 关键：为什么托管页能用会话 token 直连，App 却不行？

我们读了 Regtank 托管前端（`protego-client-portal` / `ClientPortalLivenessOnboarding`）的实现，结论是：

- **Portal Server 的 `/v3`、`/v1` 端点**用 OAuth2 resource server，**只认 RS256 的 client_credentials token**（JWK 验签）。HS256 的会话 token 在这里**验不过 → 401**（我们实测过：拿 verifyLink 的 token 当 Bearer 打 Portal 的 detect-face，依然 401）。
- 托管页能用会话 token，是因为**托管页连的不是 Portal**，而是 Regtank 的 **onboarding/liveness 后端**（前端代码里的 `API_ENDPOINT`）。那个后端用 `validateHeaderByToken` 这套逻辑**专门校验这个 HS256 会话 token**。

也就是说，**同一个"上传证件/活体/人脸框"操作，在 Regtank 侧其实有两条入口**：
1. **托管页路径** → onboarding/liveness 后端 → 认 **HS256 会话 token**（verifyLink 的 token）。
2. **Portal API 路径**（`/v3/onboarding/indv/*`、`/v1/.../detect-face`）→ Portal resource server → 认 **RS256 client_credentials token**。

我们移动端原生因为不走托管页、又只能调 Portal API 路径，就被 3.1 的鉴权要求卡住，只能由后端补 RS256 Bearer 来代理。

---

## 6. 想和 Regtank 确认 / 讨论的点（ASK）

1. **认知确认**：上面第 5 节对两套 token、两条后端入口的理解是否准确？Portal 的 `/v3/onboarding/indv/*` 是否确实只接受 client_credentials（RS256）Bearer、不接受 verifyLink 的 HS256 会话 token？

2. **是否有"会话 token 可直连"的移动端入口**：能否在**接受 HS256 会话 token** 的那套 onboarding 后端上，也提供 `document-upload` / `liveness-check` / `detect-face` / `query` 的可直连接口？如果有，移动端 App 就能**直接用 verifyLink 的 token** 调用，不必经过我们后端代理，也无需暴露 clientSecret —— 这是最干净的原生接入方式。

3. **官方移动端方案**：Regtank 是否有面向移动端原生集成的 **SDK / 推荐方案**（我们看到仓库里有 `Native_Android_SDK` 目录）？如果有官方 SDK，我们更愿意直接用，而不是自己拼接 API。

4. **detect-face 契约确认**：实时人脸框检测我们用的是 `POST /v1/onboarding/exchange/verify/detect-face`，body `{requestId, token, selfieImage:{fileContent(data-URI), fileName}}`，返回 `{faceNum, faces:[{faceRectangle:{top,left,width,height}}]}`。请确认这是面向 fast-track onboarding 的正确端点、且会长期支持（我们靠它做录制前实时引导，频率约 0.8 帧/秒）。

5. **document-upload OCR 返回**：实测 `document-upload` 只返回 `status`（如 `ID_UPLOADED`），**不返回 OCR**；OCR 字段要从 `query` 的 `ocrResults` 取。请确认这是预期行为。

---

## 7. 附录：实测确认的接口契约（fast-track，2026-05-27 真证件/真人脸 sandbox）

### 7.1 document-upload `POST /v3/onboarding/indv/document-upload`
```jsonc
// 请求（Authorization: Bearer <RS256 access_token>）
{
  "requestId": "LD8xxxx",
  "token": "<verifyLink 的 HS256 会话 token>",
  "formId": 1122716,
  "documentType": "Identity",          // ⚠ PascalCase: Identity/Passport/DriverLicense/ResidencePermit
  "frontImage": {
    "fileName": "front.jpg",
    "fileContent": "data:image/jpeg;base64,...."  // ⚠ 必须 data-URI 前缀，裸 base64 → 400 ERROR_MISSING_PARAM
  },
  "backImage": { "fileName": "back.jpg", "fileContent": "data:image/jpeg;base64,...." },
  "forceUpload": false
}
// 响应：{ requestId, status: "ID_UPLOADED", docUploadErrors:[], rejected:false, ... }  —— 无 OCR
```

### 7.2 liveness-check `POST /v3/onboarding/indv/liveness-check`（multipart）
```
form-data: requestId=<...>  token=<...>  video=<liveness.mp4>
响应: { verifyStatus: "LIVENESS_PASSED" | "LIVENESS_FAILED" | "NO_FACE_DETECTED" | "FAIL_QUALITY", confidence: 88.24, selfieUrl, ... }
```

### 7.3 detect-face `POST /v1/onboarding/exchange/verify/detect-face`（JSON）
```jsonc
// 请求
{ "requestId":"...", "token":"...", "selfieImage": { "fileName":"frame.jpg", "fileContent":"data:image/jpeg;base64,..." } }
// 响应
{ "requestId":"...", "faceNum": 1, "faces": [ { "faceRectangle": { "top":.., "left":.., "width":.., "height":.. } } ] }
```

### 7.4 query `GET /v3/onboarding/indv/query?requestId=<...>`
```
响应含: status, kycStatus, userProfile{...}, ocrResults{ fullName, firstName, lastName, dateOfBirth, idNumber, nationality, idIssuingCountry, validUntil, ... }, livenessCheckInfo{...}
```

### 7.5 端到端实测结果
用真实身份证 + 真人脸在 sandbox 跑通整条 fast-track：
握手 → document-upload（`ID_UPLOADED`，OCR `SUCCESS`，姓名/证件号/出生/签发机关/有效期全部读对）→ liveness-check（`LIVENESS_PASSED`，比对 confidence **88.24**）→ query 最终 `WAIT_FOR_APPROVAL`。**证明契约正确、与照片清晰度无关。**

---

*整理：SPXpay 技术 · 2026-05-27 · 基于 spxpay-server `RegtankUtil` / `RegtankOnboardingController` 与 spxpay-mobile onboarding 代码 + sandbox 实测*
