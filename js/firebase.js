// Conexión con Firebase. En localhost usa los emuladores (npm run emuladores),
// salvo que la URL lleve ?real.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'
import { firebaseConfig } from './config.js'

export {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'

const params = new URLSearchParams(location.search)
export const EN_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && !params.has('real')

const app = initializeApp(
  EN_LOCAL ? { apiKey: 'demo-key', projectId: 'demo-gafetes-geb', authDomain: '127.0.0.1' } : firebaseConfig,
)
export const auth = getAuth(app)
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

if (EN_LOCAL) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9097', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8083)
}

let promesaSesion = null

// Devuelve el usuario actual; si no hay, abre una sesión anónima.
export function sesion() {
  promesaSesion ??= new Promise((resolve, reject) => {
    let off = () => {}
    off = onAuthStateChanged(auth, (usuario) => {
      if (usuario) {
        off()
        resolve(usuario)
      } else {
        signInAnonymously(auth).catch((e) => {
          off()
          promesaSesion = null
          reject(e)
        })
      }
    })
  })
  return promesaSesion
}

export async function cerrarSesion() {
  promesaSesion = null
  await signOut(auth)
}

export function mensajeError(e) {
  const codigo = e?.code ?? ''
  if (codigo.includes('permission-denied')) return 'No tienes permiso para hacer esto.'
  if (codigo.includes('unavailable') || codigo.includes('network')) return 'Sin conexión. Revisa tu internet e intenta otra vez.'
  if (codigo.includes('admin-restricted-operation') || codigo.includes('operation-not-allowed'))
    return 'El acceso anónimo no está activado en Firebase.'
  return 'Algo salió mal. Intenta otra vez en un momento.'
}
