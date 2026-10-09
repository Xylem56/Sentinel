# 05. API Design

[← Back to index](../SYSTEM_DESIGN.md) · Previous: [Database design](04-database-design.md) · Next: [Security design →](06-security-design.md)

## 1. Overview

Sentinel exposes a small JSON-over-HTTP API with two audiences:

- **Fintech clients** call one endpoint to score transactions, authenticated with an API key.
- **Fraud analysts** use the remaining endpoints, authenticated with a JWT.

## 2. Conventions

| Topic | Convention |
|---|---|
| Base path | Every route is prefixed with `/v1` |
| Format | Request and response bodies are JSON (`Content-Type: application/json`) |
| Client auth | Header `x-api-key: <raw key>` |
| Admin auth | Header `Authorization: Bearer <JWT>` |
| IDs | UUIDs |
| Money | Numbers in US dollars |
| Time | ISO 8601 timestamps with time zone |
| Idempotency | Caller supplies `idempotencyKey` on `POST /v1/transactions` |
| Pagination | None yet. List endpoints return every matching row. |

### Status codes used

| Code | Meaning |
|---|---|
| 200 | Success (also returned when an idempotent request is replayed) |
| 400 | Missing or invalid input |
| 401 | Missing or invalid credentials |
| 403 | Authenticated but not allowed (wrong role, expired or invalid token, unverified admin) |
| 404 | Resource not found |
| 500 | Unexpected server error. The detail is logged server-side, not sent to the client. |

### Naming in current responses

Request bodies use `camelCase` (`userId`). Scoring responses use `snake_case` (`risk_score`). Endpoints that return a raw database row use the column names. Unifying this is a recorded improvement, not a bug.

## 3. Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/transactions` | API key | Score a transaction |
| GET | `/v1/transactions/:id` | Admin JWT | Fetch one transaction |
| GET | `/v1/flagged` | Admin JWT | List challenged and blocked transactions |
| POST | `/v1/flagged/:id/review` | Admin JWT | Override a decision |
| GET | `/v1/users/:id/risk-profile` | Admin JWT | Summary for one user |
| POST | `/v1/admin/verify` | None | Verify an admin's email |
| POST | `/v1/admin/login` | None | Obtain a JWT |
| POST | `/v1/transactions/:id/confirm` | API key | **Designed only.** Report a verification result |

---

## 4. Endpoint reference

### 4.1 `POST /v1/transactions`

Scores one payment attempt. This is the core endpoint.

**Auth:** API key. **Middleware order:** API-key check, body validation, controller.

**Request**

```http
POST /v1/transactions
Content-Type: application/json
x-api-key: 8a20b151...

{
  "userId": "b74b9480-406a-4bd1-b268-acf79a60e516",
  "amount": 200,
  "deviceId": "device-abc123",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "recipientAccount": "acct-xyz",
  "currentBalance": 5000,
  "idempotencyKey": "order-8841"
}
```

| Field | Type | Rules |
|---|---|---|
| `userId` | string | Required. Must be a valid UUID of an existing user. |
| `amount` | number | Required. Greater than 0. |
| `deviceId` | string | Required. Non-empty. |
| `latitude` | number | Required. Between -90 and 90. |
| `longitude` | number | Required. Between -180 and 180. |
| `recipientAccount` | string | Required. Non-empty. |
| `currentBalance` | number | Required. 0 or greater. |
| `idempotencyKey` | string | Required. Non-empty. Must be unique per distinct payment attempt. |

**Success: 200**

```json
{
  "transaction_id": "58dc1373-c8d9-411e-ab36-b81c5d8e0d60",
  "decision": "challenge",
  "risk_score": 45,
  "reasons": ["unknown_device"]
}
```

**Errors**

| Code | Body | Cause |
|---|---|---|
| 400 | `{ "message": "amount must be a positive number" }` | Validation failure (message varies by field) |
| 401 | `{ "message": "API key required" }` | Header missing |
| 401 | `{ "message": "Invalid API key" }` | Key not recognized |
| 500 | `{ "error": "Something went wrong processing this transaction" }` | Unexpected failure; the transaction is rolled back |

**Behavior**

1. Authenticates the client and validates the body.
2. If `idempotencyKey` was already used, returns the **original** decision without reprocessing.
3. Otherwise runs the full scoring flow inside a database transaction.
4. After commit, enqueues a background job to update the user's history.

**Idempotency contract.** Retrying the same request with the same key is always safe: the response is identical and nothing is double-counted. Use a new key for a genuinely new payment attempt.

---

### 4.2 `GET /v1/transactions/:id`

Returns a single stored transaction.

**Auth:** Admin JWT with role `admin`.

| Part | Detail |
|---|---|
| Path param | `id`, the transaction UUID |
| Success 200 | The full transaction row, with `recipient_account` **decrypted** |
| 404 | `{ "message": "Transaction not found" }` |
| 401 / 403 | Missing token / invalid, expired or wrong role |

---

### 4.3 `GET /v1/flagged`

Lists every transaction whose decision is not `approve`, newest first.

**Auth:** Admin JWT with role `admin`.

**Success 200**

```json
[
  {
    "id": "58dc1373-...",
    "user_id": "b74b9480-...",
    "amount": "200.00",
    "decision": "challenge",
    "risk_score": 45,
    "reasons": ["unknown_device"],
    "recipient_account": "acct-xyz",
    "created_at": "2026-10-08T14:02:11.000Z"
  }
]
```

