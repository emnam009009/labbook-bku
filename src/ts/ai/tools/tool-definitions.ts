/**
 * Tool definitions for frontend display (e.g., showing tool calls in UI).
 *
 * Authoritative source is backend (functions/src/tools/registry.ts).
 * This is just a mirror for type safety + UI rendering.
 */
// @ts-nocheck

export interface ToolMetadata {
  name: string;
  description: string;
  /** Vietnamese display name */
  displayName: string;
  /** Lucide icon name */
  icon: string;
}

export const TOOL_METADATA: Record<string, ToolMetadata> = {
  searchChemicals: {
    name: "searchChemicals",
    displayName: "Tra cứu hóa chất",
    description: "Tìm hóa chất trong kho",
    icon: "flask-conical",
  },
  searchEquipment: {
    name: "searchEquipment",
    displayName: "Tra cứu thiết bị",
    description: "Tìm thiết bị lab",
    icon: "wrench",
  },
  searchExperiments: {
    name: "searchExperiments",
    displayName: "Tra cứu thí nghiệm",
    description: "Tìm thí nghiệm đã thực hiện",
    icon: "beaker",
  },
  getBookings: {
    name: "getBookings",
    displayName: "Lịch booking",
    description: "Tra cứu lịch sử dụng thiết bị",
    icon: "calendar",
  },
  listMembers: {
    name: "listMembers",
    displayName: "Danh sách thành viên",
    description: "Liệt kê member của lab",
    icon: "users",
  },
  getCurrentDate: {
    name: "getCurrentDate",
    displayName: "Ngày hiện tại",
    description: "Ngày giờ hiện tại (VN)",
    icon: "clock",
  },
};

export function getToolDisplayName(name: string): string {
  return TOOL_METADATA[name]?.displayName || name;
}
