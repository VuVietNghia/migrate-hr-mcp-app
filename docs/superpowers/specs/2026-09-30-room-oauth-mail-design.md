# Room OAuth Mail Design

Ngày: 2026-09-30. Kiến trúc đã được người dùng xác nhận trong hội thoại; tài liệu này ghi lại quyết định đó và các chi tiết triển khai cần thiết. Phạm vi hiện tại là viết plan, chưa triển khai.

## 1. Mục tiêu và phạm vi

Thay EmailJS bằng Gmail API và Microsoft Graph, đi qua Nango Cloud Proxy. Mỗi Room có tối đa một mailbox hoạt động; Room chưa kết nối vẫn dùng được các chức năng HR khác. Mọi thành viên được Hub xác minh trong Room đều được kết nối, thay và ngắt mailbox dùng chung. Không yêu cầu role owner/admin.

Khách hàng bấm kết nối Google Workspace hoặc Microsoft 365, đăng nhập và cấp quyền. Thêm khách hàng hoặc đổi mailbox không sửa env, không restart app. App tiếp tục chạy trong một container Docker trên Ubuntu. Cập nhật code cần build image mới và recreate service bằng Compose.

Không triển khai nhận email/inbox sync, shared mailbox Microsoft/delegation, SMTP, nhiều mailbox cho một Room, tự host Nango, hoặc nhiều replica. Tab Email hiện tại vẫn là lịch sử gửi của HR.

## 2. Global Constraints

- TypeScript strict; code mới không dùng `any`, dữ liệu bên ngoài được parse từ `unknown` bằng Zod.
- Node.js >=22.0.0; giữ React 18, Vitest 2 và SDK PrivOS hiện có trừ khi kiểm tra contract chứng minh cần nâng phiên bản.
- Git chỉ dùng `status`, `diff`, `log`, `show`, `blame`, `rev-parse`; không commit, stage, đổi branch, worktree hoặc chạy script gọi Git ngoài allowlist.
- Chỉ sửa trong project; giữ nguyên các thay đổi Docker/packaging đang có của người dùng.
- Chạy một replica `hr-app`; lock, pending OAuth và queue trong process không hỗ trợ nhiều replica.
- Google/Microsoft OAuth credential nằm tại Nango; Nango API key đọc từ `/run/secrets/nango_api_key`, không đọc giá trị key từ env.
- Backend lấy Room từ `VerifiedActor.roomId`; không nhận tenant, sender hoặc connection tùy ý từ request gửi mail.
- Không trả raw provider/DB errors, token, MIME hoặc nội dung thư vào log/response lỗi production.
- Chỉ dùng App Database thông qua Hub; không thêm MongoClient hoặc truy cập trực tiếp MongoDB của Hub.

## 3. Hiện trạng đã đọc

| Điểm hiện tại | Thay đổi cần thiết |
| --- | --- |
| `src/services/mail/mail-relay-service.ts` gọi EmailJS REST, snapshot env trong constructor | Thay bằng gateway chọn kết nối Room tại runtime |
| `src/mail-tools.ts` giữ singleton relay dùng chung | Singleton runtime quản lý queue theo kết nối, gateway được bind Room |
| `TrackedMailService` đã inject `MailDeliveryGateway` | Giữ boundary này, thêm receipt gửi và xử lý kết quả chưa rõ |
| UI dùng `recordHistory: false` và ghi lịch sử qua user session | Giữ đường này; metadata sender lấy từ receipt backend |
| `createRoomHubToolCaller` dùng installation bot | Cấu hình kết nối cần bot có quyền App DB; không fallback sang dữ liệu UI |
| App DB hiện dùng `registerCollection`, `query`, `create`, `update` | Dùng một record cấu hình Room, index unique; kiểm tra contract trước khi viết adapter |
| Compose chỉ có `image:`, không có `build:` | Build bằng `scripts/build-marketplace-image.sh`, sau đó `docker compose up -d` |

Queue hiện tại fingerprint chỉ gồm recipient/content. Bản mới phải đưa installation, Room, provider, connection và revision vào key để hai Room gửi cùng nội dung không bị gộp.

## 4. Cấu trúc và dependency injection

```text
EmailTab / CV composer / Lifecycle composer
  -> hrm.mail.* tools (verified actor)
     -> MailConnectionService -> AppDbMailConnectionRepository
     -> TrackedMailService -> RoomMailDeliveryGateway
        -> ConnectionMailQueue -> GoogleMailAdapter / MicrosoftMailAdapter
           -> NangoGateway (Proxy) -> provider
```

