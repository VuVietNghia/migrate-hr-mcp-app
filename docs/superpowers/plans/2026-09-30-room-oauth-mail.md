# Room OAuth Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Chỉ bắt đầu sau khi người dùng duyệt plan và chọn cách thực hiện.

**Goal:** Thay EmailJS bằng mailbox Google Workspace/Microsoft 365 riêng cho từng Room, kết nối qua Nango và cập nhật app Docker trên Ubuntu.

**Architecture:** Backend chọn mailbox bằng actor Room đã xác minh, inject gateway theo Room vào TrackedMailService. Hai adapter gọi Gmail API hoặc Graph qua Nango Proxy; App DB chỉ lưu metadata. Một container, queue/lock theo kết nối/Room và một Nango secret file cấp hệ thống.

**Tech Stack:** Node.js 22+, TypeScript strict, React 18, PrivOS app-server/app-react, App DB, Nango Node/frontend SDK, Nodemailer MailComposer, Zod, Vitest 2, Docker Compose.

**Spec:** [2026-09-30-room-oauth-mail-design.md](../specs/2026-09-30-room-oauth-mail-design.md). Đọc cả hai tài liệu; spec lưu quyết định hội thoại và chi tiết kỹ thuật đề xuất trong plan này.

## Global Constraints

- TypeScript strict; code mới không dùng `any`, dữ liệu bên ngoài được parse từ `unknown` bằng Zod.
- Node.js >=22.0.0; giữ React 18, Vitest 2 và SDK PrivOS hiện có trừ khi kiểm tra contract chứng minh cần nâng phiên bản.
- Git chỉ dùng `status`, `diff`, `log`, `show`, `blame`, `rev-parse`; không commit, stage, đổi branch, worktree hoặc chạy script gọi Git ngoài allowlist.
- Chỉ sửa trong project; giữ nguyên các thay đổi Docker/packaging đang có của người dùng.
- Chạy một replica `hr-app`; lock, pending OAuth và queue trong process không hỗ trợ nhiều replica.
- Google/Microsoft OAuth credential nằm tại Nango; Nango API key đọc từ `/run/secrets/nango_api_key`, không đọc giá trị key từ env.
- Backend lấy Room từ `VerifiedActor.roomId`; không nhận tenant, sender hoặc connection tùy ý từ request gửi mail.
- Không trả raw provider/DB errors, token, MIME hoặc nội dung thư vào log/response lỗi production.
- Chỉ dùng App Database thông qua Hub; không thêm MongoClient hoặc truy cập trực tiếp MongoDB của Hub.

Không có bước commit dù template skill có yêu cầu; ràng buộc Git của người dùng ưu tiên. Không chạy `npm run preflight`, `npm run verify:fast-pr`, `npm run package` hoặc `tests/packaging.spec.ts`: chúng gọi `package-source.sh --allow-dirty`, hiện dùng Git write-tree/read-tree/add/archive và temp ngoài project. Không sửa packaging ngoài phạm vi để lách giới hạn.

## Review Focus

1. Candidate connection/tag hoặc DB mapping bị tráo sang Room khác: chặn trước provider request (Tasks 2, 4, 5).
2. Hai thành viên thay/ngắt mailbox cùng lúc hoặc OAuth cũ hoàn tất muộn: revision conflict, không ghi đè cấu hình mới (Tasks 4, 5).
3. Timeout sau dispatch và retry accepted nhưng ghi history lỗi: không gửi trùng, không hiển thị thành failed có nút retry (Tasks 3, 5, 6).
4. Đổi Room/unmount UI khi OAuth đang chạy: không gán kết quả vào Room mới, không để spinner/popup treo (Task 7).
5. Recreate container, thiếu secret/bot grant hoặc lệch manifest: giữ identity, mail lỗi có nghĩa, phân biệt `/health` với `/ready` (Tasks 1, 8).

---

## File map và thứ tự

Mọi đường dẫn bên dưới tương đối với `migrate-hr-mcp-app/`. File đang có cần giữ tên và sửa tại symbol nêu rõ, không di chuyển file.

