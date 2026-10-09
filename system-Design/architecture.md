# 02. Architecture

[← Back to index](../SYSTEM_DESIGN.md) · Previous: [Requirements](01-requirements-and-scope.md) · Next: [Risk engine →](03-risk-engine-design.md)

## 1. Overview

Sentinel is a small, layered Node.js service. It runs as **two processes** (the API and a background worker) that share two pieces of infrastructure (PostgreSQL and Redis).

## 2. System context

Who talks to Sentinel, and what Sentinel depends on.

```mermaid
flowchart TB
    U["End user"] --> F["Fintech app<br/>(GPS, device ID, balance)"]
    F -->|"HTTPS, x-api-key"| S["Sentinel"]
    AN["Fraud analyst"] -->|"HTTPS, Bearer JWT"| S
    OP["Operator"] -->|"scripts and migrations"| S
    S --> PG[("PostgreSQL")]
    S --> RD[("Redis")]
    S -->|"SMTP"| EM["Email provider<br/>(admin verification codes)"]
```

## 3. Containers (what actually runs)

```mermaid
flowchart LR
    subgraph Node["Node.js processes"]
        API["API process<br/>server.js (Express)"]
        WK["Worker process<br/>Queue/startWorker.js"]
    end
    subgraph Data["Data services"]
        PG[("PostgreSQL<br/>source of truth")]
        RD[("Redis<br/>cache and job queue")]
    end
    API <--> PG
    API <--> RD
    API -->|"enqueue job"| RD
    RD -->|"deliver job"| WK
    WK --> PG
```

| Container | Responsibility | Start command |
|---|---|---|
| API process | Serves HTTP, authenticates, scores transactions, enqueues history updates | `nodemon server.js` |
| Worker process | Consumes history-update jobs and writes device, location and baseline data | `node Queue/startWorker.js` |
| PostgreSQL | Permanent data: users, transactions, history, audit log, admins, clients | Service |
| Redis | Fast cache for repeated lookups, and the storage engine behind BullMQ | Service |

Redis does double duty: it is both the cache and the queue backend. One installation, two jobs.

## 4. Layered structure

```mermaid
flowchart TB
    R["routes/<br/>URL to handler mapping"] --> M["middleware/<br/>auth, validation"]
    M --> C["controller/<br/>HTTP in, HTTP out"]
    C --> SV["services/<br/>business logic (rules engine)"]
    SV --> DB["db/<br/>data-access functions"]
    DB --> PG[("PostgreSQL")]
    DB --> RD[("Redis")]
    C --> Q["Queue/<br/>background jobs"]
```

**Layering rule:** each layer calls only the layer below it. The rules engine knows nothing about HTTP, requests or responses. It takes plain data in and returns a decision. That is what makes it testable in isolation (see [Testing](08-testing-strategy.md)).

### Project structure

```
sentinel/
├── server.js                    # Express app setup, route mounting, listen
├── config/
│   ├── db.js                    # PostgreSQL connection pool
│   └── redis.js                 # Redis client
├── routes/
│   ├── transaction.js           # transaction and admin-review endpoints
│   └── admin.js                 # admin verify and login endpoints
├── middleware/
│   ├── auth.js                  # JWT check and role check (admins)
│   ├── Api_auth.js              # API-key check (fintech clients)
│   └── validateTransaction.js   # request body validation
├── controller/
│   └── transactionController.js # orchestrates one scoring request
├── services/
│   └── riskEngine.js            # evaluateTransaction(): the five rules
├── db/
│   ├── deviceHistory.js         # isDeviceKnown (cached)
│   ├── locationHistory.js       # isLocationKnown (cached, Haversine)
│   ├── amountBaseline.js        # getAmountBaseline (cached)
│   ├── flaggedRecipients.js     # isRecipientFlagged (cached)
│   ├── transactions.js          # insertTransaction, velocity queries
│   └── auditLogs.js             # writeAuditLog (hash chain)
├── Queue/
│   ├── historyQueue.js          # producer side of the queue
│   ├── Worker.js                # consumer: updates history tables
│   └── startWorker.js           # entry point for the worker process
├── utils/
│   ├── distance.js              # Haversine distance
│   └── encryption.js            # AES-256-CBC encrypt and decrypt
├── scripts/
│   ├── bootstrap_admin.js       # creates the first admin and emails a code
│   ├── api_client.js            # creates a fintech API client and prints its key
│   └── admin_credentials.js     # Nodemailer transport and sendEmail()
├── migrations/                  # node-pg-migrate files, run in timestamp order
└── tests/
    └── riskEngine.test.js       # Jest unit tests
```