`mail-runtime.ts` tạo một bộ dependency dùng chung và inject repository, Nango client, hai provider adapter, queue/lock vào services. Việc resolve installation ID dùng helper hiện có; namespace là installation ID + roomId. Không dựa riêng vào roomId khi gửi tag cho Nango vì một Nango environment có thể phục vụ nhiều installation.

Runtime dependency dự kiến: `@nangohq/node`, `@nangohq/frontend`, `nodemailer`, `zod`; dev dependency `@types/nodemailer`. Pin phiên bản đã xác minh tương thích tại lúc triển khai, ghi lockfile. Nodemailer chỉ tạo MIME cho Gmail. Backend Nango API cụ thể được bọc trong một adapter để thay phiên bản SDK không lan ra nghiệp vụ.

## 5. Dữ liệu Room

Collection `hr_mail_connections`, `scope: 'room'`, unique index `{ roomId: 1 }`. Record phẳng, hữu hạn gồm `roomId`, `provider`, `connectionId`, `senderEmail`, `status`, `revision`, `updatedBy`, `updatedAt`. `provider` là `google | microsoft`; `status` là `connected | disconnected | error`. `revision` là UUID mới cho mỗi thay đổi cấu hình. Không có record nghĩa là chưa kết nối; disconnect giữ record với trạng thái disconnected. Email, provider và connectionId cũ chỉ để hiển thị/audit, không được dùng gửi khi disconnected.

Embed metadata mailbox vào một record vì quan hệ 1:1 và được đọc cùng nhau; reference `connectionId` sang Nango vì token có vòng đời và nơi lưu riêng. Không embed lịch sử, token hay mảng kết nối vào record.

Giới hạn: roomId 64, connectionId 256, senderEmail 320, updatedBy 256 ký tự; revision UUID, updatedAt ISO timestamp. Zod loại bỏ khả năng filter injection bằng schema strict; write payload tạo từ whitelist. Query duy nhất theo roomId, limit 1, index `{ roomId: 1 }`; projection chỉ các trường cấu hình trên và `_id`.

**Contract cần xác minh khi triển khai:** repo chưa chứng minh Hub hỗ trợ projection hoặc `$jsonSchema` collection-level. Không tự đặt tên tham số. Task 1 phải ghi bằng chứng contract của Hub; `$jsonSchema` phải do Hub áp dụng bên dưới `registerCollection`. Nếu Hub không hỗ trợ yêu cầu validator/projection, dừng phần repository production và ghi rõ dependency phía Hub; các adapter thuần và test fake vẫn thực hiện được. Không coi Zod hay khai báo `fields` là bằng chứng đã có `$jsonSchema`.

Room members hiện có quyền generic App DB. Vì vậy mapping đọc từ DB cũng phải kiểm tra lại với Nango trước gửi: connection thuộc đúng installation/Room/provider, sender đối chiếu từ provider identity. Sửa trực tiếp DB không được cho phép dùng mailbox Room khác.

## 6. Kết nối, thay và ngắt

Tools mới: `hrm.mail.connection.get`, `.begin`, `.complete`, `.disconnect`. Tất cả yêu cầu verified actor có roomId; không thêm owner guard. `begin` nhận provider và expectedRevision (`null` khi chưa có cấu hình); trả `attemptId`, `sessionToken`, `expiresAt`. `complete` chỉ nhận attemptId và candidateConnectionId từ Connect UI, không nhận senderEmail. `disconnect` nhận expectedRevision.

Backend tạo pending attempt gắn installation, Room, userId, provider, expectedRevision; tối đa 1 attempt/Room và 1000 attempt/process, TTL 10 phút hoặc thời hạn Nango nếu ngắn hơn. Attempt mới hủy quyền activate của attempt cũ. Pending lưu trong RAM, không lưu session token ở App DB/localStorage. Restart bắt đầu OAuth lại; không làm mất mailbox đã active.

Nango session chỉ cho integration đã chọn, với tag do server tạo: `installation_id`, `room_id`, `actor_id`, `attempt_id`. Dùng integration ID cố định `hr-google-mail`, `hr-microsoft-mail`. Nango Connect quản lý callback OAuth. UI event chỉ kích hoạt complete; backend lấy connection metadata không credential qua API list có filter connectionId + tags, limit 2. Chỉ nhận đúng một kết quả và integration ID khớp. Không lấy refresh/access token về app.

