export type { components, paths, operations } from "./types";
import type { components as Components } from "./types";

export type ServiceHome = Components["schemas"]["ServiceHome"];
export type InstitutionHome = Components["schemas"]["InstitutionHome"];
export type Kpi = Components["schemas"]["Kpi"];
export type FeedItem = Components["schemas"]["FeedItem"];
export type ServiceCard = Components["schemas"]["ServiceCard"];
export type ModuleTile = Components["schemas"]["ModuleTile"];
export type AgentAskRequest = Components["schemas"]["AgentAskRequest"];
export type AgentAskResponse = Components["schemas"]["AgentAskResponse"];
export type SessionUser = Components["schemas"]["SessionUser"];
export type AccountEntity = Components["schemas"]["AccountEntity"];
export type AccountOverview = Components["schemas"]["AccountOverview"];
export type AccountStats = Components["schemas"]["AccountStats"];
export type TeamMember = Components["schemas"]["TeamMember"];
export type NotificationPrefs = Components["schemas"]["NotificationPrefs"];
export type OrderSummary = Components["schemas"]["OrderSummary"];

export { Icon, IconSprite, ICON_IDS } from "./icons/Icon";
export type { IconName, IconProps } from "./icons/Icon";

export { AppShell } from "./components/AppShell";
export { Sidebar, type NavItem } from "./components/Sidebar";
export { TopBar, type TopBarMenuItem } from "./components/TopBar";
export { TopBarSearch } from "./components/TopBarSearch";
export { AskBox } from "./components/AskBox";
export { HeroAsk } from "./components/HeroAsk";
export { AskBar } from "./components/AskBar";
export { Dock } from "./components/Dock";
export type { AskBarProps, AskBarVariant } from "./components/AskBar";
export { LiveFeedPanel, type LiveAlert } from "./components/LiveFeedPanel";
export { SubTabs, type SubTab } from "./components/SubTabs";
export { SvcBandArt, AiCardArt } from "./components/SvcBandArt";
export {
  ModuleHeader,
  DataRow,
  RecordDrawer,
  Toolbar,
  Toast,
  type DataMetaItem,
  type DrawerAction,
  type DrawerSection,
  type SummaryTile,
} from "./components/ModuleUI";
export {
  useDialogs,
  DialogProvider,
  DialogHost,
  ConfirmModal,
  MessageAlert,
  PromptModal,
  globalAlert,
  type DialogsApi,
  type ConfirmOptions,
  type AlertOptions,
  type PromptOptions,
} from "./components/Dialogs";
export { StaffPickerDrawer } from "./components/StaffPickerDrawer";
/** Alias — roster name `<UserPicker>` */
export { StaffPickerDrawer as UserPicker } from "./components/StaffPickerDrawer";
export {
  useConfirmAction,
  ConfirmActionButton,
  type ConfirmActionOptions,
} from "./components/ConfirmAction";
export { DemoBadge, useDemoMode } from "./components/DemoBadge";
export {
  DeskLink,
  deskAvailable,
  deskUrl,
  openDesk,
  type DeskLinkProps,
} from "./components/DeskLink";
export {
  StateActions,
  type AllowedAction,
  type StateActionsProps,
} from "./components/StateActions";
export {
  FormDrawer,
  type FormDrawerField,
  type FormDrawerProps,
} from "./components/FormDrawer";
export { FileDownload, type FileDownloadProps } from "./components/FileDownload";

export { apiBase, wsBase, apiFetch, askAgent } from "./api/client";
export {
  ApiError,
  extractDetail,
  humanizeApiDetail,
  showApiError,
  apiErrorFromResponse,
} from "./api/errors";
export { useFeed } from "./api/useFeed";
export { useLiveFeed, type UseLiveFeedOptions } from "./api/useLiveFeed";
export { useUpdates, type UpdateItem } from "./api/useUpdates";
export type {
  AllowedAction as Wave1AllowedAction,
  AuditPatchBody,
  BallotVoteBody,
  EstoreCart,
  EstoreCartItem,
  EstoreOrderStatus,
  FieldSummary,
} from "./api/wave1Contract";

export {
  AuthModal,
  AuthError,
  IdleLockGate,
  sessionFetch,
  onAuthSessionEvent,
  login,
  register,
  requestOtp,
  requestPasswordReset,
  unlockSession,
  touchSession,
  inviteStaff,
  logout,
  me,
  isLoginChallenge,
  getStoredToken,
  setStoredToken,
  getCsrfToken,
  setCsrfToken,
  STAFF_ROLES,
  FIELD_ESS_ROLES,
  DESK_ONLY_ROLES,
  INSTITUTION_PORTAL_PATH,
  FIELD_PORTAL_PATH,
  SERVICE_PORTAL_PATH,
  hasStaffRole,
  hasDeskOnlyRole,
  hasFieldEssRole,
  redirectStaffAfterLogin,
  redirectStaffToInstitution,
} from "./auth";
export type {
  AuthModalProps,
  IdleLockProps,
  AuthSessionEvent,
  LoginRequest,
  LoginResult,
  LoginChallenge,
  RegisterRequest,
  AuthRequiredError,
  InviteStaffRequest,
  InviteStaffResponse,
  PasswordResetRequest,
  PasswordResetResponse,
  Session,
} from "./auth";

export {
  BrandLogo,
  SiteFooter,
  type SiteFooterHealth,
  type SiteFooterColumn,
  type SiteFooterContact,
} from "./brand";

export {
  brand,
  themeColor,
  themeBackground,
  prefersReducedMotion,
  focusFirst,
  trapFocus,
  onEscape,
  setBodyScrollLocked,
} from "./system";
export type { BrandColor } from "./system";
export { DateField, MonthField, type DateFieldProps, type MonthFieldProps } from "./components/DatePicker";
