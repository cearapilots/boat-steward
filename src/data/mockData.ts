import { Boat, MotorPosition, MotorHistorySegment, MaintenanceRecord, StatusLevel } from "@/types/fleet";

function getStatus(hoursRemaining: number): StatusLevel {
  if (hoursRemaining < 50) return "danger";
  if (hoursRemaining <= 100) return "warn";
  return "ok";
}

function mkEquip(slot: any, asset: string, assetId: string, eqHours: number, nextAt: number) {
  const remaining = nextAt - eqHours;
  return { slot, activeAsset: asset, assetId, equipmentHours: eqHours, nextChangeAt: nextAt, hoursRemaining: remaining, status: getStatus(remaining), lastMaintenanceDate: "2025-03-15" };
}

export const boats: Boat[] = [
  {
    id: "flexeiras", name: "Flexeiras", currentHours: 4250, lastUpdated: "2026-04-14T18:30:00Z",
    equipment: [
      mkEquip("Motor BB", "Motor 5", "m5", 3120, 3200),
      mkEquip("Motor BE", "Motor 7", "m7", 2890, 3000),
      mkEquip("Reversor BB", "Reversor 3", "r3", 1500, 2000),
      mkEquip("Reversor BE", "Reversor 4", "r4", 1480, 2000),
      mkEquip("Gerador", "Gerador 1", "g1", 980, 1500),
    ],
  },
  {
    id: "fortim", name: "Fortim", currentHours: 3890, lastUpdated: "2026-04-14T17:45:00Z",
    equipment: [
      mkEquip("Motor BB", "Motor 3", "m3", 2750, 3000),
      mkEquip("Motor BE", "Motor 6", "m6", 1200, 1500),
      mkEquip("Reversor BB", "Reversor 1", "r1", 1100, 2000),
      mkEquip("Reversor BE", "Reversor 2", "r2", 1050, 2000),
      mkEquip("Gerador", "Gerador 2", "g2", 750, 1500),
    ],
  },
  {
    id: "taiba", name: "Taíba", currentHours: 2980, lastUpdated: "2026-04-13T14:20:00Z",
    equipment: [
      mkEquip("Motor BB", "Motor 4", "m4", 2100, 3000),
      mkEquip("Motor BE", "Motor 9", "m9", 890, 1500),
      mkEquip("Reversor BB", "Reversor 5", "r5", 800, 2000),
      mkEquip("Reversor BE", "Reversor 6", "r6", 790, 2000),
      mkEquip("Gerador", "Gerador 3", "g3", 600, 1500),
    ],
  },
];

export const motorPositions: MotorPosition[] = [
  { motorId: "m3", motorName: "Motor 3", currentBoat: "Fortim", currentSlot: "Motor BB", installedDate: "2025-08-10", hoursInPosition: 1200 },
  { motorId: "m4", motorName: "Motor 4", currentBoat: "Taíba", currentSlot: "Motor BB", installedDate: "2025-06-15", hoursInPosition: 980 },
  { motorId: "m5", motorName: "Motor 5", currentBoat: "Flexeiras", currentSlot: "Motor BB", installedDate: "2025-09-01", hoursInPosition: 1100 },
  { motorId: "m6", motorName: "Motor 6", currentBoat: "Fortim", currentSlot: "Motor BE", installedDate: "2026-01-10", hoursInPosition: 450 },
  { motorId: "m7", motorName: "Motor 7", currentBoat: "Flexeiras", currentSlot: "Motor BE", installedDate: "2025-07-20", hoursInPosition: 1350 },
  { motorId: "m8", motorName: "Motor 8", currentBoat: "Reserva", currentSlot: "Reserva", installedDate: "2026-02-01", hoursInPosition: 0 },
  { motorId: "m9", motorName: "Motor 9", currentBoat: "Taíba", currentSlot: "Motor BE", installedDate: "2026-03-01", hoursInPosition: 200 },
];

export const motorHistory: MotorHistorySegment[] = [
  { motorId: "m5", boat: "Fortim", slot: "Motor BB", startDate: "2024-01-15", endDate: "2025-03-10", hours: 1800 },
  { motorId: "m5", boat: "Taíba", slot: "Motor BE", startDate: "2025-03-10", endDate: "2025-09-01", hours: 920 },
  { motorId: "m5", boat: "Flexeiras", slot: "Motor BB", startDate: "2025-09-01", endDate: null, hours: 1100 },
  { motorId: "m7", boat: "Taíba", slot: "Motor BB", startDate: "2024-06-01", endDate: "2025-01-15", hours: 1400 },
  { motorId: "m7", boat: "Flexeiras", slot: "Motor BE", startDate: "2025-07-20", endDate: null, hours: 1350 },
  { motorId: "m3", boat: "Flexeiras", slot: "Motor BB", startDate: "2024-03-01", endDate: "2025-08-10", hours: 2200 },
  { motorId: "m3", boat: "Fortim", slot: "Motor BB", startDate: "2025-08-10", endDate: null, hours: 1200 },
];

export const maintenanceHistory: MaintenanceRecord[] = [
  { id: "1", boatId: "flexeiras", boatName: "Flexeiras", assetId: "m5", assetName: "Motor 5", slot: "Motor BB", type: "oil_change", date: "2026-03-15", boatHours: 4100, notes: "Troca de óleo 15W40", createdAt: "2026-03-15T10:00:00Z" },
  { id: "2", boatId: "fortim", boatName: "Fortim", assetId: "m3", assetName: "Motor 3", slot: "Motor BB", type: "oil_change", date: "2026-02-20", boatHours: 3700, createdAt: "2026-02-20T14:00:00Z" },
  { id: "3", boatId: "taiba", boatName: "Taíba", assetId: "m4", assetName: "Motor 4", slot: "Motor BB", type: "overhaul", date: "2025-12-01", equipmentHours: 1800, notes: "Overhaul completo", createdAt: "2025-12-01T09:00:00Z" },
];

export const lastSyncTime = "2026-04-14T18:30:00Z";