Backend lấy sender identity qua Proxy: Google OIDC userinfo với email đã xác minh; Microsoft Graph `/v1.0/me?$select=id,mail,userPrincipalName`, yêu cầu `mail` hợp lệ. Không fallback tùy ý sang UPN. Không gửi test mail tự động trong quá trình kết nối.

Chỉ sau xác minh, lock theo Room, đọc lại revision và ghi replacement trong một update. OAuth bị hủy, hết hạn, thiếu consent hoặc DB thất bại giữ mailbox cũ. Hai thao tác cạnh tranh với cùng revision: chỉ một thao tác thành công, thao tác kia trả `MAIL_CONNECTION_CHANGED`. Lock theo Room được giải phóng/xóa khi không còn waiter.

Disconnect cập nhật trạng thái trước rồi xóa connection tương ứng ở Nango. Xóa Nango thất bại vẫn chặn gửi, trả cleanupPending để người dùng lặp lại disconnect; không báo thành công hoàn toàn. Xóa connection Nango không được mô tả là đã thu hồi consent tại Google/Microsoft. Replacement xóa connection cũ sau khi activate; lỗi cleanup được báo riêng, không rollback mailbox mới. Cleanup chỉ nhắm ID đã xác minh cùng installation/Room, không lấy ID tùy ý từ client. Không có background webhook trong phiên bản này: complete do UI gọi; trạng thái auth được kiểm tra khi mở cấu hình và khi gửi.

Cleanup giữ tối đa một ID/Room và 1000 ID/process; Room đang cleanupPending không nhận replace mới, registry đầy không nhận begin mới. get/disconnect thử lại và dọn entry thành công. Restart mất pending cleanup; runbook đối chiếu các connection có tag với DB để nhận diện orphan, bao gồm OAuth đã hủy nhưng hoàn tất muộn. Không coi cleanup được đảm bảo bền vững qua restart. Reconnect sau revoke dùng quy trình replace mới; lỗi auth hiển thị view status error, lỗi mạng tạm thời không overwrite binding.

## 7. Gửi mail, queue, lịch sử

