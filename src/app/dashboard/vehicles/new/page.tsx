import VehicleForm from '@/components/VehicleForm'

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Add a vehicle</h1>
      <VehicleForm />
    </div>
  )
}