| Task | File tạo mới | Trách nhiệm |
| --- | --- | --- |
| 1 | `src/services/mail/mail-contracts.ts`, `mail-errors.ts`; `docs/mail-platform-contract.md` | Type chung, validation/error, bằng chứng contract Hub |
| 2 | `src/services/mail/mail-connection-repository.ts`, `mail-connection-schema.ts`, `app-db-mail-connection-repository.ts` | Một metadata record/Room và index |
| 3 | `src/services/mail/nango-gateway.ts`, `mail-secret.ts`, `google-mail-adapter.ts`, `microsoft-mail-adapter.ts` | Broker, secret file, provider transport |
| 4 | `src/services/mail/mail-connection-service.ts`, `mail-room-lock.ts`; `src/mail-connection-tools.ts` | OAuth lifecycle và tool auth |
| 5 | `src/services/mail/connection-mail-queue.ts`, `room-mail-delivery-gateway.ts`, `mail-runtime.ts` | Quickswap, queue, wiring |
| 6 | Không thêm service mới | Sửa history/send/retry hiện có |
| 7 | `src/ui/mail-connection/MailConnectionPanel.tsx`, `mail-connection-client.ts`, `mail-connection-controller.ts`, `mail-connection.css` | UI connect/replace/disconnect |
| 8 | `docs/deploy-mail-ubuntu.md` | Compose, manifest và nghiệm thu |

Task 1 -> 2/3 -> 4 -> 5 -> 6 -> 7 -> 8. Không chạy song song task phụ thuộc interface. Plan tạo ra một tính năng mail hoàn chỉnh, không tách thành dự án broker/hạ tầng riêng.

## Task 1: Chốt contract và validation

**Files:** Create các file Task 1 ở bảng; Create `tests/mail-contracts.spec.ts`; Modify `package.json`, `package-lock.json` (Zod).

**Interfaces:** Trong `mail-contracts.ts` định nghĩa:

```ts
type MailProvider = 'google' | 'microsoft';
interface MailScope { installationId: string; roomId: string }
interface MailActor extends MailScope { userId: string }
interface MailConnection {
  roomId: string; provider: MailProvider; connectionId: string;
  senderEmail: string; status: 'connected' | 'disconnected' | 'error';
  revision: string; updatedBy: string; updatedAt: string;
}
interface MailMessage { toName: string; toEmail: string; subject: string; htmlContent: string }
interface MailReceipt {
  status: 'accepted'; provider: MailProvider; senderEmail: string;
  connectionRevision: string; providerMessageId?: string;
}
type MailErrorCode = 'MAIL_NOT_CONFIGURED' | 'MAIL_RECONNECT_REQUIRED'
  | 'MAIL_CONNECTION_CHANGED' | 'MAIL_CONNECT_EXPIRED'
  | 'MAIL_CONFIGURATION_UNAVAILABLE' | 'MAIL_RATE_LIMITED'
  | 'MAIL_QUEUE_FULL' | 'MAIL_TIMEOUT_BEFORE_SEND'
  | 'MAIL_SEND_UNKNOWN' | 'MAIL_SEND_REJECTED';
```

Xuất `parseMailMessage(raw: unknown): MailMessage`, `parseMailConnection(raw: unknown): MailConnection`, `MailError(code: MailErrorCode, retryAfterSeconds?: number)`, `toPublicMailError(error: unknown): { code: MailErrorCode; message: string; retryAfterSeconds?: number }`. Các type/interface trên đều export. File runtime không import type qua UI.

- [ ] **1. Ghi contract platform** vào `docs/mail-platform-contract.md`: schema query/projection, collection validator `$jsonSchema`, index unique, cách user/bot nhận scope, installation ID và verified actor từ SDK. Đọc local SDK/Hub docs hoặc tool schema có sẵn; ghi nguồn và phần chưa có bằng chứng. Kiểm tra cho user thường cùng Room, actor không Room và bot thiếu credential. Nếu validator/projection không có contract, Task 2 production bị chặn đúng lý do; tiếp tục pure interfaces và Tasks 3 mock. Không phát minh API hay đổi backend storage.
- [ ] **2. Viết test validation:** `rejects CRLF headers and unknown keys`, `accepts Vietnamese HTML`, `rejects invalid provider and revision`. Assertions mẫu:

```ts
expect(() => parseMailMessage({ ...validMail, subject: 'A\r\nBcc: b@example.test' })).toThrow();
expect(() => parseMailMessage({ ...validMail, htmlContent: 'x'.repeat(200001) })).toThrow();
expect(() => parseMailMessage({ ...validMail, connectionId: 'foreign' })).toThrow();
expect(parseMailMessage(validMail)).toEqual(validMail);
expect(toPublicMailError(new Error('secret-value'))).toEqual({
  code: 'MAIL_CONFIGURATION_UNAVAILABLE', message: 'Chức năng email chưa được cấu hình đầy đủ.',
});
```

