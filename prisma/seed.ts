import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.booking.deleteMany();
  await prisma.hold.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.room.deleteMany();

  const rooms = [
    {
      name: "The Haunted Laboratory",
      description:
        "A mad scientist has left behind a series of puzzles in their abandoned lab. Can you solve them before the experiment goes wrong?",
      difficulty: "Medium",
      maxPlayers: 6,
    },
    {
      name: "Prison Break",
      description:
        "You've been wrongfully imprisoned. You have one hour to find the hidden escape route before the guards return.",
      difficulty: "Hard",
      maxPlayers: 8,
    },
    {
      name: "The Lost Temple",
      description:
        "Deep in the jungle, an ancient temple holds untold secrets. Navigate its traps and puzzles to claim the treasure.",
      difficulty: "Easy",
      maxPlayers: 4,
    },
  ];

  // Create rooms with hourly time slots for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  for (const roomData of rooms) {
    const room = await prisma.room.create({ data: roomData });

    // Create hourly slots from 10 AM to 5 PM (7 slots)
    for (let hour = 0; hour < 7; hour++) {
      const startTime = new Date(tomorrow);
      startTime.setHours(10 + hour);

      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 1);

      await prisma.timeSlot.create({
        data: {
          roomId: room.id,
          startTime,
          endTime,
        },
      });
    }
  }

  console.log("Seeded 3 rooms with 7 time slots each (21 total).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
