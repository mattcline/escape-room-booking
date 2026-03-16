import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HOLD_DURATION_MS } from "@/lib/constants";
import { isHoldExpired } from "@/lib/holds";
import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  let body: { timeSlotId?: string; playerName?: string; playerEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { timeSlotId, playerName, playerEmail } = body;

  if (!timeSlotId || !playerName || !playerEmail) {
    return NextResponse.json(
      { error: "timeSlotId, playerName, and playerEmail are required" },
      { status: 400 }
    );
  }

  try {
    const hold = await prisma.$transaction(async (tx) => {
      const timeSlot = await tx.timeSlot.findUnique({
        where: { id: timeSlotId },
        include: { booking: true, hold: true },
      });

      if (!timeSlot) {
        throw new HoldError(404, "Time slot not found");
      }

      if (timeSlot.booking) {
        throw new HoldError(409, "Time slot is already booked");
      }

      if (timeSlot.hold) {
        if (isHoldExpired(timeSlot.hold)) {
          await tx.hold.delete({ where: { id: timeSlot.hold.id } });
        } else {
          throw new HoldError(409, "Time slot is already held");
        }
      }

      return tx.hold.create({
        data: {
          timeSlotId,
          playerName,
          playerEmail,
          expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        },
      });
    });

    return NextResponse.json(hold, { status: 201 });
  } catch (error) {
    if (error instanceof HoldError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Time slot is already held" },
        { status: 409 }
      );
    }

    throw error;
  }
}

class HoldError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