- [ ] **3. Chạy đỏ:** `npx vitest run tests/mail-contracts.spec.ts`; FAIL vì module chưa tồn tại.
- [ ] **4. Implement** các signature trên bằng Zod strict, giới hạn chính xác spec §5/7. Map từng domain error thành copy tiếng Việt; unknown error dùng message trong test. Install dependency với cache nằm trong project, pin version Node 22 compatible; không đặt cache ngoài scope.
- [ ] **5. Chạy xanh:** cùng test và `npm run typecheck`; PASS. Nếu có lỗi baseline không liên quan, ghi bằng chứng riêng; không đổi type strict để che lỗi.

## Task 2: Repository cấu hình mailbox

**Files:** Create ba file repository/schema ở bảng; Create `tests/mail-connection-repository.spec.ts`.

**Interfaces:** Consumes `MailScope`, `MailConnection`, `HubToolCaller`. Produces:

```ts
interface MailConnectionRepository {
  read(scope: MailScope): Promise<MailConnection | null>;
  write(scope: MailScope, connection: MailConnection): Promise<void>;
}
// Constructor injection; scope passed on every operation.
// AppDbMailConnectionRepository(callerFactory: (roomId: string) => HubToolCaller)
```

`mail-connection-schema.ts` export `MAIL_CONNECTION_COLLECTION`, `MAIL_CONNECTION_FIELDS`, `MAIL_CONNECTION_INDEXES`, `MAIL_CONNECTION_JSON_SCHEMA`. Schema JSON là contract validator, chỉ truyền qua API Hub đã được Task 1 xác minh.

- [ ] **1. Viết tests:** `reads exactly one scoped record`, `registers unique room index`, `fails closed on malformed record`, `propagates permission errors`, `duplicate create rereads same room`. Fixture fake Hub capture args; assertions:

```ts
expect(registerArgs.scope).toBe('room');
expect(registerArgs.indexes).toEqual([{ fields: { roomId: 1 }, unique: true }]);
expect(queryArgs.where).toEqual([{ field: 'roomId', op: '==', value: 'room-a' }]);
expect(queryArgs.limit).toBe(1);
expect(await repo.read(scopeWithoutRecord)).toBeNull();
await expect(repo.write(scopeA, connectionForB)).rejects.toThrow();
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/mail-connection-repository.spec.ts`; FAIL module/import hoặc assertion.
- [ ] **3. Implement repository** với query index `{roomId:1}`, projection theo contract Task 1, parse output `unknown`, whitelist write. Read chỉ coi collection missing là null, không nuốt permission/network errors. Register lazy khi write; chỉ race duplicate-key được reread, không catch mọi create error rồi update. Chỉ một record hữu hạn, không N+1 hoặc unbounded array; single-record writes không cần bulkWrite. Lock/revision do Task 4 đảm nhiệm, repository không hứa CAS của Mongo.
- [ ] **4. Chạy xanh:** test trên; thêm fixture chứng minh mapping room-b nằm trong response room-a bị reject. Xác minh validator collection ở Hub staging qua bằng chứng được cấp; chưa có quyền live thì ghi gate chưa chạy, không gọi direct Mongo.

## Task 3: Nango và hai provider adapter

**Files:** Create các file Task 3; Modify `package.json`, `package-lock.json`; Create `tests/mail-secret.spec.ts`, `tests/nango-gateway.spec.ts`, `tests/mail-provider-adapters.spec.ts`.

**Interfaces:** Consumes Task 1. Produces:

```ts
interface ConnectionTags {
  installation_id: string; room_id: string; actor_id: string; attempt_id: string;
}
interface ConnectSession { sessionToken: string; expiresAt: string }
interface BrokerConnection {
  connectionId: string; integrationId: string; tags: ConnectionTags;
  authError: boolean;
}
interface ProxyRequest {
  provider: MailProvider; connectionId: string; method: 'GET' | 'POST';
  endpoint: string; data?: unknown; timeoutMs: number;
}
interface ProxyResponse { status: number; data: unknown; retryAfterSeconds?: number }
interface NangoGateway {
  createSession(provider: MailProvider, tags: ConnectionTags): Promise<ConnectSession>;
  findConnection(scope: MailScope, provider: MailProvider,
    connectionId: string, timeoutMs: number): Promise<BrokerConnection | null>;
  proxy(request: ProxyRequest): Promise<ProxyResponse>;
  deleteConnection(provider: MailProvider, connectionId: string): Promise<void>;
}
interface MailProviderAdapter {
  identity(connectionId: string, timeoutMs: number): Promise<string>;
  send(connection: MailConnection, message: MailMessage,
    timeoutMs: number): Promise<MailReceipt>;
}
```