## 5. Request lifecycle: scoring a transaction

```mermaid
sequenceDiagram
    participant C as Fintech app
    participant MW as Middleware
    participant CT as Controller
    participant PG as PostgreSQL
    participant RE as Rules engine
    participant RD as Redis
    participant Q as Queue
    participant W as Worker

    C->>MW: POST /v1/transactions + x-api-key
    MW->>PG: look up SHA-256(key) in api_clients
    MW->>MW: validate body fields
    MW->>CT: request accepted
    CT->>PG: SELECT by idempotency_key
    alt key already used
        CT-->>C: 200 with the original decision
    else new request
        CT->>PG: BEGIN
        CT->>PG: Upsert the user row (create if new, refresh balance)
        CT->>PG: SELECT recent rows FOR UPDATE (lock)
        CT->>RE: evaluateTransaction(client, tx)
        RE->>RD: cached lookups (device, location, baseline, recipient)
        RD-->>RE: hit, or miss then read PostgreSQL and cache
        RE->>PG: velocity count and balance moved (always fresh)
        RE-->>CT: decision, score, reasons
        CT->>PG: INSERT transaction (recipient encrypted)
        CT->>PG: INSERT audit log (hash chained)
        CT->>PG: COMMIT
        CT->>Q: add job update-history (approve only)
        CT-->>C: 200 decision, risk_score, reasons
        Q->>W: deliver job
        W->>PG: upsert device, insert location, upsert baseline
    end
```

Key properties of this flow:

- **Everything between `BEGIN` and `COMMIT` uses one dedicated connection**, so the lock holds and the work is atomic.
- **If anything fails, `ROLLBACK`** undoes the whole attempt and the client receives a 500. No half-saved transaction can exist.
- **The queue is touched only after `COMMIT`**, so a job is never created for a transaction that was rolled back.
- **The response is sent without waiting for the worker.**

## 6. Request lifecycle: admin actions

```mermaid
sequenceDiagram
    participant A as Analyst
    participant S as Sentinel
    participant PG as PostgreSQL

    A->>S: POST /v1/admin/login (email, password)
    S->>PG: load admin, bcrypt compare, check is_verified
    S-->>A: JWT (1 hour)
    A->>S: GET /v1/flagged (Authorization: Bearer JWT)
    S->>S: verify token, require role admin
    S->>PG: select non-approved transactions
    S->>S: decrypt recipient_account
    S-->>A: list
    A->>S: POST /v1/flagged/:id/review
    S->>PG: update decision
    S->>PG: write audit log entry
    S-->>A: updated transaction
```

## 7. Data ownership

| Data | Owner | Notes |
|---|---|---|
| Device ID, GPS, amount, balance, recipient | **Calling app** | Sentinel trusts but cannot verify |
| Decision, score, reasons | **Sentinel** | Derived and stored |
| Per-user device, location and amount history | **Sentinel** | Learned only from transactions that pass through it |
| Flagged recipient list | **Sentinel** | Maintained by operators and analysts |
| Biometric or OTP verification | **Calling app** | Sentinel receives only pass or fail |

## 8. Technology choices

| Concern | Choice | Why |
|---|---|---|
| Runtime and framework | Node.js, Express 5 | Familiar, fast to build, good async I/O for lookup-heavy work |
| Database | PostgreSQL | Relational data with real ACID transactions and row-level locking, which the concurrency objective needs |
| DB access | `pg` driver with raw SQL, no ORM | Full control and visibility, and deliberate practice with SQL |
| Migrations | `node-pg-migrate` | Versioned, ordered, reversible schema changes in JavaScript |
| Cache | Redis via `ioredis` | In-memory speed for lookups repeated on every transaction |
| Queue | BullMQ | Built on Redis, so no extra infrastructure |
| Passwords | `bcrypt` | Slow by design; suited to passwords |
| Tokens | `jsonwebtoken` | Standard signed tokens for admin sessions |
| Email | Nodemailer over SMTP | Simple verification codes without a managed email service |
| Tests | Jest, Supertest | Standard Node testing; Supertest reserved for HTTP-level tests |

## 9. Cross-cutting concerns

| Concern | Approach |
|---|---|
| Configuration | Environment variables loaded from `.env`; never committed |
| Errors | `try/catch` in handlers; transactional rollback in the controller; generic 500 message to clients, full error to the server log |
| Logging | `console` only |
| Time | All timestamps are `TIMESTAMPTZ`; decay windows computed against server time |
| Identity | UUIDs for every primary key |
| Versioning | `/v1` path prefix on every route |