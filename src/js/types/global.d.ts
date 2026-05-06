/**
 * src/js/types/global.d.ts
 *
 * Khai bao type cho window object voi cac function/property duoc gan
 * trong codebase (CSP refactor Phase 55-58e su dung pattern window.X
 * de delegation handler dispatch). 
 *
 * Khi migrate file .js -> .ts, neu touch window.X -> them khai bao o day.
 * Khong override built-in window properties.
 *
 * Strict pattern: tat ca optional vi nhieu function chi exist sau init.
 */

// ── Firebase types tu Realtime Database ──
type FirebaseKey = string;

// ── Generic record co _key (Firebase push key) ──
interface RecordWithKey {
  _key: string;
  [field: string]: unknown;
}

// ── Cache schema ──
interface AppCache {
  hydro: Record<FirebaseKey, RecordWithKey>;
  electrode: Record<FirebaseKey, RecordWithKey>;
  electrochem: Record<FirebaseKey, RecordWithKey>;
  chemicals: Record<FirebaseKey, RecordWithKey>;
  members: Record<FirebaseKey, RecordWithKey>;
  history: Record<FirebaseKey, RecordWithKey>;
  ink: Record<FirebaseKey, RecordWithKey>;
  equipment: Record<FirebaseKey, RecordWithKey>;
  groups: Record<FirebaseKey, RecordWithKey>;
}

// ── Auth state ──
interface CurrentAuth {
  uid?: string;
  email?: string;
  name?: string;
  role?: 'superadmin' | 'admin' | 'member' | string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isMember?: boolean;
}

// ── Window extensions ──
declare global {
  interface Window {
    // ── State ──
    cache?: AppCache;
    currentAuth?: CurrentAuth;

    // ── Modal ──
    openModal?: (modalId: string) => void;
    closeModal?: (modalId: string) => void;

    // ── Page navigation ──
    showPage?: (pageId: string, target?: HTMLElement) => void;
    switchAuthTab?: (tab: 'login' | 'register') => void;
    switchElectrodeTab?: (tab: 'electrode' | 'ink', target?: HTMLElement) => void;
    switchBookingView?: (view: 'list' | 'calendar') => void;

    // ── Auth ──
    doLogin?: () => void;
    doRegister?: () => void;
    doLogout?: () => void;
    togglePasswordVisibility?: () => void;
    checkAdmin?: () => void;
    openChangePassword?: () => void;

    // ── Save handlers ──
    saveHydro?: () => void;
    saveElectrode?: () => void;
    saveInk?: () => void;
    saveElectrochem?: () => void;
    saveChemical?: () => void;
    saveEquipment?: () => void;
    saveBooking?: () => void;
    saveMember?: () => void;

    // ── Render functions (per page) ──
    renderHydro?: () => void;
    renderElectrode?: () => void;
    renderElectrochem?: () => void;
    renderChemicals?: () => void;
    renderEquipment?: () => void;
    renderBooking?: () => void;
    renderNotificationsList?: () => void;

    // ── Search ──
    searchChem?: (input: HTMLInputElement) => void;
    searchElectrode?: (input: HTMLInputElement) => void;
    headerSearch?: (input: HTMLInputElement) => void;

    // ── Calc helpers ──
    calcMol?: (input: HTMLInputElement) => void;
    calcLoading?: () => void;
    autoPrefix?: (input: HTMLInputElement, prefix: string) => void;
    fillInkFormula?: () => void;
    syncUnit?: () => void;
    lookupCAS?: () => void;

    // ── Image upload ──
    uploadHydroImage?: (input: HTMLInputElement | { files: File[] }) => void;
    uploadElectrodeImage?: (input: HTMLInputElement | { files: File[] }) => void;
    uploadInkImage?: (input: HTMLInputElement | { files: File[] }) => void;
    uploadChemicalImage?: (input: HTMLInputElement | { files: File[] }) => void;
    previewEquipmentImage?: (input: HTMLInputElement | { files: File[] }) => void;
    deleteHydroImage?: () => void;
    deleteElectrodeImage?: () => void;
    deleteInkImage?: () => void;
    deleteChemicalImage?: () => void;
    removeEquipmentImagePreview?: () => void;
    dropHydroImage?: (e: DragEvent) => void;
    dropElectrodeImage?: (e: DragEvent) => void;
    dropInkImage?: (e: DragEvent) => void;
    dropChemicalImage?: (e: DragEvent) => void;
    dropEquipmentImage?: (e: DragEvent) => void;

    // ── Calendar ──
    calNavWeek?: (delta: -1 | 1) => void;
    calToday?: () => void;
    calJumpToDate?: (date: string) => void;
    calOnDragStart?: (e: DragEvent, key: string) => void;
    calOnDragEnd?: (e: DragEvent) => void;
    calOnDragOver?: (e: DragEvent) => void;
    calOnDragLeave?: (e: DragEvent) => void;
    calOnDragEnterEdge?: (e: DragEvent, dir: -1 | 1) => void;
    calOnDragLeaveEdge?: (e: DragEvent) => void;

    // ── Day view ──
    dayNav?: (delta: -1 | 1) => void;
    dayToday?: () => void;
    dayJumpTo?: (date: string) => void;

    // ── Booking actions ──
    toggleBookingSort?: (key: string) => void;
    confirmRejectBooking?: () => void;
    openBookingModal?: () => void;

    // ── Sidebar ──
    toggleMobileSidebar?: () => void;
    closeMobileSidebar?: () => void;
    toggleBellDropdown?: () => void;
    markAllNotificationsRead?: () => void;
    clearAllNotifications?: () => void;
    editLabTitle?: () => void;
    editSubtitle?: () => void;

    // ── Toast ──
    undoDelete?: () => void;
    hideToast?: () => void;
    showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;

    // ── Theme ──
    applyTheme?: (theme: string) => void;
    toggleDarkMode?: (checked: boolean) => void;
    openCustomThemePicker?: () => void;

    // ── Member filter ──
    setMemberFilter?: (target: string, value: string) => void;

    // ── Avatar ──
    changeAvatar?: (input: HTMLInputElement) => void;
    resetAvatar?: () => void;

    // ── Excel export ──
    exportHydroExcel?: () => void;
    exportElectrodeExcel?: () => void;
    exportElectrochemExcel?: () => void;
    exportChemicalsExcel?: () => void;
    exportEquipmentExcel?: () => void;
    exportBookingsExcel?: () => void;

    // ── Modal helpers ──
    addChem?: () => void;
    addInkRow?: (tbodyId?: string) => void;
    addChemGroup?: () => void;
    addEqGroup?: () => void;
    removeChem?: (target: HTMLElement) => void;

    // ── Chat widget ──
    toggleChatWidget?: (state?: boolean) => void;
    chatSend?: () => void;
    chatInput?: (input: HTMLInputElement) => void;
    chatKeydown?: (e: KeyboardEvent) => void;
    chatPickImage?: (input: HTMLInputElement) => void;
    chatClearImage?: () => void;
    showClearAllConfirm?: (target: HTMLElement) => void;

    // ── PDF report ──
    openPdfReportModal?: () => void;

    // ── History ──
    toggleHistory?: () => void;

    // ── Internal timers (set by various hover wrappers) ──
    _bellTimer?: number;
    _avatarTimer?: number;
    _srchTimer?: number;
    _resetHydroPage?: () => void;
    _resetElectrodePage?: () => void;
    _resetElectrochemPage?: () => void;

    // ── Generic catchall (de tranh type error trong qua trinh migrate) ──
    [key: string]: unknown;
  }
}

export {};
