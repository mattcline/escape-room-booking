# Escape Room Booking API — Claude Code Session Transcript

This transcript shows the prompts I gave to Claude Code and summaries of what
it did in response. The full code diffs are visible in the pull requests on GitHub.

This project was built across 3 Claude Code sessions in a single sitting.

---

## Session 1: Core API Implementation

### Prompt 1 — Build the API

> Implement the following plan:
>
> **Escape Room Booking API — Implementation Plan**
>
> Build a Next.js + Prisma + SQLite API for booking escape room time slots with a
> temporary "hold" mechanism. Teams can reserve a slot for 5 minutes while coordinating,
> then confirm or release. The core challenge is concurrency-safe holds with auto-expiration.
>
> **Tasks:**
> 1. Project scaffolding (Next.js, Prisma, Vitest)
> 2. Prisma schema + seed (Room, TimeSlot, Hold, Booking — with unique constraints
>    for concurrency safety)
> 3. Shared libraries (singleton PrismaClient, hold expiration logic)
> 4. API routes: `GET /api/rooms`, `POST /api/holds`, `POST /api/holds/:id/confirm`,
>    `DELETE /api/holds/:id`
> 5. Test suite covering happy paths, conflicts, and expiration
> 6. Commit, push, create PR

*Claude scaffolded the project, set up the Prisma schema with concurrency guards
(`@unique` on Hold.timeSlotId and Booking.timeSlotId), implemented all 4 API endpoints,
and wrote 9 tests. It hit some friction with Prisma v7's ESM changes and ended up
downgrading to Prisma v6 for stability. All tests, build, and lint passed.*

*Result: PR [#1](https://github.com/mattcline/escape-room-booking/pull/1) — Core booking API with hold/confirm mechanism.*

### Prompt 2 — Identify a security gap

> In the hold confirmation route, do we ensure the user is authorized to make a
> booking for the hold id?

*Claude confirmed there was no authorization — anyone who knew a hold ID could confirm or
release it. It proposed requiring `playerEmail` in the request body and verifying it
matches the hold creator's email.*

---

## Session 2: Email Authorization + Test Planning

### Prompt 3 — Add authorization

> Implement the following plan:
>
> **Add Email-Based Authorization to Hold Confirm/Delete**
>
> Require `playerEmail` in the request body for both confirm and delete.
> Verify it matches the email stored on the hold. Return 403 Forbidden if mismatch.
>
> Check order: 404 (not found) → 400 (missing email) → 403 (wrong email) → 410 (expired)
> → proceed.

*Claude updated both route handlers, added 403/400 tests, and updated all existing tests
to include `playerEmail`. All 13 tests passed, build and lint clean.*

*Result: PR [#2](https://github.com/mattcline/escape-room-booking/pull/2) — Email-based authorization on hold endpoints.*

### Prompt 4 — Understand a design choice

> Explain the cases when we want to "Catch Prisma P2002"

*Claude explained that P2002 is a unique constraint violation. In this project, it's
caught in two places:*

1. *Creating a hold — if two users race to hold the same slot, the DB's unique constraint
   on `Hold.timeSlotId` rejects the second insert → returns 409 "Time slot is already held"*
2. *Confirming a hold into a booking — the unique constraint on `Booking.timeSlotId` prevents
   double-bookings at the database level, even if application logic has a race condition*

### Prompt 5 — Plan interactive testing

> Generate some bash commands to test interactively — user creates hold, another user
> tries to take that hold, etc. Come up with a few different scenarios we can run
> interactively together.

*Claude wrote up 6 test scenarios as curl commands covering happy paths, authorization
failures, conflict handling, and bad requests. I turned these into a formal plan for
the next session.*

---

## Session 3: Automated Test Script

### Prompt 6 — Build the test script

> Implement the following plan:
>
> **Interactive API Test Scenarios**
>
> 6 scenarios to test against the running server:
> 1. Happy path — hold, confirm, verify status becomes "booked"
> 2. Unauthorized confirm — wrong email gets 403, correct email gets 201
> 3. Unauthorized delete — wrong email gets 403, then owner releases successfully
> 4. Double-hold conflict — second hold on same slot gets 409
> 5. Hold after booking — attempt to hold a booked slot gets 409
> 6. Missing fields / bad requests — 400 and 404 responses

*Claude created `scripts/test-api.sh` — a fully automated test script with 22 assertions.
It starts the dev server, seeds the database, runs all scenarios, and validates both
HTTP status codes and response body content. It hit a macOS compatibility issue
(`mapfile` not available in older bash) and fixed it.*

*All 22 assertions passed across all 6 scenarios.*

### Prompt 7 — Wrap up

> commit and continue

*Claude committed the test script, pushed, and created PR [#2](https://github.com/mattcline/escape-room-booking/pull/2)
with all 3 commits on the branch:*

1. *Core booking API with hold/confirm mechanism*
2. *Email-based authorization on confirm/delete*
3. *Interactive API test script (22 assertions, 6 scenarios)*
