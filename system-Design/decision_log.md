# 09. Decision Log

[← Back to index](../SYSTEM_DESIGN.md) · Previous: [Testing strategy](08-testing-strategy.md) · Next: [Known limitations and roadmap →](10-known-limitations-and-roadmap.md)

Each entry records what was decided, what else was considered, and why. The format follows lightweight Architecture Decision Records. Decisions that changed during the build are marked as such.

## Index

| ID | Decision |
|---|---|
| ADR-01 | Decide synchronously, before the payment completes |
| ADR-02 | Three outcomes, not two |
| ADR-03 | Sentinel is a scoring service, not a login system |
| ADR-04 | Weighted risk score instead of simple pass or fail |
| ADR-05 | Weights chosen so a single rule forces a challenge |
| ADR-06 | A flagged recipient blocks outright |
| ADR-07 | Flagged-recipient list instead of crowdsourced reputation |
| ADR-08 | Duress PIN deferred |
| ADR-09 | PostgreSQL as the database |
| ADR-10 | GPS coordinates and Haversine distance for location |
| ADR-11 | Trust windows: 10 months for device and location, 6 months for amount |
| ADR-12 | Percentage of balance instead of a flat dollar limit |
| ADR-13 | Raw SQL with `pg` and `node-pg-migrate`, no ORM |
| ADR-14 | API keys for clients, JWT for admins |
| ADR-15 | SHA-256 for API keys, bcrypt for passwords |
| ADR-16 | Bootstrap script and email verification for admins |
| ADR-17 | Selective Redis caching |
| ADR-18 | Queue only the post-decision bookkeeping |
| ADR-19 | Encrypt one field; defer role-based masking |
| ADR-20 | Verification is performed by the calling app |
| ADR-21 | Caller-generated idempotency keys |
| ADR-22 | Rate limiting deferred |
| ADR-23 | Trust on first use for device and location |
| ADR-24 | Learn only from approved transactions |

---

### ADR-01: Decide synchronously, before the payment completes

- **Context.** In real banking apps the extra verification appears before the PIN, because a check cannot stop a payment that is already authorized.
- **Decision.** The scoring endpoint returns its decision in the same request. Only non-urgent work is deferred.
- **Alternatives.** Batch review of completed transactions (catches fraud after it happened); asynchronous scoring with a callback.
- **Consequences.** The decision path must stay fast and use indexed lookups. Heavy work must move to the background.

### ADR-02: Three outcomes, not two

- **Context.** A real banking experience shows a middle state: not blocked, but asked to prove identity.
- **Decision.** `approve`, `challenge`, `block`.
- **Alternatives.** Binary approve or flag.
- **Consequences.** Honest users with an unusual but legitimate action get friction, not rejection. The calling app must implement the challenge step.

### ADR-03: Sentinel is a scoring service, not a login system

- **Context.** Early in the design a single-device login restriction was proposed.
- **Decision.** Sentinel only scores transactions. Device ID, GPS and balance arrive as fields on each request. Authentication of end users stays in the calling app.
- **Alternatives.** Build registration, login and session enforcement inside Sentinel.
- **Consequences.** Scope stays focused. The device and location rules still work, because the app reports those signals. Sentinel trusts what it is told.

### ADR-04: Weighted risk score instead of simple pass or fail

- **Context.** A simpler idea was "any broken rule triggers verification, no scoring".
- **Decision.** Keep a numeric score. It distinguishes one weak signal from several stacked ones, and it demonstrates rules-engine architecture.
- **Alternatives.** Plain `if` checks.
- **Consequences.** More structure, and a score that can be explained and tuned.

### ADR-05: Weights chosen so a single rule forces a challenge

