import { registerAccount, loginAccount, getMe } from "../api.js"

/**
 * Session de compte élève ou décideur (optionnelle) : le token JWT est stocké dans
 * localStorage et envoyé par les appels API protégés. Un invité n'a simplement pas de token.
 */
const TOKEN_KEY = "chatphysique-auth-token"
const USERNAME_KEY = "chatphysique-auth-username"
const ROLE_KEY = "chatphysique-auth-role"
const PUBLIC_CODE_KEY = "chatphysique-auth-public-code"
export const AUTH_CHOICE_KEY = "chatphysique-auth-choice"

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

/** Réponse de /api/auth/login, /register ou /me -> session côté interface. classFree /
 * accountClassCode : comptes partagés avec les maths, dont la classe (6ème, 5ème, ou aucune) n'est
 * pas au programme de cette matière — l'élève choisit alors librement son niveau (voir App.jsx). */
function sessionFromResponse(data) {
  return {
    username: data.username,
    role: data.role,
    publicCode: data.public_code,
    consentOk: data.consent_ok,
    profileComplete: data.profile_complete,
    classCode: data.class_code,
    classFree: data.class_free === true,
    accountClassCode: data.account_class_code || null,
  }
}

/** `profile` : voir registerAccount() dans api.js (classCode/gender/birthYear/isCandidatLibre/
 * schoolName/region — tous obligatoires sauf schoolName/region pour un candidat libre). */
export async function register(username, password, profile) {
  const data = await registerAccount(username, password, profile)
  storeSession(data.token, data.username, data.role, data.public_code)
  return sessionFromResponse(data)
}

export async function login(username, password) {
  const data = await loginAccount(username, password)
  storeSession(data.token, data.username, data.role, data.public_code)
  return sessionFromResponse(data)
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
    const data = await getMe(token)
    localStorage.setItem(USERNAME_KEY, data.username)
    localStorage.setItem(ROLE_KEY, data.role || "eleve")
    if (data.public_code) localStorage.setItem(PUBLIC_CODE_KEY, data.public_code)
    return sessionFromResponse(data)
  } catch {
    logout()
    return null
  }
}
