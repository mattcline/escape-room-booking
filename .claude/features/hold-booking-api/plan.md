# Escape Room Booking API — Implementation Plan

## Tasks

- [x] Task 1: Project Scaffolding (Next.js + Prisma + Vitest)
- [x] Task 2: Prisma Schema + Seed (Room, TimeSlot, Hold, Booking models)
- [x] Task 3: Shared Libraries (prisma singleton, constants, hold helpers)
- [x] Task 4: API Routes (GET /api/rooms, POST /api/holds, POST /api/holds/:id/confirm, DELETE /api/holds/:id)
- [x] Task 5: Tests (expiration, race conditions, full confirm flow)
- [x] Task 6: README
- [x] Task 7: Final Verification
- [x] Task 8: Email-based authorization for hold confirm/delete
- [x] Task 9: Interactive API test scenarios script (scripts/test-api.sh)

## Notes

- Used Prisma v6 instead of v7 due to v7's `prisma-client` generator requiring ESM-only output with extensionless imports that don't work with Node.js ESM resolution or tsx
- SQLite + Prisma v6 `prisma-client-js` works out of the box with `@prisma/client` import
