# Data model

Azure Cosmos DB, SQL API. Database name comes from `COSMOS_DB_NAME` and defaults to
**`sprintdeck`**. Containers are created on demand with `createIfNotExists`, partitioned on
`/id`, so there is no provisioning step before first use.

## Containers

| Container | Holds |
|---|---|
| `users` | Accounts, plans, orders, receipts, name reservations, password-reset tokens |
| `sessions` | Planning-poker rooms |
| `retros` | Retrospective boards |
| `whiteboards` | Whiteboard documents |
| `migrations` | Ledger of applied migrations |

`users` is deliberately mixed. Documents are told apart by a `type` field and an id prefix, so
one container serves several record kinds without cross-container transactions.

| Document | id | `type` |
|---|---|---|
| Account | `google:you@example.com` | *(none)* |
| Order | `order:<uuid>` | `order` |
| Receipt | `receipt:<uuid>` | `receipt` |
| Name reservation | `name:<nameLower>` | `name-reservation` |
| Reset token | `<random hex>` | `reset-token` |

## Account

The primary record. **Its `id` is the account id**, which carries the provider that
authenticated it — `google:`, `microsoft:`, or no prefix for a password account.

```json
{
  "id": "google:you@example.com",
  "email": "you@example.com",
  "name": "Rajeev Reddy",
  "nameLower": "rajeev reddy",
  "authProvider": "google",
  "providerSub": "113696058139197639713",
  "createdAt": 1789928890330,

  "tier": "master",
  "lifetime": true,
  "planGrantedAt": 1789928831178,
  "planExpiresAt": null
}
```

| Field | Notes |
|---|---|
| `id` | Account id; also the partition key. Immutable |
| `email` | Lower-cased. **Not** unique across documents — one per provider is expected |
| `nameLower` | Backs the uniqueness check; mirrored by a `name:` reservation document |
| `authProvider` | `google`, `microsoft` or `local` |
| `providerSub` | The provider's subject claim; a mismatch on re-authentication is rejected |
| `salt`, `passwordHash` | Password accounts only. scrypt |
| `tier` | `free`, `pro`, `expert`, `master`. Absent means free |
| `lifetime` | `true` never expires. Honoured only for addresses in `LIFETIME_ALLOWLIST` |
| `planExpiresAt` | Epoch ms; `null` for lifetime. Past ⇒ reported as free |

**Granting a plan** is an edit to those four fields. There is no second document to create and
no cross-reference to maintain. `node scripts/grant-plan.mjs google:you@example.com master
--lifetime` prints them, or applies them with `--write`.

## Order

A purchase attempt. Records what was bought; does not itself confer access.

```json
{
  "id": "order:0bc45877-86e4-47cd-8ffb-7e7978a9f494",
  "type": "order",
  "tier": "pro",
  "accountId": "google:you@example.com",
  "email": "you@example.com",
  "baseAmount": 199,
  "payAmount": 199.03,
  "status": "pending",
  "utr": null,
  "receiptId": null,
  "createdAt": 1789928890330,
  "confirmedAt": null,
  "seq": 12
}
```

`payAmount` carries a unique paise suffix so an incoming bank credit can be matched to exactly
one pending order. `status` moves `pending → confirmed` when a matching credit arrives, and
that transition writes the tier onto `accountId`.

## Receipt

A bank credit notification, whether or not it matched.

```json
{
  "id": "receipt:ac3f0b05-11e8-44b5-9f31-7c95abd1f0e9",
  "type": "receipt",
  "amount": 199.03,
  "utr": "UTR123456",
  "source": "email",
  "rawText": "<redacted>",
  "matchedOrderId": "order:0bc45877-…",
  "receivedAt": 1789928890330
}
```

`utr` is the bank's reference; a repeat of the same reference is recorded as a duplicate and
matches nothing, which is what stops one credit confirming two orders. `rawText` is redacted
before storage.

## Queries

Reads are by id wherever possible — a point read on the partition key, which is the cheapest
operation available. The cross-document queries in use are:

| Query | Where |
|---|---|
| `SELECT TOP 1 * FROM c WHERE c.nameLower = @n` | Username uniqueness |
| `SELECT * FROM c WHERE c.type = 'order' AND c.status = 'pending'` | Matching an incoming credit |
| `SELECT c.id FROM c` (migrations container) | Which migrations have run |

All use parameters; none concatenate user input into SQL.

## Migrations

`api/src/migrations/list.js` is an ordered array. On cold start `functions/startup.js` applies
anything absent from the `migrations` container, claiming each ledger row with `create()`
first so a second instance starting simultaneously takes the 409 and skips rather than
repeating the work. A failure releases the claim so the next start retries.

Add the next numbered file and register it in `list.js`; never edit one that has shipped,
because it will not run again. Migrations can also be applied ahead of a deploy with
`npm run migrate`.

> **Known gap:** the on-start hook has not been observed applying a migration in the deployed
> environment. Until that is diagnosed, run `npm run migrate` explicitly for anything that
> matters. See [SCOPE.md](SCOPE.md#known-gaps).

## Retention

No automatic deletion of accounts, orders or receipts. Rooms expire by age through
`SESSION_IDLE_HOURS` / `SESSION_MAX_AGE_HOURS`; pending orders expire after
`ORDER_TTL_MINUTES`. Account deletion is user-initiated through `/api/auth/delete`.
