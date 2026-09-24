import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('demo1234', 12)

  const user = await prisma.user.upsert({
    where: { email: 'demo@riglog.ro' },
    update: {},
    create: {
      email: 'demo@riglog.ro',
      password,
      displayName: 'Demo Owner',
      location: 'Cluj-Napoca, Romania',
      accountType: 'OWNER',
      active: true,
    },
  })

  const offroad = await prisma.vehicle.create({
    data: {
      ownerId: user.id,
      projectType: 'OFFROAD',
      make: 'Suzuki',
      model: 'Grand Vitara',
      year: 2007,
      engine: '2.0 TD',
    },
  })

  await prisma.task.create({
    data: {
      vehicleId: offroad.id,
      addedByUserId: user.id,
      name: '2" lift kit',
      brand: 'Old Man Emu',
      category: 'SUSPENSION',
      status: 'DONE',
      workType: 'DIY',
      costRon: 3200,
      date: new Date('2025-03-14'),
      notes: 'Front and rear, new shocks included.',
    },
  })

  await prisma.task.create({
    data: {
      vehicleId: offroad.id,
      addedByUserId: user.id,
      name: 'Rock sliders',
      category: 'PROTECTION',
      status: 'PLANNED',
      workType: 'DIY',
      date: new Date('2025-06-01'),
    },
  })

  const restoration = await prisma.vehicle.create({
    data: {
      ownerId: user.id,
      projectType: 'RESTORATION',
      make: 'Dacia',
      model: '1310',
      year: 1985,
      purchaseDate: new Date('2025-01-10'),
      purchasePriceRon: 1500,
    },
  })

  await prisma.foundState.create({
    data: {
      vehicleId: restoration.id,
      odometer: 98000,
      knownHistory: 'Barn find, sat for 15 years. Runs but needs full restoration.',
      conditionRating: 2,
    },
  })

  await prisma.task.create({
    data: {
      vehicleId: restoration.id,
      addedByUserId: user.id,
      name: 'Strip to bare metal',
      category: 'BODY_PANELS',
      status: 'STRIPPED',
      workType: 'WORKSHOP',
      workshopName: 'Atelier Retro Auto',
      partsCostRon: 0,
      labourCostRon: 1800,
      date: new Date('2025-02-20'),
    },
  })

  console.log(`Seeded demo@riglog.ro / demo1234 with vehicles ${offroad.id}, ${restoration.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
