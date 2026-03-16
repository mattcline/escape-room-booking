import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { POST as createHold } from "@/app/api/holds/route";
import { POST as confirmHold } from "@/app/api/holds/[holdId]/confirm/route";
import { DELETE as deleteHold } from "@/app/api/holds/[holdId]/route";
import { GET as getRooms } from "@/app/api/rooms/route";
const prisma = new PrismaClient({
  datasources: { db: { url: "file:./test.db" } },
});

let testSlotId: string;

beforeEach(async () => {
  await prisma.booking.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.room.deleteMany();

  const room = await prisma.room.create({
    data: {
      name: "Test Room",
      description: "A test room",
      difficulty: "Easy",
      maxPlayers: 4,
    },
  });

  const slot1 = await prisma.timeSlot.create({
    data: {
      roomId: room.id,
      startTime: new Date("2026-04-01T10:00:00Z"),
      endTime: new Date("2026-04-01T11:00:00Z"),
    },
  });

  testSlotId = slot1.id;
});

function makeRequest(body: object): Request {
  return new Request("http://localhost/api/holds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParamsPromise(holdId: string) {
  return { params: Promise.resolve({ holdId }) };
}

describe("Hold expiration", () => {
  it("should return 410 when confirming an expired hold", async () => {
    // Create a hold that's already expired
    const hold = await prisma.hold.create({
      data: {
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      },
    });

    const request = new Request("http://localhost/api/holds/" + hold.id + "/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerEmail: "alice@test.com" }),
    });
    const response = await confirmHold(request, makeParamsPromise(hold.id));
    expect(response.status).toBe(410);

    const body = await response.json();
    expect(body.error).toBe("Hold has expired");
  });

  it("should allow a new hold on a slot with an expired hold", async () => {
    // Create an expired hold
    await prisma.hold.create({
      data: {
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    // A new hold should succeed (expired hold gets cleaned up)
    const response = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Bob",
        playerEmail: "bob@test.com",
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.playerName).toBe("Bob");
  });

  it("should show expired holds as available in room listing", async () => {
    await prisma.hold.create({
      data: {
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const response = await getRooms();
    const rooms = await response.json();
    const slot = rooms[0].timeSlots.find(
      (s: { id: string }) => s.id === testSlotId
    );
    expect(slot.status).toBe("available");
  });
});

describe("Race conditions", () => {
  it("should only allow one hold per slot when two requests race", async () => {
    const request1 = makeRequest({
      timeSlotId: testSlotId,
      playerName: "Alice",
      playerEmail: "alice@test.com",
    });
    const request2 = makeRequest({
      timeSlotId: testSlotId,
      playerName: "Bob",
      playerEmail: "bob@test.com",
    });

    const [response1, response2] = await Promise.all([
      createHold(request1),
      createHold(request2),
    ]);

    const statuses = [response1.status, response2.status].sort();
    expect(statuses).toEqual([201, 409]);

    // Verify only one hold exists
    const holds = await prisma.hold.findMany({
      where: { timeSlotId: testSlotId },
    });
    expect(holds).toHaveLength(1);
  });
});

describe("Full confirm flow", () => {
  it("should create hold, confirm it, and produce a booking", async () => {
    // Step 1: Create a hold
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    expect(holdResponse.status).toBe(201);
    const hold = await holdResponse.json();
    expect(hold.timeSlotId).toBe(testSlotId);
    expect(hold.playerName).toBe("Alice");

    // Step 2: Confirm the hold
    const confirmRequest = new Request(
      "http://localhost/api/holds/" + hold.id + "/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: "alice@test.com" }),
      }
    );
    const confirmResponse = await confirmHold(
      confirmRequest,
      makeParamsPromise(hold.id)
    );
    expect(confirmResponse.status).toBe(201);
    const booking = await confirmResponse.json();
    expect(booking.timeSlotId).toBe(testSlotId);
    expect(booking.playerName).toBe("Alice");

    // Step 3: Verify hold is deleted and booking exists
    const holdInDb = await prisma.hold.findUnique({
      where: { id: hold.id },
    });
    expect(holdInDb).toBeNull();

    const bookingInDb = await prisma.booking.findUnique({
      where: { timeSlotId: testSlotId },
    });
    expect(bookingInDb).not.toBeNull();
    expect(bookingInDb!.playerName).toBe("Alice");
  });

  it("should reject hold on a booked slot", async () => {
    // Create and confirm a booking
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();
    await confirmHold(
      new Request("http://localhost/api/holds/" + hold.id + "/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: "alice@test.com" }),
      }),
      makeParamsPromise(hold.id)
    );

    // Try to hold the same slot
    const response = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Bob",
        playerEmail: "bob@test.com",
      })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Time slot is already booked");
  });

  it("should allow deleting a hold", async () => {
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();

    const deleteRequest = new Request(
      "http://localhost/api/holds/" + hold.id,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: "alice@test.com" }),
      }
    );
    const deleteResponse = await deleteHold(
      deleteRequest,
      makeParamsPromise(hold.id)
    );
    expect(deleteResponse.status).toBe(200);

    // Verify hold is gone
    const holdInDb = await prisma.hold.findUnique({
      where: { id: hold.id },
    });
    expect(holdInDb).toBeNull();
  });

  it("should return 403 when confirming with wrong email", async () => {
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();

    const confirmRequest = new Request(
      "http://localhost/api/holds/" + hold.id + "/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: "wrong@test.com" }),
      }
    );
    const response = await confirmHold(confirmRequest, makeParamsPromise(hold.id));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Not authorized to confirm this hold");
  });

  it("should return 400 when confirming without playerEmail", async () => {
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();

    const confirmRequest = new Request(
      "http://localhost/api/holds/" + hold.id + "/confirm",
      { method: "POST" }
    );
    const response = await confirmHold(confirmRequest, makeParamsPromise(hold.id));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("playerEmail is required");
  });

  it("should return 403 when deleting with wrong email", async () => {
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();

    const deleteRequest = new Request(
      "http://localhost/api/holds/" + hold.id,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: "wrong@test.com" }),
      }
    );
    const response = await deleteHold(deleteRequest, makeParamsPromise(hold.id));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Not authorized to release this hold");
  });

  it("should return 400 when deleting without playerEmail", async () => {
    const holdResponse = await createHold(
      makeRequest({
        timeSlotId: testSlotId,
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    const hold = await holdResponse.json();

    const deleteRequest = new Request(
      "http://localhost/api/holds/" + hold.id,
      { method: "DELETE" }
    );
    const response = await deleteHold(deleteRequest, makeParamsPromise(hold.id));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("playerEmail is required");
  });

  it("should validate required fields", async () => {
    const response = await createHold(
      makeRequest({ timeSlotId: testSlotId })
    );
    expect(response.status).toBe(400);
  });

  it("should return 404 for non-existent time slot", async () => {
    const response = await createHold(
      makeRequest({
        timeSlotId: "nonexistent",
        playerName: "Alice",
        playerEmail: "alice@test.com",
      })
    );
    expect(response.status).toBe(404);
  });
});
