import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isHoldExpired } from "@/lib/holds";
import { Prisma } from "@prisma/client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ holdId: string }> }
) {
  const { holdId } = await params;

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const hold = await tx.hold.findUnique({
        where: { id: holdId },
      });

      if (!hold) {
        throw new ConfirmError(404, "Hold not found");
      }

      if (isHoldExpired(hold)) {
        await tx.hold.delete({ where: { id: hold.id } });
        throw new ConfirmError(410, "Hold has expired");
      }

      const newBooking = await tx.booking.create({
        data: {
          timeSlotId: hold.timeSlotId,
          playerName: hold.playerName,
          playerEmail: hold.playerEmail,
        },
      });

      await tx.hold.delete({ where: { id: hold.id } });

      return newBooking;
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof ConfirmError) {
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
        { error: "Time slot is already booked" },
        { status: 409 }
      );
    }

    throw error;
  }
}

class ConfirmError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
