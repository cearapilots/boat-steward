export type BoatName = "Flexeiras" | "Fortim" | "Taíba";

export type EquipmentSlot = "Motor BB" | "Motor BE" | "Reversor BB" | "Reversor BE" | "Gerador";

export type StatusLevel = "ok" | "warn" | "danger";

export interface Equipment {
  slot: EquipmentSlot;
  activeAsset: string;
  assetId: string;
  equipmentHours: number;
  nextChangeAt: number;
  hoursRemaining: number;
  status: StatusLevel;
  lastMaintenanceDate: string;
}

export interface Boat {
  id: string;
  name: BoatName;
  currentHours: number;
  lastUpdated: string;
  equipment: Equipment[];
}

export type MaintenanceType = "oil_change" | "overhaul" | "bearing_revision" | "other";

export interface MaintenanceRecord {
  id: string;
  boatId: string;
  boatName: BoatName;
  assetId: string;
  assetName: string;
  slot: EquipmentSlot;
  type: MaintenanceType;
  date: string;
  boatHours?: number;
  equipmentHours?: number;
  notes?: string;
  createdAt: string;
}

export interface MotorPosition {
  motorId: string;
  motorName: string;
  currentBoat: BoatName | "Reserva";
  currentSlot: EquipmentSlot | "Reserva";
  installedDate: string;
  hoursInPosition: number;
}

export interface MotorHistorySegment {
  motorId: string;
  boat: BoatName | "Reserva";
  slot: string;
  startDate: string;
  endDate: string | null;
  hours: number;
}