`FileMailSecret.read(): Promise<string>` và `NangoSdkGateway` nhận injected key reader + SDK client factory; `GoogleMailAdapter`/`MicrosoftMailAdapter` nhận NangoGateway. Type common trong `mail-contracts.ts`, gateway-specific trong `nango-gateway.ts`; adapter interface cũng ở `mail-contracts.ts`. Control-plane calls dùng tối đa 15000ms; send-path truyền budget còn lại vào metadata, identity rồi send. Google userinfo endpoint cố định là `https://openidconnect.googleapis.com/v1/userinfo`, Gmail send là `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`; broker map host theo allowlist endpoint phía server.

- [ ] **1. Viết tests:** secret rỗng/ENOENT/EACCES -> domain error, không echo key; session restricted integration + server tags; list filter exact namespace và không credential retrieval; provider fixtures Google MIME/Vietnamese, Microsoft 202 empty body; unknown payload/429/5xx/timeout. Assertions:

```ts
expect(sessionRequest.allowed_integrations).toEqual(['hr-google-mail']);
expect(sdkProxyOptions.retries).toBe(0);
expect(graphRequest.endpoint).toBe('/v1.0/me/sendMail');
expect(graphRequest.data.saveToSentItems).toBe(true);
expect(graphReceipt.status).toBe('accepted');
expect(graphReceipt.providerMessageId).toBeUndefined();
expect(decodedMime).toContain('From: hr@example.test');
expect(sendCallCountAfterTimeout).toBe(1);
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/mail-secret.spec.ts tests/nango-gateway.spec.ts tests/mail-provider-adapters.spec.ts`.
- [ ] **3. Implement broker/secret**; install pin `@nangohq/node`, `nodemailer`, `@types/nodemailer`. Read secret lazy, trim cuối file, không env fallback. `findConnection` dùng metadata list, filter namespace + connectionId, limit 2, kiểm integration và exact ID; ambiguous -> fail. API URLs/base URLs/integration IDs là server allowlist, không nhận client override. Network timeout tối đa 15000ms; zero automatic send retry. Response/schema của version SDK đã pin phải khớp docs; không dùng deprecated credential endpoint.
- [ ] **4. Implement adapters** theo spec §6/7, fixed Google userinfo/Gmail endpoints và Graph me/sendMail. Google userinfo yêu cầu verified email; Graph thiếu `mail` -> reject. Gmail MIME tạo bằng MailComposer (disableFileAccess/disableUrlAccess), encode base64url; Graph JSON dùng HTML. Verify địa chỉ sender từ identity; map auth failure, 429 và ambiguous send riêng. HTTP 2xx Google yêu cầu response id; 202 Graph không JSON.parse body trống.
- [ ] **5. Chạy xanh:** tests trên + typecheck. Test raw SDK Error có headers/body chứa giả secret/PII: response/log không chứa những giá trị đó.

## Task 4: OAuth lifecycle và tools

**Files:** Create các file Task 4; Modify `src/mcp-message-handlers.ts` tại imports, tools/list và tools/call dispatch; Create `tests/mail-connection-service.spec.ts`, `tests/mail-connection-tools.spec.ts`.

**Interfaces:** Consumes Tasks 1–3. `MailRoomLock.run<T>(scope: MailScope, action: () => Promise<T>): Promise<T>` serialize theo namespace và dọn lock idle. `MailConnectionService` inject repository, broker, adapters `Readonly<Record<MailProvider, MailProviderAdapter>>`, lock, clock và UUID factory. Public methods:

```ts
type ConnectionView = { connection: MailConnection | null; cleanupPending: boolean };
type BeginResult = ConnectSession & { attemptId: string };
// get(actor: MailActor): Promise<ConnectionView>
// begin(actor: MailActor, provider: MailProvider, expectedRevision: string | null): Promise<BeginResult>
// complete(actor: MailActor, attemptId: string, candidateConnectionId: string): Promise<ConnectionView>
// disconnect(actor: MailActor, expectedRevision: string): Promise<ConnectionView>
```

Export `ConnectionView`, `BeginResult` tại `mail-contracts.ts` để frontend chỉ import types, không kéo server dependencies vào bundle; `ConnectSession` cũng đặt ở đó. Tools export `MAIL_CONNECTION_TOOL_DEFINITIONS`, `isMailConnectionTool`, `handleMailConnectionTool(name: MailConnectionToolName, rawArgs: unknown, actor: VerifiedActor | undefined)`, typed result như các mail tools hiện có; `MailConnectionToolName` là union bốn tên trong spec. Giải quyết installation qua `resolve-own-mcp-app-id.ts`; service nhận MailActor đã chuẩn hóa. Không tự coi client context userRoles là chứng minh quyền.

