---

# 补充（2026-05-27 深挖 Regtank 源码）：为什么 verifyLink 前端无需登录就能访问？

> 应需求补充。我们读了 Regtank 托管 onboarding 的前后端源码（`ClientPortalLivenessOnboarding` / `ClientPortalLivenessBackend` / `ClientPortalLivenessProxy`），把"托管页为什么不用登录就能跑"的机制彻底搞清楚了。**结论会改变上面第 6 节的接入建议** —— 见本节最后的"更优接入选项"。

## A. 机制全解：托管页的"鉴权"靠 URL token 本身，不靠登录

整条链路其实是一个**完全公开（permitAll）的后端 + token 自带身份**的设计：

**① 前端从 URL 取 token，放进每个请求的 body（不是 header）**

`ClientPortalLivenessOnboarding/src/pages/Onboarding/index.tsx`：
```js
let params = new URLSearchParams(props.location.search);
const token = params.get("token");
const requestId = params.get("requestId");
storage.setObjectIntoKey("request", { token, requestId });   // 存 localStorage
```
之后每个接口调用都把它放进 **请求体**：
```js
const requestData = storage.getObjectFromKey("request");
verifyRequest({ requestId: requestData.requestId, token: requestData.token });
```
axios 没有任何 Authorization 头，baseURL = `process.env.API_ENDPOINT`（指向 onboarding proxy）。

**② 后端整个 permitAll —— 这就是"前端可访问"的直接原因**

`ClientPortalLivenessBackend/.../WebSecurityConfig.java`：
```java
http.csrf().disable().authorizeRequests()
    .anyRequest().permitAll()                 // ← 所有路由公开，不要求登录/session/OAuth
    .and().sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS);
```
所以打开 verifyLink、调它的 API，HTTP 层**不需要任何登录握手**——页面自然能访问。

**③ 鉴权改在 controller 里手动做：解 body 里的 token**

`ClientPortalLivenessBackend/.../webverify/IndvController.java` 每个方法：
```java
Authentication authN = validateHeaderByToken(request.getToken(), error);
```
`validateHeaderByToken` → `CommonUtils.getTokenInfo(token)`：
```java
Claims claims = Jwts.parser()
    .setSigningKey(DatatypeConverter.parseBase64Binary("regtank2021"))   // ← 固定密钥验签
    .parseClaimsJws(token).getBody();
tokenInfo.setToken(claims.getId());        // jti
tokenInfo.setApiKey(claims.getSubject());  // sub → apiKey(=clientId)
tokenInfo.setSecretKey(claims.getIssuer());// iss → secretKey(=clientSecret)
```
即：**token 本身就内嵌了这家租户的 apiKey + secretKey**；后端用全局固定密钥 `regtank2021` 验签后取出这对凭证，再去 DB 反查是哪家客户、是哪一次 onboarding。**身份完全来自 token，不来自登录态。** 这就是"无需登录也能鉴权"的根本。

**④ proxy 再补一层服务凭证（针对走 header 鉴权的端点）**

`ClientPortalLivenessProxy/server.js`：
```js
var targetServer = 'https://qc-digitalonboarding-stg-server.regtank.com';
proxyReq.setHeader('x-api-key', xApiKey);      // 代理自己的服务凭证
proxyReq.setHeader('x-api-secret', xApiSecret);
app.use('/onboarding/liveness/*', apiProxy);
app.use('/onboarding/*', apiProxy);
app.use('/verify/*', apiProxy);
app.use('/v1/onboarding/*', apiProxy);
```
带 token 的 onboarding 端点走 `validateHeaderByToken`（body token）；另有一部分端点走 `validateHeader`（读 `x-api-key`/`x-api-secret`），由 proxy 注入。

## B. 关键发现：托管页和我们的代理打的是【两个不同的后端】

