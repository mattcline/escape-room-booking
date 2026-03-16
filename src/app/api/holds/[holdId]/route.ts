import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ holdId: string }> }
) {
  const { holdId } = await params;

  const hold = await prisma.hold.findUnique({ where: { id: holdId } });

  if (!hold) {
    return NextResponse.json({ error: "Hold not found" }, { status: 404 });
  }

  await prisma.hold.delete({ where: { id: holdId } });

  return NextResponse.json({ message: "Hold released" });
}