- [ ] **1. Viết tests:** member không owner được thao tác; missing actor/wrong Room bị chặn; candidate foreign room/install/provider/attempt/user bị reject; expired/superseded complete không write; cancelled OAuth giữ old; hai complete cùng revision chỉ một write; disconnect làm mail inactive cả khi Nango delete lỗi. Assertions:

```ts
await expect(service.complete(actorA, attemptA, foreignConnection)).rejects.toThrow();
expect(repo.write).not.toHaveBeenCalled();
expect((await service.get(actorA)).connection?.connectionId).toBe('old');
expect(successfulConcurrentChanges).toHaveLength(1);
expect(disconnectResult.connection?.status).toBe('disconnected');
expect(disconnectResult.cleanupPending).toBe(true);
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/mail-connection-service.spec.ts tests/mail-connection-tools.spec.ts`.
- [ ] **3. Implement lifecycle** theo spec §6: pending TTL/cap, latest attempt wins, validate candidate qua metadata + identity trước active write; lock và reread revision. Tất cả mutation recheck actor binding. Nango session token chỉ trả cho người khởi tạo qua tool UI, không log/store persistent. Hủy/timeout chỉ bỏ attempt chưa active; background mail cũ tiếp tục. get kiểm tra metadata/identity: auth revoke trả view status error và cho begin tạo connection mới để kết nối lại; outage tạm thời trả safe error, không overwrite binding. Reauthorization dùng replace qua begin/complete, không mutate token của connection cũ đang dùng.
- [ ] **4. Implement cleanup bounded:** giữ tối đa một cleanup connection/Room và 1000/process trong RAM, không nhận thêm replace trong Room đang cleanupPending; không nhận begin mới khi registry hết chỗ. get/disconnect thử cleanup lại, xóa entry khi thành công. Delete Nango 404 coi là đã xóa. Nếu restart làm mất cleanup RAM, operational runbook đối chiếu Nango tagged connections với active DB record để xóa orphan có xác minh; không thêm scheduler hoặc scan toàn bộ khi gửi. Session hủy/hết hạn cũng có thể tạo orphan Nango nếu OAuth hoàn tất muộn; không activate, xử lý bằng cùng runbook.
- [ ] **5. Wire tools** vào existing dispatcher, chưa thay relay gửi. Không thêm HTTP OAuth callback hay webhook route vào app; Nango callback + backend verification qua complete đủ cho bản này.
- [ ] **6. Chạy xanh:** tests trên + `tests/mcp.spec.ts`; assert no-owner user allowed, shutdown/pending expiry và replay complete bị từ chối. Service error trả safe code/message, không raw DB error.

## Task 5: Queue và gateway quickswap

**Files:** Create các file Task 5; Modify `src/mail-tools.ts` tại singleton/dependencies, `src/services/mail/tracked-mail-service.ts` tại delivery interface/import/call sites; Modify `src/services/mail/mail-relay-service.ts` thành deprecated type re-export nếu còn consumers, loại bỏ EmailJS transport; Create `tests/room-mail-delivery.spec.ts`, `tests/connection-mail-queue.spec.ts`; Update `tests/mail-tools.spec.ts`, `tests/tracked-mail-service.spec.ts`, `tests/mail-relay-service.spec.ts`.

**Interfaces:** Consumes repository/broker/adapters/lock. `MailDeliveryGateway.queueMail(message: MailMessage): Promise<MailReceipt>`; `RoomMailDeliveryGateway(scope, repository, broker, adapters, queue, lock)` implements gateway. `ConnectionMailQueue.enqueue(key: string, fingerprint: string, deadline: number, task: (remainingMs: number) => Promise<MailReceipt>): Promise<MailReceipt>`. `createTrackedMail(roomId: string): Promise<TrackedMailService>` trong runtime resolve installation và trả room-bound service; đổi dependency seam sang async và await tại mọi caller/test. Export `getMailConnectionService(): MailConnectionService` từ cùng runtime để Task 4 tools dùng chung broker/lock với send path.

- [ ] **1. Viết tests:** identical content hai Room -> hai sends; same pending scope/revision -> một send; subsequent intentional resend -> hai; queued request khi revision đổi -> không dispatch; slow Room A không chặn B; cap/deadline và cleanup queue. Assertions:

