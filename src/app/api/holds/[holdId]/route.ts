import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ holdId: string }> }
) {
  const { holdId } = await params;

  let body: { playerEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "playerEmail is required" },
      { status: 400 }
    );
  }

  const { playerEmail } = body;
  if (!playerEmail) {
    return NextResponse.json(
      { error: "playerEmail is required" },
      { status: 400 }
    );
  }

  const hold = await prisma.hold.findUnique({ where: { id: holdId } });

  if (!hold) {
    return NextResponse.json({ error: "Hold not found" }, { status: 404 });
  }

  if (hold.playerEmail !== playerEmail) {
    return NextResponse.json(
      { error: "Not authorized to release this hold" },
      { status: 403 }
    );
  }

  await prisma.hold.delete({ where: { id: holdId } });

  return NextResponse.json({ message: "Hold released" });
}