| | 托管页（verifyLink 前端） | 我们移动端代理 |
|---|---|---|
| 目标后端 | **Liveness / DigitalOnboarding** backend（经 proxy → `*-digitalonboarding-*-server`）| **Portal** backend（`protego-client-portal-backend`）|
| 端点路径 | `/onboarding/*`、`/onboarding/liveness/*`、`/verify/*`、`/v1/onboarding/*` | `/v3/onboarding/indv/*`、`/v1/onboarding/exchange/verify/detect-face` |
| HTTP 鉴权 | **permitAll**（公开）| **OAuth2 resource server**，`@PreAuthorize("isAuthenticated()")` |
| 凭证来源 | **body 里的 token**（HS256，`regtank2021` 签，内嵌 apiKey/secretKey）+ proxy 的 x-api-key | **Authorization: Bearer RS256**（client_credentials 换的服务令牌）|

**这解释了一切**：
- 托管页能"无登录直连"，是因为它打的是 **permitAll 的 onboarding 后端**，且 token 自带身份；
- 我们移动端代理之所以**必须**补 RS256 Bearer，是因为我们打的是 **OAuth2 保护的 Portal `/v3`**。

> 换句话说：之前第 5 节说的"两套 token"，本质是**两套后端、两条鉴权体系**。verifyLink 的 token 是为 onboarding 后端（permitAll + body token）设计的；它在 Portal `/v3` 上验不过（401），因为 Portal 用的是另一套 OAuth2。

## C. ⚠ 一个值得 Regtank 关注的安全点（顺带提出）

verifyLink 里的 token 是 JWT，其 payload `iss` claim **就是该租户的 `clientSecret`**，而签名只用了**全局硬编码密钥 `regtank2021`**（`CommonUtils.getTokenInfo`/`generateToken`）。这意味着：

- 任何拿到 verifyLink 的人，**无需密钥就能 base64 解出 JWT payload，直接读到我们的 `clientSecret`**；
- 且因为签名密钥是全局固定值 `regtank2021`，理论上可自行签发任意租户的合法 onboarding token。

我们目前把这个 token 当"可公开的一次性会话票据"用（放进 App / 代理 body），是基于"它只在本次 onboarding 有效"的假设。但既然里面其实嵌了 clientSecret，**想请 Regtank 确认这是否符合预期**、是否应改为不内嵌 secret 的随机会话 ID。

## D. 更优接入选项（更新第 6 节的 ASK #2）

既然托管页用的是 **permitAll + body token** 的 onboarding 后端，那移动端最干净的接入其实是：

> **移动端（或我们后端代理）改打托管页同款的 onboarding 后端**（`*-digitalonboarding-*-server` 经 onboarding proxy）的 `/onboarding/*`、`/verify/*` 端点，**只用 verifyLink 的 token（body）**，完全不碰 client_credentials / clientSecret / RS256 Bearer —— 和托管页一模一样。

需要 Regtank 确认的具体问题：
1. 这套 onboarding 后端的 **document-upload / liveness / detect-face / query** 对应端点的**确切路径 + 请求/响应契约**是什么？（我们现在用的是 Portal 的 `/v3/...`，想换成 onboarding 后端的等价端点）
2. 直连这套后端，除了 body 的 token，是否**还需要 proxy 注入的 `x-api-key` / `x-api-secret`**？如果需要，那对移动端来说和"需要 client_secret"是同样的问题（不能进 APK）——这种情况我们仍会保留后端代理，但代理逻辑会简化为"打 onboarding 后端 + 注入 x-api-key"，而不是"换 OAuth token"。
3. 是否有**面向移动端的官方对接方式 / SDK**（仓库里有 `Native_Android_SDK`），直接用它最省事。

> 简言之：**我们已经能跑通（后端代理 + RS256 Bearer 打 Portal /v3），只是想确认有没有"用 verifyLink token 直连 onboarding 后端"这条更轻的官方路径。**

---

*补充整理：SPXpay 技术 · 2026-05-27 · 源码依据 `ClientPortalLivenessOnboarding` / `ClientPortalLivenessBackend`（`WebSecurityConfig`、`IndvController`、`CommonUtils`）/ `ClientPortalLivenessProxy/server.js`，均逐行核对*
