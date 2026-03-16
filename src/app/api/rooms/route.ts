import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isHoldExpired } from "@/lib/holds";

export async function GET() {
  const rooms = await prisma.room.findMany({
    include: {
      timeSlots: {
        include: {
          hold: true,
          booking: true,
        },
        orderBy: { startTime: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    difficulty: room.difficulty,
    maxPlayers: room.maxPlayers,
    timeSlots: room.timeSlots.map((slot) => {
      let status: "available" | "held" | "booked";
      if (slot.booking) {
        status = "booked";
      } else if (slot.hold && !isHoldExpired(slot.hold)) {
        status = "held";
      } else {
        status = "available";
      }

      return {
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status,
      };
    }),
  }));

  return NextResponse.json(result);
}