```ts
expect(providerCalls.map(call => call.connectionId).sort()).toEqual(['conn-a', 'conn-b']);
expect(samePendingProviderCalls).toHaveLength(1);
await expect(queuedBeforeSwap).rejects.toMatchObject({ code: 'MAIL_CONNECTION_CHANGED' });
expect(providerCalledAfterQueueDeadline).toBe(false);
expect(idleQueueRegistrySize).toBe(0);
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/room-mail-delivery.spec.ts tests/connection-mail-queue.spec.ts`.
- [ ] **3. Implement queue** limits/deadline trong spec, namespaced fingerprint hash; registry và pending map được dọn trong finally. Không sửa generic TaskQueue ngoài phạm vi; queue mail mới typed receipt riêng tránh thêm `any`. Đặt timeout thật trên HTTP để hết deadline giải phóng lock/queue.
- [ ] **4. Implement gateway/runtime**: read binding, queue với captured revision; ngay trước dispatch lock/reread/verify Nango tags và provider identity, rồi gửi với budget còn lại. Recompute remainingMs sau mỗi await; DB/lock wait hết hạn phải đánh dấu job cancelled và kiểm lại trước send, kể cả DB call cũ hoàn tất muộn. Timeout metadata/identity trước send không phải `MAIL_SEND_UNKNOWN`. `recordHistory:false`, send và retry đều dùng gateway cùng Room. Production wiring inject singleton broker/queue/lock, tuyệt đối không default sang EmailJS khi Room chưa kết nối.
- [ ] **5. Chạy xanh:** tests trên và mail-tools/tracked-mail/mail-relay tests; thay tests EmailJS đã obsolete bằng assertion transport mới không đọc EMAILJS env. Giữ tests sanitizer/auth/size/resend; không xóa test để che regression.

## Task 6: Kết quả gửi và lịch sử tương thích

**Files:** Modify `src/services/mail/email-history-model.ts`, `email-history-repository.ts`, `tracked-mail-service.ts`, `src/mail-tools.ts`, `src/ui/email-history/user-session-tracked-mail.ts`, `email-history-service.ts`, `EmailMailboxView.tsx`, `src/ui/cv-scored/invite-mail-status.ts`, `invite-sent-outcome.ts`; Update `tests/email-history-model.spec.ts`, `email-history-repository.spec.ts`, `tracked-mail-service.spec.ts`, `user-session-tracked-mail.spec.ts`, `invite-sent-outcome.spec.ts`.

**Interfaces:** History status thêm `unknown`; fields optional `provider`, `senderEmail`, `connectionRevision`, `providerMessageId`. Sửa type hiện có `SendTrackedMailOutcome` thành union `{status:'sent'; record:EmailHistoryRecord; receipt:MailReceipt} | {status:'sent_unlogged'; receipt:MailReceipt}`. Tracked `send` và `retry` trả union này; deliver trả receipt. UI `UiMailSendResult` thêm optional receipt, retry trả `Promise<UiMailSendResult>`. Tool JSON giữ legacy `itemId/status/requestedBy` và thêm receipt; unknown lỗi có code `MAIL_SEND_UNKNOWN` để UI ghi stage unknown. Tool error chứa JSON `{code,message,retryAfterSeconds?}` trong text; client mail parse thành MailError qua helper `parseMailToolResult(raw: unknown): unknown` tại `src/ui/email-history/user-session-tracked-mail.ts`, không dựa vào so khớp chuỗi message.

- [ ] **1. Viết tests:** legacy row không receipt vẫn đọc; unknown không retry; two new unknown stages được thêm vào store cũ đúng một lần; server/UI retry accepted + markSent failure là unlogged. Assertions:

```ts
expect(parseEmailHistoryItem(legacyRow, stages)?.status).toBe('sent');
expect(canRetryEmail(unknownRecord)).toBe(false);
expect(await uiMail.retry('room-a', 'item-1')).toMatchObject({ logged: false });
expect(providerSend).toHaveBeenCalledTimes(1);
expect(createdUnknownStages).toHaveLength(2);
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/email-history-model.spec.ts tests/email-history-repository.spec.ts tests/tracked-mail-service.spec.ts tests/user-session-tracked-mail.spec.ts tests/invite-sent-outcome.spec.ts`.
- [ ] **3. Implement** additive custom fields + stage migration; tìm contract `mcpapp.stages.*` hiện có trong `tools_lists.md`, chỉ thêm allowlist cần thiết ở `src/services/hub-tool-caller.ts` và tests nếu đã xác minh Hub support. Hai stage mới tên `Email Phỏng vấn - Chưa rõ kết quả`, `Email Nhân sự - Chưa rõ kết quả`. Không xóa/chuyển lịch sử cũ; migration idempotent, giữ đường user-session. Nếu Hub chưa cho thêm stage, đây là gate release, không đẩy unknown vào failed.
- [ ] **4. Implement result mapping** tại send/retry/composer/history; Graph accepted ghi sent với copy `Nhà cung cấp đã tiếp nhận yêu cầu gửi.`; unknown copy `Chưa xác định được kết quả gửi. Kiểm tra thư đã gửi trong tài khoản email trước khi gửi lại.`. Không bật retry cho unknown. Receipt do server tạo, UI chỉ dùng để ghi metadata; sanitize lỗi trước history/log. Chặn sai sender trong history bằng lấy identity verified.
- [ ] **5. Chạy xanh:** bộ test Task 6 và `tests/mail-tools.spec.ts`; search `retry(` trong UI email/cv/lifecycle để cập nhật tất cả consumers của return type. Failed rõ ràng vẫn retry từ stored content bằng mailbox hiện tại; accepted-unlogged không đổi invite outcome thành failed.

