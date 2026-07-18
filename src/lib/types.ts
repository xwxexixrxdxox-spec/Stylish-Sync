export type Unit =
  | "ea"
  | "box"
  | "case"
  | "pack"
  | "bag"
  | "bottle"
  | "can"
  | "roll"
  | "dozen"
  | "pair"
  | "kg"
  | "lb"
  | "oz"
  | "g"
  | "L"
  | "ml"
  | "fl oz"
  | string;

export interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  unit: Unit;
  pricePerUnit: number;
  reorderAt: number;
  updatedAt: string;
  location?: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  delta: number;
  reason: "scan-add" | "scan-remove" | "manual-adjust" | "import";
  at: string;
}

export type SupportAccessState = "unknown" | "locked" | "unlocked";

export interface AccessCheckResponse {
  access: boolean;
  plan?: string | null;
  currentPeriodEnd?: string | null;
  reason?: string;
}
