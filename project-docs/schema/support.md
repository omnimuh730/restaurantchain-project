# Schema · Support

Customer or restaurant-staff support chat. Messages are **embedded** on the conversation. Help-center articles live in `[metadata](./metadata.md)` under `_id: "support_articles"`.

Source READMEs:

- `reservation/Profile/README.md` (Profile → Help & Support)
- `pos/Settings/README.md` (Settings → Support; restaurant-side analogue)

## Collection


| Collection              | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `support_conversations` | A single chat thread between one user (customer or staff) and the support team. Embeds messages. |


---

## `support_conversations`

```ts
type SupportConversation = {
  _id: ObjectId;

  subjectKind: "customer" | "staff";
  customerUserId?: ObjectId;
  staffUserId?: ObjectId;
  restaurantId?: ObjectId;          // populated for staff or for tenant-tagged customer issues

  topic?: string;                   // captured from "How can we help today?"
  subject?: string;                 // first message subject line, optional

  status: "open" | "pending_user" | "pending_agent" | "resolved" | "closed";
  priority?: "low" | "normal" | "high" | "urgent";

  // Channel
  channel: "in_app_chat" | "email" | "phone";

  // Assigned support agent (internal team; modeled in your CRM, not here)
  assignedAgentId?: string;

  // Linked context (for "what is this about?")
  context?: {
    reservationId?: ObjectId;
    orderId?: ObjectId;
    paymentId?: ObjectId;
    articleSlug?: string;           // metadata.support_articles.items[].slug
  };

  // Counters for fast list rendering
  messageCount: number;
  unreadByUser: number;
  unreadByAgent: number;
  lastMessageAt: Date;
  lastMessagePreview?: string;

  // ---- Embedded: Messages ----
  // Bounded by support reality (typical thread: 5–50 messages).
  // If a thread approaches 500+, archive older messages to a cold collection.
  messages: Array<{
    _id: ObjectId;
    senderKind: "user" | "agent" | "system";
    senderId?: ObjectId;            // user id or internal agent id (string at storage time)
    body: string;
    attachments?: Array<{
      kind: "image" | "file";
      url: string;
      mime?: string;
      size?: number;
      filename?: string;
    }>;
    readByUserAt?: Date;
    readByAgentAt?: Date;
    sentAt: Date;
  }>;

  // Audit
  openedAt: Date;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  rating?: 1 | 2 | 3 | 4 | 5;       // optional CSAT
  ratingComment?: string;

  createdAt: Date;
  updatedAt: Date;
};
```

### Indexes

- `{ customerUserId: 1, status: 1, lastMessageAt: -1 }`
- `{ staffUserId: 1, status: 1, lastMessageAt: -1 }`
- `{ restaurantId: 1, status: 1, lastMessageAt: -1 }`
- `{ status: 1, priority: 1, lastMessageAt: -1 }`        // agent queue
- `{ assignedAgentId: 1, status: 1 }`
- `{ "context.reservationId": 1 }`
- `{ "context.orderId": 1 }`

### State diagram

```text
open ─agent reply─▶ pending_user ─user reply─▶ pending_agent ─agent reply─▶ pending_user
any ─resolve──▶ resolved ─reopen──▶ pending_agent
any ─close (auto-after 7d)──▶ closed
```

### Realtime channels

- `support.conversation.created`
- `support.message.created` (per row)
- `support.conversation.updated` (status, assignment)

---

## Cross-document rules

- A new message updates `messageCount`, `lastMessageAt`, `lastMessagePreview`, and the appropriate `unreadByUser`/`unreadByAgent` counter atomically with the `$push` to `messages[]`.
- `messages[].body` should be capped (e.g. ≤ 8 KB) to keep the conversation document well under the 16 MB limit even at 1000+ messages with attachments referenced by URL.
- Help-center search reads from `metadata.support_articles` (no separate collection); selecting an article and tapping "Contact Support" opens a new `support_conversations` row with `context.articleSlug` set.
- `Mark as read` from the user side sets `readByUserAt` on each message ≤ the latest message and zeroes `unreadByUser`.
- `assignedAgentId` is a foreign reference to your internal CRM/agent system — not modeled in MongoDB here.