## Task 7: UI cấu hình mailbox Room

**Files:** Create bốn file Task 7; Modify `src/ui/email-history/EmailTab.tsx`, `EmailMailboxView.tsx` để đặt panel và hiển thị sender khi retry; Modify `package.json`, `package-lock.json` (`@nangohq/frontend`); Create `tests/mail-connection-controller.spec.ts`, `tests/mail-connection-client.spec.ts`.

**Interfaces:** `MailConnectionClient` inject `Pick<McpApp,'callServerTool'>`, parse safe tool result; methods `get(): Promise<ConnectionView>`, `begin(provider, expectedRevision): Promise<BeginResult>`, `complete(attemptId, candidateConnectionId): Promise<ConnectionView>`, `disconnect(expectedRevision): Promise<ConnectionView>`. Client bind roomId từ context. `MailConnectionController` inject client và Connect launcher; dùng state discriminated union `loading | ready | connecting | error`, generation guard Room/unmount. `MailConnectionPanel({roomId,active})` nối controller với React.

- [ ] **1. Viết tests controller/client:** click provider -> restricted begin; connect event -> complete rồi reload; close/cancel -> giữ old; switch Room -> bỏ stale event; error result MCP không được parse thành success; member thường không bị role gate. Assertions:

```ts
expect(client.begin).toHaveBeenCalledWith('google', oldRevision);
expect(client.complete).toHaveBeenCalledWith(attemptId, candidateConnectionId);
expect(newRoomState.connection).toEqual(roomBConnection);
expect(staleCompletionApplied).toBe(false);
expect(stateAfterPopupClose.kind).toBe('ready');
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/mail-connection-controller.spec.ts tests/mail-connection-client.spec.ts`.
- [ ] **3. Implement UI** với copy `Tài khoản gửi email của Room`, `Kết nối Google`, `Kết nối Microsoft`, `Thay tài khoản`, `Ngắt kết nối`. Hiển thị mailbox chung cho Room, provider, trạng thái, last updated; không lộ connectionId/token. Mở Connect UI từ click trước khi await session để tránh popup blocker; event chỉ là candidate. Giữ token trong RAM, clear khi đóng; không log event payload. Khởi tạo lại panel theo roomId. Nếu iframe không hỗ trợ Connect UI, ghi lỗi rõ và kiểm tra host CSP/popups ở live gate, không bật wildcard CSP.
- [ ] **4. Chạy xanh** tests trên, UI shell và invite tests. Live Hub: user thường kết nối từng provider, đổi Room khi popup mở, cancel replacement, disconnect; xác minh consent + sender sau reload. Chỉ gửi test mail khi người dùng chỉ định mailbox nhận thử; không gửi tự động lúc connect.

## Task 8: Docker Ubuntu, manifest và nghiệm thu

**Files:** Modify `compose.yaml`, `privos-app.json`, `README.md`, `PRIVACY.md`, `SCOPES.md`, `.env.example`, `CHANGELOG.md`; Inspect/preserve `Dockerfile`, `.dockerignore`, `.gitignore`, `scripts/build-marketplace-image.sh`; Create `docs/deploy-mail-ubuntu.md`; Update `tests/manifest.spec.ts`, `tests/mail-tools.spec.ts`, `tests/runtime-security.spec.ts`; Create `tests/mail-container-config.spec.ts`.

**Interfaces:** Nango secret file path Task 3; tools schema Task 4/6; existing manifest builder and Docker build script. Không thêm Nango/Redis/Mongo service vào Compose.

- [ ] **1. Viết tests:** canonical manifest có connection tools và `recordHistory`, không còn EMAILJS env; secret lazy missing không crash import/HR; compose secret mount chính xác và identity mount giữ nguyên. Assertions:

```ts
expect(manifest.env.some(entry => entry.key.startsWith('EMAILJS_'))).toBe(false);
expect(manifest.tools.map(tool => tool.name)).toContain('hrm.mail.connection.complete');
expect(await mailWithMissingSecret()).toMatchObject({ code: 'MAIL_CONFIGURATION_UNAVAILABLE' });
expect(composeText).toContain('./docker-data/identity:/run/privos/identity');
expect(composeText).toContain('file: ./docker-data/secrets/nango_api_key');
```