- **Context.** Every rule matters. A small bump from one rule should not be enough to wave a transaction through.
- **Decision.** Four rules at 45 points, flagged recipient at 90. Thresholds: 0 to 40 approve, 41 to 80 challenge, 81 and above block.
- **Alternatives.** Smaller weights that need several rules to reach a challenge. Thresholds first proposed as 30 and 70, then widened to 40 and 80 so legitimate users are more likely to get a chance to verify than be rejected.
- **Consequences.** Outcomes behave like a count of signals (see [Risk engine design, section 5](03-risk-engine-design.md#5-scoring-and-thresholds)). A false block is costlier than a false challenge, so doubt favors a challenge.

### ADR-06: A flagged recipient blocks outright

- **Context.** If a user is knowingly sending money to a scammer, they will pass any verification because it really is them.
- **Decision.** 90 points, enough to land in `block` alone.
- **Alternatives.** Challenge on a flagged recipient.
- **Consequences.** Verification is reserved for the case it can actually help: stolen access.

### ADR-07: Flagged-recipient list instead of crowdsourced reputation

- **Context.** A caller-ID style "reported as spam" feature was suggested.
- **Decision.** A global table of recipient accounts previously involved in fraud.
- **Alternatives.** Build a community reporting network.
- **Consequences.** Same spirit, buildable alone. No network effect.

### ADR-08: Duress PIN deferred

- **Context.** Some apps offer a special PIN that completes a transfer under coercion but immediately locks the account.
- **Decision.** Out of scope for v1.
- **Consequences.** Recorded as a possible future feature.

### ADR-09: PostgreSQL as the database

- **Context.** Needs relational integrity, ACID transactions and row locking.
- **Decision.** PostgreSQL.
- **Alternatives.** MongoDB and DynamoDB (used in earlier projects) lack the same native transactional locking story for this use.
- **Consequences.** Concurrency control is first-class. Distance math happens in application code.

### ADR-10: GPS coordinates and Haversine distance for location

- **Context.** A text location such as a city name only supports "seen before or not".
- **Decision.** Store latitude and longitude and compute real distances. Known if within 50 km.
- **Alternatives.** Text location with an exact-match check.
- **Consequences.** Graduated, realistic detection (for example Lagos to London). Slightly more code, and distance is computed in the application.

### ADR-11: Trust windows: 10 months for device and location, 6 months for amount

- **Context.** Trust must expire, or a long-compromised account gets free rein. The first idea was 11 to 12 months.
- **Decision (revised during build).** 10 months for device and location. Amount decays on its own, shorter, 6-month clock, because spending habits change faster than hardware or home city.
- **Alternatives.** One shared window for everything; 12 months.
- **Consequences.** Separate decay values live in separate functions and must be changed together with this document.

### ADR-12: Percentage of balance instead of a flat dollar limit

- **Context.** A flat "$5,000 in 6 hours" ignores how much money a user actually has.
- **Decision.** Velocity includes "more than 20 percent of the current balance moved in 6 hours".
- **Alternatives.** Flat limit; percentage with a floor and ceiling.
- **Consequences.** Requires `currentBalance` in every request. A floor and ceiling were considered (so tiny balances are not constantly flagged and huge balances are not given an unlimited allowance) but are not yet implemented.

### ADR-13: Raw SQL with `pg` and `node-pg-migrate`, no ORM

- **Context.** One aim of the project is real fluency with SQL and locking.
- **Decision.** Plain queries and JavaScript migration files.
- **Alternatives.** Prisma, Sequelize, Knex.
- **Consequences.** More typing, full control, and visible SQL.

### ADR-14: API keys for clients, JWT for admins

- **Context.** Two very different callers: software integrations and humans.
- **Decision.** Software clients send an API key. Analysts log in and receive a JWT with a role.
- **Alternatives.** One mechanism for both.
- **Consequences.** Two middleware paths. Each fits its audience.

### ADR-15: SHA-256 for API keys, bcrypt for passwords

- **Context.** Keys are looked up **by** their hash; passwords are looked up by email.
- **Decision.** Deterministic SHA-256 for high-entropy API keys; bcrypt (cost 12) for human-chosen passwords.
- **Consequences.** See [Security design, section 4.1](06-security-design.md#41-fintech-clients-api-keys).

### ADR-16: Bootstrap script and email verification for admins

- **Context.** Public admin registration would let anyone grant themselves override powers. A hardcoded seed file would leave a plain-text password in the repository and look like a demo.
- **Decision.** An operator-run script reads credentials from environment variables, hashes the password and emails a 6-digit code that expires after 15 minutes. Login requires a verified email. Email goes through Nodemailer over SMTP.
- **Alternatives.** Seed SQL; an invitation workflow with one-time tokens; Amazon SES; SSO and MFA.
- **Consequences.** Real onboarding flow without a second project's worth of scope. Invitations, SSO and MFA are recorded as future work.

### ADR-17: Selective Redis caching

- **Context.** Four lookups repeat on every transaction and change slowly.
- **Decision.** Cache those four for one hour. Never cache velocity checks or writes.
- **Consequences.** Faster reads, with an hour of possible staleness and no invalidation yet.

### ADR-18: Queue only the post-decision bookkeeping

- **Context.** Updating a user's history does not change the decision already returned.
- **Decision.** BullMQ queue and a separate worker process for history updates.
- **Alternatives.** Do it inline; queue the decision itself.
- **Consequences.** Faster responses. Two processes to run. The decision itself can never be queued because it must come back in the same request.

### ADR-19: Encrypt one field; defer role-based masking

- **Context.** Encryption at rest protects against a database leak. Hiding fields from some admins is a different feature (field-level access control).
- **Decision.** Encrypt `recipient_account`. Shelve role-based masking for a dedicated project.
- **Consequences.** Clear separation of concerns, with a manageable scope.

### ADR-20: Verification is performed by the calling app

- **Context.** Sentinel has no camera, fingerprint reader or SMS gateway.
- **Decision.** Sentinel returns `challenge`. The client collects proof and reports pass or fail.
- **Consequences.** Biometrics are simulated as a boolean. Retry limits and cooldown are specified but not yet built.

### ADR-21: Caller-generated idempotency keys

- **Context.** Only the caller knows if two requests are a retry or two real attempts.
- **Decision.** The caller supplies the key. A unique constraint backs it up.
- **Consequences.** Clients must generate unique keys correctly.

### ADR-22: Rate limiting deferred

- **Context.** Rate limiting defends against one abusive source. It does not solve total capacity, which is an infrastructure scaling matter.
- **Decision.** Not built for v1. Stored in the roadmap.
- **Consequences.** Login and verification-code endpoints are brute-forceable until added.

### ADR-23: Trust on first use for device and location

- **Context.** With no history, a brand-new user's first transaction showed a new device and a new place, scoring 90 and being blocked.
- **Decision.** When a user has no stored devices (or no stored locations), the first one is accepted and learned. The familiarity rules only fire against an existing history.
- **Alternatives.** Challenge or block every first transaction; require an onboarding step that seeds a first device and location.
- **Consequences.** New users can transact. A thief acting on a victim's very first transaction is not caught by these two rules; the amount, velocity and flagged-recipient rules still apply.

### ADR-24: Learn only from approved transactions

- **Context.** Updating history after every decision meant a device or place from a blocked attempt became trusted afterward.
- **Decision.** The history job is queued only when the decision is `approve`.
- **Alternatives.** Learn from everything; learn only after a challenge is passed.
- **Consequences.** An attacker cannot become known by being refused. Until the challenge confirmation flow exists, a legitimate user on a genuinely new device is challenged on each attempt, because nothing can mark that device as verified.