Giữ giới hạn subject 500, HTML 200000, recipient 320, recipientName 256 ký tự và sanitizer hiện tại. Header subject/name/address từ chối CR/LF. UI không truyền `from` hoặc provider. Google tạo MIME bằng MailComposer rồi base64url vào `raw`; Microsoft dùng JSON HTML và `saveToSentItems: true`. Graph 202 là accepted, không phải bằng chứng delivery. [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [MailComposer](https://nodemailer.com/extras/mailcomposer).

Mỗi connection có queue riêng (một request active, tối đa 20 pending); tổng tối đa 200 pending/process, xóa queue rỗng. Không áp dụng delay EmailJS 1500ms. Deadline từ lúc nhận gửi là 15 giây gồm thời gian chờ queue; hết hạn trước dispatch không gọi provider. Ngay trước dispatch, đọc lại revision dưới Room lock, kiểm tra binding; thay/ngắt cấu hình làm request đang chờ thất bại với `MAIL_CONNECTION_CHANGED`, không chuyển nó sang sender mới. Request đã dispatch được hoàn tất, không hứa thu hồi thư đã gửi. Lock giữ tới khi request active kết thúc, tối đa deadline.

Fingerprint có đầy đủ namespace và revision; chỉ gộp attempt đang pending. Gửi chủ động lần sau vẫn được. Nango Proxy và SDK không tự retry POST gửi mail. 429 trả lỗi rate limit/retryAfter cho UI; timeout/socket/5xx sau dispatch ghi `unknown`, không tự gửi lại vì provider có thể đã nhận. Mất process giữa send và ghi lịch sử không có exactly-once guarantee; phiên bản này không thêm durable outbox.

Budget còn lại được tính sau mỗi await (App DB, lock, metadata và identity). Callback của thao tác read đã timeout không được gửi muộn khi hoàn tất. Timeout trước khi gọi send là failed trước gửi; response thành công nhưng malformed sau dispatch là unknown, không tự gửi lại.

Receipt `accepted` gồm provider, senderEmail, connectionRevision và providerMessageId nếu có. Giữ status legacy `sent` cho accepted và ghi chú UI rõ ý nghĩa; thêm status `unknown` với stage riêng cho hai source. Chỉ failed mới retry. Lịch sử cũ thiếu receipt vẫn đọc được. Retry dùng mailbox hiện tại, UI hiển thị mailbox đó trước thao tác. Send/retry đã accepted nhưng ghi lịch sử lỗi trả `sent_unlogged`/`logged:false`; không ném lỗi kích hoạt resend.

Lỗi domain: `MAIL_NOT_CONFIGURED`, `MAIL_RECONNECT_REQUIRED`, `MAIL_CONNECTION_CHANGED`, `MAIL_CONNECT_EXPIRED`, `MAIL_CONFIGURATION_UNAVAILABLE`, `MAIL_RATE_LIMITED`, `MAIL_QUEUE_FULL`, `MAIL_TIMEOUT_BEFORE_SEND`, `MAIL_SEND_UNKNOWN`, `MAIL_SEND_REJECTED`. Production dùng thông báo đã map; dev log mã, status, correlation ID; không dump object SDK.

## 8. OAuth và hạ tầng

Một Google OAuth app và một Microsoft Entra multitenant app do đơn vị vận hành đăng ký, credential cấu hình trong Nango. Nango không loại bỏ bước cấu hình developer app/consent. Google scopes gửi `https://www.googleapis.com/auth/gmail.send` cộng `openid email` để lấy identity, yêu cầu offline access. Microsoft delegated `Mail.Send`, `User.Read`, `offline_access` (và OIDC scope theo connector). Không yêu cầu mailbox read. Kiểm tra quyền consent thực tế của hai tenant thử nghiệm trước release. [Nango auth setup](https://nango.dev/docs/guides/auth/auth-guide), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Graph get user](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0).

Nango xử lý refresh; app gọi Proxy bằng API key cấp hệ thống. Connect session, list metadata và delete dùng API riêng, không lấy credentials. [Nango session](https://nango.dev/docs/reference/backend/http-api/connect/sessions/create), [Nango list](https://nango.dev/docs/reference/backend/http-api/connections/list), [Nango Proxy](https://nango.dev/docs/guides/platform/proxy-requests), [Token refresh](https://nango.dev/docs/guides/auth/token-refreshing).

Ubuntu Compose thêm secret file `./docker-data/secrets/nango_api_key`, mount vào `/run/secrets/nango_api_key`; file phải đọc được bởi user `node` UID/GID thực tế trong image. Compose file-backed secret là file trên host, không phải secret vault mã hóa. Không bake key vào image. `.env` vẫn phục vụ PrivOS hiện hữu; yêu cầu bỏ env áp dụng credential mail.

Không có key hoặc bot App DB không đủ quyền: HR vẫn khởi động, mail trả `MAIL_CONFIGURATION_UNAVAILABLE`. Không đọc key ở import time. Key được cấp một lần, không đổi theo khách hàng. Không kiểm tra Nango network trong `/ready`; readiness của PrivOS giữ nguyên.

Update Ubuntu: từ thư mục repo có source mới, chạy `bash scripts/build-marketplace-image.sh privos-mcp-app-demo:local` rồi `docker compose up -d --no-deps hr-app`. Script build phải thành công trước up. Compose dùng image mới để recreate; restart đơn thuần không cập nhật source. Giữ bind mount identity và secrets. Manifest mail thay đổi yêu cầu Hub Refresh/phê duyệt nếu digest bị lệch; chỉ `/ready` HTTP 200 mới chứng minh PrivOS ready. SDK local đã có nhánh `MANIFEST_DRIFT` trong `dist/relay/standalone-readiness.js`.

## 9. Tiêu chí nghiệm thu

1. Hai Room dùng Google và Microsoft riêng, gửi cùng nội dung vẫn thành hai request đúng sender.
2. Thành viên thường connect/replace/disconnect được; actor thiếu/sai Room bị chặn.
3. OAuth lỗi không làm mất mailbox cũ; giả candidate/tag hoặc DB mapping Room khác không gửi được.
4. Đổi provider không restart; request đang chờ không gửi nhầm sender sau swap.
5. Token refresh, revoke, rate limit, timeout và accepted-unlogged có kết quả riêng, không tự retry ambiguous send.
6. Unit/integration mock pass, UI thực trên Hub chứng minh popup/CSP hoạt động; ghi rõ phần live chưa chạy.
7. Rebuild/recreate trên Ubuntu giữ identity và mailbox binding; `/ready` 200 sau Hub phê duyệt.
8. Không EmailJS credential trong runtime mail, không token khách hàng trong DB, logs hay frontend bundle.

## 10. Giới hạn bằng chứng

Đã đọc source, compose, Dockerfile và tài liệu provider. Chưa kiểm tra Nango account, Google/Microsoft tenant, bot grant thực tế, Mongo validator của Hub, popup trong Hub hoặc server Ubuntu. Plan phải ghi các gate này riêng với test mock; không tuyên bố đã được xác minh live.