The recipient account is decrypted for each row before it is returned. Numeric columns come back as strings, a normal trait of PostgreSQL `NUMERIC`.

---

### 4.4 `POST /v1/flagged/:id/review`

Lets an analyst override a decision and records the action in the audit log.

**Auth:** Admin JWT with role `admin`.

| Part | Detail |
|---|---|
| Path param | `id`, the transaction UUID |

```json
{
  "reviewedBy": "analyst name or id",
  "finalDecision": "approve",
  "notes": "Confirmed with customer by phone"
}
```

| Field | Rules (current) |
|---|---|
| `reviewedBy` | Required |
| `finalDecision` | Required. `approve` or `block` is intended. The database CHECK constraint rejects values outside the three decisions, but the route does not yet restrict to two. |
| `notes` | Required |

**Success 200:** `{ "message": "Review submitted", "transaction": { ... } }`

**Errors:** 400 `All fields are required`; 401 / 403 for auth failures.

**Side effect:** an `audit_logs` entry with `event_type = admin_review`.

> The route currently trusts `reviewedBy` from the request body. The intended improvement is to take the reviewer's identity from the verified token and write it to `audit_logs.admin_id` (K-08).

---

### 4.5 `GET /v1/users/:id/risk-profile`

A quick summary of one user's standing.

**Auth:** Admin JWT with role `admin`.

**Success 200**

```json
{
  "baseline": { "min_amount": "20.00", "max_amount": "300.00" },
  "totalTransactions": 42,
  "flaggedTransactions": 3
}
```

`baseline` is `null` when the user has no baseline yet.

---

### 4.6 `POST /v1/admin/verify`

Verifies an admin's email using the code sent by the bootstrap script.

**Auth:** None.

```json
{ "email": "admin@example.com", "code": "298706" }
```

| Result | Code | Body |
|---|---|---|
| Verified | 200 | `{ "message": "Admin Authentication successfull" }` |
| Missing fields | 400 | `{ "message": "Valid authentication are required" }` |
| Code expired (over 15 minutes) | 400 | `{ "message": "Code has expired" }` |
| Wrong code | 404 | `{ "message": "Invalid verification code" }` |
| Unknown email | 404 | `{ "message": "Admin not found" }` |

On success the code is cleared so it cannot be reused.

---

### 4.7 `POST /v1/admin/login`

Exchanges credentials for a token.

**Auth:** None.

```json
{ "email": "admin@example.com", "password": "..." }
```

| Result | Code | Body |
|---|---|---|
| Success | 200 | `{ "message": "Login Successful", "token": "<JWT>" }` |
| Missing fields | 400 | `{ "message": "Both fields are required" }` |
| Unknown email | 404 | `{ "message": "Admin not found" }` |
| Wrong password | 401 | `{ "message": "Invalid password" }` |
| Email not verified | 403 | `{ "message": "Please verify your email before logging in" }` |
| Server error | 500 | `{ "message": "error logging in ", "error": "..." }` |

The token expires after **1 hour** and carries `{ id, role }`.

---

### 4.8 `POST /v1/transactions/:id/confirm` (designed only)

Reports the outcome of the client's own verification step.

```json
{ "verified": true }
```

| Outcome | Result |
|---|---|
| `verified: true` | The transaction is approved. History may now be learned. |
| `verified: false`, attempts under 5 | Attempt counted and logged. Client may retry. |
| Fifth failure | Transaction cancelled. Account enters a 30-minute cooldown. |

Full rules are in [Risk engine design, section 7](03-risk-engine-design.md#7-challenge-confirmation-flow-designed-not-yet-built).

---

## 5. Authentication quick reference

| Caller | Credential | Obtained by | Sent as |
|---|---|---|---|
| Fintech client | API key | Operator runs `node scripts/api_client.js "<name>"` and gives the printed key to the client once | `x-api-key` header |
| Fraud analyst | JWT | `POST /v1/admin/login` after the admin is verified | `Authorization: Bearer` header |

## 6. Example session

```bash
# 1. Score a transaction
curl -X POST http://localhost:5000/v1/transactions \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"userId":"b74b9480-406a-4bd1-b268-acf79a60e516","amount":200,
       "deviceId":"device-abc123","latitude":6.5244,"longitude":3.3792,
       "recipientAccount":"acct-xyz","currentBalance":5000,
       "idempotencyKey":"order-8841"}'

# 2. Analyst logs in
curl -X POST http://localhost:5000/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}'

# 3. Analyst lists flagged transactions
curl http://localhost:5000/v1/flagged -H "Authorization: Bearer $TOKEN"
```

## 7. Known inconsistencies

| Item | Detail |
|---|---|
| Error shapes | Most errors use `{ "message" }`. The scoring endpoint's 500 uses `{ "error" }`. |
| Wrong verification code | Returns 404; 400 would be more accurate. |
| Login errors | 404 for unknown email and 401 for wrong password reveals which emails exist (K-14). |
| Bad UUID in a path | A malformed `:id` reaches the database and surfaces as a 500 (K-15). |
| Case | Request `camelCase`, response `snake_case` in places. |

These are tracked in [Known limitations](10-known-limitations-and-roadmap.md).