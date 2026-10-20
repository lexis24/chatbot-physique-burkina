import { registerAccount, loginAccount, getMe } from "../api.js"

/**
 * Session de compte élève ou décideur (optionnelle) : le token JWT est stocké dans
 * localStorage et envoyé par les appels API protégés. Un invité n'a simplement pas de token.
 */
const TOKEN_KEY = "chatmaths-auth-token"
const USERNAME_KEY = "chatmaths-auth-username"
const ROLE_KEY = "chatmaths-auth-role"
const PUBLIC_CODE_KEY = "chatmaths-auth-public-code"
export const AUTH_CHOICE_KEY = "chatmaths-auth-choice"

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null
}

export function getStoredUsername() {
  return localStorage.getItem(USERNAME_KEY) || null
}

export function getStoredRole() {
  return localStorage.getItem(ROLE_KEY) || "eleve"
}

export function getStoredPublicCode() {
  return localStorage.getItem(PUBLIC_CODE_KEY) || null
}

function storeSession(token, username, role, publicCode) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USERNAME_KEY, username)
  localStorage.setItem(ROLE_KEY, role || "eleve")
  if (publicCode) localStorage.setItem(PUBLIC_CODE_KEY, publicCode)
  localStorage.setItem(AUTH_CHOICE_KEY, "authenticated")
}

/** `profile` : voir registerAccount() dans api.js (classCode/gender/birthYear/isCandidatLibre/
 * schoolName/region — tous obligatoires sauf schoolName/region pour un candidat libre). */
export async function register(username, password, profile) {
  const { token, username: confirmedUsername, role, public_code, consent_ok, profile_complete, class_code } =
    await registerAccount(username, password, profile)
  storeSession(token, confirmedUsername, role, public_code)
  return { username: confirmedUsername, role, publicCode: public_code, consentOk: consent_ok, profileComplete: profile_complete, classCode: class_code }
}

export async function login(username, password) {
  const { token, username: confirmedUsername, role, public_code, consent_ok, profile_complete, class_code } =
    await loginAccount(username, password)
  storeSession(token, confirmedUsername, role, public_code)
  return { username: confirmedUsername, role, publicCode: public_code, consentOk: consent_ok, profileComplete: profile_complete, classCode: class_code }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(PUBLIC_CODE_KEY)
}

/** Valide le token stocké auprès du backend ; retourne {username, role, ...} ou null. */
export async function restoreSession() {
  const token = getToken()
  if (!token) return null
  try {
    const { username, role, public_code, consent_ok, profile_complete, class_code } = await getMe(token)
    localStorage.setItem(USERNAME_KEY, username)
    localStorage.setItem(ROLE_KEY, role || "eleve")
    if (public_code) localStorage.setItem(PUBLIC_CODE_KEY, public_code)
    return { username, role, publicCode: public_code, consentOk: consent_ok, profileComplete: profile_complete, classCode: class_code }
  } catch {
    logout()
    return null
  }
}
