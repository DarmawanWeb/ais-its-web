export {
  authApi,
  normalizeMemberships,
  type AuthSession,
  type AuthUser,
  type Me,
  type Membership,
  type MfaSetup,
} from './auth-api';
export { Can, RedirectIfAuthenticated, RequireAuth, RequirePermission } from './guards';
export {
  useCanAccessOrg,
  useMe,
  usePermission,
  usePermissions,
  useSession,
  type SessionView,
} from './hooks';
export { AUTH_PATHS, HOME_PATH, loginPath, safeRedirect } from './paths';
export {
  claimsCanAccessOrg,
  permissionsOfRoles,
  satisfies,
  type PermissionRequirement,
} from './permissions';
export {
  bootstrapSession,
  clearSession,
  getAccessToken,
  initSession,
  login,
  logout,
  refreshAccessToken,
  sessionStore,
  switchOrganization,
  useSessionStore,
  verifyMfa,
  type LoginOutcome,
  type SessionState,
  type SessionStatus,
} from './session';
export { decodeJwtPayload, parseAccessToken, type SessionClaims } from './token';
