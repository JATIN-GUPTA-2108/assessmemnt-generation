# AI-Powered Assessment Orchestration Engine

Backend implementation for the technical assessment using **Node.js + Express + PostgreSQL + Redis + BullMQ**.

## 1. Architecture Overview

### Components
- `API` (Express): Accepts admin and user requests.
- `Service Layer`: Owns business logic, state transitions, and idempotency checks.
- `PostgreSQL` (Prisma): Source of truth for syllabus, assessments, sessions, submissions, and job states.
- `Redis + BullMQ`: Background queues for AI generation and AI evaluation.
- `Worker Processes`: Independent consumers for generation/evaluation jobs.
- `Gemini Integration`: Encapsulated in `AIService`.

### Layering
- Controllers: request/response mapping only.
- Services: domain behavior and transactional enforcement.
- Workers: asynchronous job processing and retry handling.

## 2. Database Schema Explanation

Defined in `prisma/schema.prisma`.

Core tables:
- `Syllabus`: extracted PDF text by subject.
- `Assessment`: generated questionnaire JSON (`content`), unique by `syllabusHash`.
- `AIJob`: async job records (`GENERATION`/`EVALUATION`) with `PENDING/PROCESSING/COMPLETED/FAILED` state.
- `AIJobAttempt`: per-attempt job logs with status and error.
- `Session`: user assessment session state, section pointer, activity timestamps.
- `SectionSubmission`: submitted answers per section (`UNIQUE(sessionId, sectionIndex)` prevents duplicate section submits).
- `IdempotencyKey`: optional extension point for explicit idempotency keys.

## 3. Session State Machine

Session states:
- `OPTED_IN`
- `ACTIVE`
- `COMPLETED`
- `EXPIRED`

Allowed transitions:
- `OPTED_IN -> ACTIVE` (`POST /sessions/start`)
- `ACTIVE -> COMPLETED` (`POST /sessions/:id/complete`, only after all sections)
- `ACTIVE -> EXPIRED` (inactivity > 30 min)

Invariants enforced server-side:
- Only one `ACTIVE` session per user.
- Section submission order is strict (`currentSectionIndex` must match request).
- Duplicate submission blocked by unique DB constraint.
- Completion requires all sections submitted.

## 4. Concurrency Handling Strategy

### Techniques used
- **Serializable transactions** for critical transitions.
- **PostgreSQL advisory locks** (`pg_advisory_xact_lock`) keyed by `userId` or `sessionId`.
- **Unique constraints** for dedupe and anti-double-submit.

### Race conditions handled
- Two simultaneous section submissions:
  - lock session + unique constraint + atomic increment.
- Two simultaneous completion requests:
  - lock session + conditional update.
- Duplicate generation/evaluation triggers:
  - `AIJob.dedupeKey` unique constraint.
- Retry/network duplicate requests:
  - dedupe keys return same logical job instead of creating duplicates.

## 5. Idempotency Strategy

- **Assessment generation** dedupe key: `generation:<syllabusHash>`.
- **Evaluation** dedupe key: `evaluation:<sessionId>`.
- Duplicate trigger attempts return existing job details.
- Optional explicit idempotency can be persisted in `IdempotencyKey` table.

## 6. Async Job Processing Design

### Generation flow
1. `POST /assessments/generate` creates `AIJob(PENDING)` and returns immediately with `jobId`.
2. BullMQ worker picks the job and sets `PROCESSING`.
3. Worker calls Gemini and persists generated JSON as `Assessment`.
4. Marks job `COMPLETED` (or `FAILED`) and logs attempt.

### Evaluation flow
1. Session completion creates evaluation `AIJob(PENDING)`.
2. Queue worker evaluates answers asynchronously.
3. Stores result and marks `COMPLETED`.

Queue config includes retries and exponential backoff.

## 7. Failure Handling Strategy

- Worker errors are caught and persisted in `AIJob.errorMessage`.
- Every attempt is logged in `AIJobAttempt`.
- Failed jobs do not partially mutate session progression.
- HTTP requests never block on AI completion.
- AI failures do not crash API process.

## 8. Scaling to 100,000 Concurrent Users

### Database scaling
- Partition/high-cardinality indexes for `Session` and `SectionSubmission`.
- Read/write split: writes to primary, reads to replicas.
- Connection pooling (PgBouncer).
- Use append-only event/audit table for high-volume history.

### Replication and lag
- Route strong-consistency reads (session transitions, completion checks) to primary.
- Route dashboards/job-status polling to replicas with staleness tolerance.
- Use version/timestamp fields to detect stale reads.

### Queue scaling
- Horizontally scale BullMQ workers by queue type.
- Separate generation and evaluation queues to isolate workloads.
- Configure dead-letter queue for repeatedly failing jobs.

### AI rate limits
- Apply rate limiter on AI-triggering endpoints.
- Throttle worker concurrency per provider quota.
- Circuit breaker + fallback behavior during provider outages.

### Cache considerations
- Cache static assessment metadata in Redis.
- Avoid caching mutable session transition state unless write-through with strict invalidation.

## API Endpoints

### Admin
- `POST /admin/syllabus/upload` (multipart `files[]` PDFs)
- `POST /assessments/generate` -> returns `{ jobId, status }` immediately
- `GET /jobs/:jobId`

### User Session
- `POST /sessions/opt-in` `{ userId, assessmentId }`
- `POST /sessions/start` `{ sessionId, userId }`
- `POST /sessions/:sessionId/submit-section` `{ userId, sectionId, sectionIndex, answers }`
- `POST /sessions/:sessionId/complete` `{ userId }`
- `GET /sessions/:sessionId?userId=<id>`

## Local Run

1. Copy env
```bash
cp .env.example .env
```
2. Start infra
```bash
docker compose up -d
```
3. Install dependencies
```bash
npm install
```
4. Prisma
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```
5. Run API and workers (3 terminals)
```bash
npm run dev
npm run worker:generation
npm run worker:evaluation
```

## Notes
- If `GEMINI_API_KEY` is not set, `AIService` uses deterministic mock output to keep the system runnable.
- This project is backend-only by design.