- [ ] **2. Chạy đỏ:** `npx vitest run tests/mail-container-config.spec.ts tests/manifest.spec.ts tests/runtime-security.spec.ts`.
- [ ] **3. Patch Compose** thêm `services.hr-app.secrets: [nango_api_key]` và top-level secret file. Giữ image/port/identity/runtime hardening. Dockerfile giữ multi-stage, production dependencies cho backend; frontend SDK được bundle. Xác minh ignore docker-data/secret artifacts trong build context; không tạo key thật trong repo. Không sửa `HRM_SMTP_PASSWORD` placeholder ngoài mail scope trừ có consumer đã xác minh cần đổi.
- [ ] **4. Đồng bộ manifest/docs**: tools runtime/publisher giống nhau, remove bốn EMAILJS fields, ghi Nango/Google/Microsoft external destinations đúng schema manifest SDK, data-policy date và data flow thực. Update scope reasons cho mail settings và bot grants (không đoán `executionContext` mới). `.env.example` không thêm mail secret. Changelog Unreleased mô tả migration; không publish/bump release tùy ý. Ghi rõ SDK/schema mismatch nếu lint fail sẵn.
- [ ] **5. Viết runbook Ubuntu**: operator đăng ký OAuth apps/Nango integrations, cấp consent, bot DB grants, tạo host secret dưới docker-data với quyền user node đọc được (xác minh UID/GID image), không paste key vào chat/log; secret file-backed không mã hóa host. Tài liệu gồm kiểm tra iframe/CSP, orphan cleanup theo namespace, refresh key qua recreate và checklist Google/Microsoft sender/Sent Items. Không thực hiện thao tác tài khoản ngoài app trong task viết plan.
- [ ] **6. Kiểm tra local được phép**, từ repo root:

```sh
npm run typecheck:strict-unused
npx vitest run --exclude tests/packaging.spec.ts
npm run build
node ../marketplace-readiness-kit/manifest-precheck.mjs privos-app.json
docker compose config --quiet
```

Expected: từng command exit 0. Trước suite kiểm tra tests khác không spawn script Git bị cấm. Compose cần secret file được provision; không tạo production key giả để báo ready. Báo baseline failure riêng, không tuyên bố full preflight đã pass.

- [ ] **7. Kiểm tra build/recreate Ubuntu** trên môi trường được cấp quyền, source mới đã được đưa tới repo bằng quy trình của người dùng:

```sh
bash scripts/build-marketplace-image.sh privos-mcp-app-demo:local
docker compose up -d --no-deps hr-app
docker compose ps
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

Chạy tuần tự, dừng nếu build fail; không tự chạy `up` với image cũ. `/ready` 503 `MANIFEST_DRIFT`: Hub admin Refresh/phê duyệt manifest mới rồi kiểm tra lại. Chụp bằng chứng mount tồn tại, sender binding còn đúng sau recreate; không in nội dung identity/key. Không `down -v`, prune, xóa host data hoặc thao tác Git remote. Nếu chưa có quyền server, runbook hoàn tất và ghi live deployment chưa chạy.

- [ ] **8. Nghiệm thu**: hai Room khác provider gửi cùng nội dung tới địa chỉ thử được chỉ định, verified sender khác nhau; revoke và reconnect; member thường quản lý mailbox; accepted-unlogged và unknown không resend; secrets không hiện trong responses/bundle/log; phân biệt test mock/local với live. Ghi bằng chứng và các gate chưa đạt trong `docs/deploy-mail-ubuntu.md`.

## Tự kiểm tra plan

| Yêu cầu spec | Task |
| --- | --- |
| Strict types, boundaries và Hub contract | 1–2 |
| OAuth broker, API gửi và secret ngoài env | 3–4 |
| Mọi member, một mailbox/Room, namespace và quickswap | 2, 4–5 |
| Queue, timeout, không resend ambiguous, tương thích history | 5–6 |
| UI connect/cancel/switch Room | 7 |
| Ubuntu Compose update, identity, manifest/readiness | 8 |

Không yêu cầu người dùng duyệt lại lựa chọn đã chốt. Chi tiết concurrency, identity verification, trạng thái unknown và gate Hub được nêu rõ để review cùng plan. Phương thức thực hiện chưa được chọn; đề xuất Native vì các task dùng chung contract và lần lượt phụ thuộc nhau. Khi duyệt xong mới dùng executing-plans hoặc subagent-driven-development theo lựa chọn người dùng.
