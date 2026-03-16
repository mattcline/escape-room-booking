import { Hold, PrismaClient } from "@prisma/client";

export function isHoldExpired(hold: Hold): boolean {
  return new Date() > hold.expiresAt;
}

export async function cleanupExpiredHold(
  prisma: PrismaClient,
  timeSlotId: string
): Promise<boolean> {
  const hold = await prisma.hold.findUnique({ where: { timeSlotId } });
  if (hold && isHoldExpired(hold)) {
    await prisma.hold.delete({ where: { id: hold.id } });
    return true;
  }
  return false;
}
