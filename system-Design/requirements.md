# 01. Requirements and Scope

[← Back to index](../SYSTEM_DESIGN.md) · Next: [Architecture →](02-architecture.md)

## 1. Purpose of this document

This document states what Sentinel must do, how well it must do it, and, just as important, what it deliberately does not do. Later documents explain *how*; this one explains *what* and *why*.

## 2. Background and motivation

Consumer banking apps already protect users with step-up verification: a user who normally sends small amounts tries to send a large one, and the app asks for a face check before the PIN screen. That behavior comes from a fraud-scoring system working behind the scenes.

Sentinel is that system, built as a standalone service that any fintech could call. The motivating observations came from real use of such apps:

- The check happens **before** the PIN and payment, because a check cannot stop a payment that has already been authorized.
- "Unusual" is personal. The system learns each user's normal behavior from their own history.
- Trust should **expire**. A device or spending range that has not been seen for months should not stay trusted forever, or a compromised account could be drained in small, "normal-looking" steps.
- A fraud system must not annoy honest users more than it stops thieves. Wherever possible, doubt leads to a challenge, not a rejection.

## 3. Actors

| Actor | Description | How they interact |
|---|---|---|
| **Fintech client** | A payment or banking app that integrates Sentinel | Sends transactions with an API key and acts on the returned decision |
| **Fraud analyst (admin)** | A human employee reviewing risky transactions | Logs in, lists flagged transactions, overrides decisions with notes |
| **End user** | The customer making the payment | Never talks to Sentinel directly; is affected through the client app |
| **Operator** | The person deploying and maintaining Sentinel | Runs migrations, creates the first admin, creates API clients |

## 4. Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-01 | Accept a transaction and return `approve`, `challenge` or `block` synchronously | Must | Implemented |
| FR-02 | Flag an attempt from a device the user has not used within the trust window | Must | Implemented |
| FR-03 | Flag an attempt from a location far from the user's known locations | Must | Implemented |
| FR-04 | Flag an amount outside the user's personal spending range | Must | Implemented |
| FR-05 | Flag abnormal speed: too many transactions, or too much of the balance, in a short window | Must | Implemented |
| FR-06 | Flag any payment to a recipient account on the fraud list | Must | Implemented |
| FR-07 | Return the risk score and the list of triggered reasons with every decision | Must | Implemented |
| FR-08 | Make submissions idempotent so retries never double-count | Must | Implemented |
| FR-09 | Record every decision in a tamper-evident audit log | Must | Implemented |
| FR-10 | Learn each user's devices, locations and spending range from past transactions, with decay | Must | Implemented |
| FR-11 | Authenticate fintech clients with API keys | Must | Implemented |
| FR-12 | Provision admins without public registration; verify admin email before first login | Must | Implemented |
| FR-13 | Let admins list flagged transactions | Must | Implemented |
| FR-14 | Let admins review and override a decision, with notes, and audit the override | Must | Implemented |
| FR-15 | Let admins look up a single transaction and a user's risk profile | Should | Implemented |
| FR-16 | Accept the result of the client's verification challenge, limit retries, apply an account cooldown, and escalate repeated failures to admin review | Should | Designed only |
| FR-17 | Encrypt the recipient account number at rest | Must | Implemented |

## 5. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Latency | The decision path is synchronous and does only indexed lookups, so it can sit inside a payment flow. No hard figure is promised; the system has not been load-benchmarked. |
| NFR-02 | Correctness under concurrency | Two simultaneous requests from the same user must not both pass a velocity limit that only one should pass. |
| NFR-03 | Integrity | Decisions and admin actions must be recorded so that tampering is detectable. |
| NFR-04 | Confidentiality | Credentials are hashed, the recipient account is encrypted, and no secret lives in the repository. |
| NFR-05 | Safety of input | No user input may be concatenated into SQL. Request fields are validated before use. |
| NFR-06 | Maintainability | Code is layered (routes, controllers, services, data access) so each layer can change independently. |
| NFR-07 | Testability | The rules engine must be testable in isolation, without a real database or cache. |
| NFR-08 | Availability | No uptime target for v1. Single instance, single database. |
| NFR-09 | Observability | Console logging only. Dedicated metrics and tracing are out of scope. |

## 6. Assumptions and constraints

- The calling app supplies **all** signals: device ID, GPS coordinates, current balance and recipient. Sentinel cannot verify them independently.
- Amounts are in **US dollars**.
- Sentinel starts with no knowledge of a user and learns only from transactions that pass through it. A real integration would normally seed historical data; v1 does not.
- PostgreSQL and Redis are available and reachable.
- The first version targets a single region and a single API instance plus one worker.

## 7. Scope

### In scope

- The scoring API, rules engine and decision thresholds
- Per-user history and decay
- Idempotency, concurrency control, caching and background processing
- Audit logging
- API-key and admin authentication, with role checks
- Field encryption for the recipient account
- Automated tests for the rules engine

### Out of scope, with reasons

| Item | Reason |
|---|---|
| End-user login, registration and sessions | Sentinel is a scoring service. The calling app already authenticated its user. |
| Moving money, balances, ledgers | Sentinel never touches funds. This would be a different system. |
| Capturing fingerprint, face or OTP | Needs device hardware Sentinel does not have. The client app collects it and reports pass or fail. |
| Crowdsourced "spam number" reputation | Needs a large reporting community. Reframed as a simple internal list of flagged recipient accounts. |
| Duress PIN (a second PIN that silently locks the account under coercion) | A separate safety subsystem. Deferred. |
| Role-based data masking for admins | Different from encryption at rest. Shelved for a dedicated project. |
| Admin invitation workflow, SSO/OIDC, MFA | Valuable, but a second project inside this one. |
| Distributed rate limiting | Deferred for v1 (see [limitations](10-known-limitations-and-roadmap.md)). |
| Standalone metrics and observability stack | Out of scope for a v1 portfolio build. |
| Machine-learning scoring | v1 uses transparent, explainable rules. |

## 8. Engineering objectives

Alongside the product requirements, the project was set ten engineering objectives. This table maps each to where it lives and where it stands.

| # | Objective | Where it is implemented | Status |
|---|---|---|---|
| 1 | Idempotency | Caller-supplied key checked in the controller, unique constraint in the database | Implemented |
| 2 | Tamper-evident audit logging | Hash-chained `audit_logs` writer | Implemented (verifier pending) |
| 3 | Rules engine architecture | `services/riskEngine.js`, weighted rules, thresholds | Implemented |
| 4 | Database transactions and concurrency | `BEGIN`/`COMMIT` with `SELECT ... FOR UPDATE` in the controller | Implemented (gap noted) |
| 5 | Role-based access control | API-key middleware, JWT and role middleware | Partial (single admin role) |
| 6 | Automated testing | Jest suite for the rules engine | Partial |
| 7 | Redis caching | Cache-aside on four lookup functions | Implemented |
| 8 | Queue-based async processing | BullMQ queue and separate worker process | Implemented |
| 9 | Encryption at rest | AES-256-CBC on `recipient_account` | Implemented |
| 10 | API versioning | `/v1` path prefix on every route | Partial (prefix only) |