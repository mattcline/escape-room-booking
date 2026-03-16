# Escape Room Booking API

A Next.js API for booking escape room time slots with a temporary "hold" mechanism. Teams can reserve a slot for 5 minutes while coordinating, then confirm or release it.

## Setup

```bash
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

The server runs at `http://localhost:3000`.

## Running Tests

```bash
npm test
```

## API Endpoints

### GET `/api/rooms`

List all rooms with time slot availability.

**Response:**
```json
[
  {
    "id": "clx...",
    "name": "The Haunted Laboratory",
    "description": "A mad scientist has left behind...",
    "difficulty": "Medium",
    "maxPlayers": 6,
    "timeSlots": [
      {
        "id": "clx...",
        "startTime": "2026-03-17T10:00:00.000Z",
        "endTime": "2026-03-17T11:00:00.000Z",
        "status": "available"
      }
    ]
  }
]
```

Status values: `"available"`, `"held"`, `"booked"`

### POST `/api/holds`

Create a 5-minute hold on a time slot.

**Request:**
```json
{
  "timeSlotId": "clx...",
  "playerName": "Alice",
  "playerEmail": "alice@example.com"
}
```

**Response (201):**
```json
{
  "id": "clx...",
  "timeSlotId": "clx...",
  "playerName": "Alice",
  "playerEmail": "alice@example.com",
  "expiresAt": "2026-03-16T15:05:00.000Z",
  "createdAt": "2026-03-16T15:00:00.000Z"
}
```

**Errors:** `400` (missing fields), `404` (slot not found), `409` (already held/booked)

### POST `/api/holds/:holdId/confirm`

Confirm a held slot, converting it into a booking.

**Response (201):**
```json
{
  "id": "clx...",
  "timeSlotId": "clx...",
  "playerName": "Alice",
  "playerEmail": "alice@example.com",
  "createdAt": "2026-03-16T15:01:00.000Z"
}
```

**Errors:** `404` (hold not found), `409` (already booked), `410` (hold expired)

### DELETE `/api/holds/:holdId`

Release a hold.

**Response (200):**
```json
{ "message": "Hold released" }
```

**Errors:** `404` (hold not found)

## Architecture Decisions

- **Lazy expiration**: Expired holds are cleaned up when a slot is accessed (during hold creation or room listing), not via a background job. This keeps the system simple without requiring cron infrastructure.
- **Separate Hold/Booking tables**: Rather than a status field on a single table, holds and bookings are distinct models. This makes the state machine explicit — a slot has a Hold OR a Booking, never both.
- **Concurrency safety (defense-in-depth)**:
  1. SQLite serialized writes provide a natural write lock
  2. `@unique` constraint on `Hold.timeSlotId` prevents double-holds at the DB level
  3. Application-level checks inside `$transaction()` provide clear error messages
  4. `P2002` unique violation catch handles any remaining race conditions

## Not Implemented

- **Background cleanup**: Expired holds are cleaned up lazily. A production system would add a cron job.
- **Authentication**: No auth. A production system would add JWT or session-based auth.
- **Rate limiting**: No rate limiting on API endpoints.
- **Notifications**: No email/SMS confirmation sent on booking.
- **Horizontal scaling**: SQLite is single-node. A production system would use PostgreSQL.

## Attribution

Built with [Claude Code](https://claude.com/claude-code) — used for planning architecture, implementing hold/confirm logic, writing concurrency tests, and generating boilerplate.
