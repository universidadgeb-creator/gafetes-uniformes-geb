// Arranca los emuladores de Firebase (Auth, Firestore y Hosting) para probar en local.
//
//   npm run emuladores              → sitio en http://127.0.0.1:5190  · consola en http://127.0.0.1:4003
//   node scripts/emuladores.mjs --exec "comando"   → arranca, corre el comando y cierra (pruebas)
//
// Busca Java en JAVA_HOME y luego en ~/.jdks/*. Los datos se guardan en .emuladores/ al cerrar.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export const PROYECTO_EMULADOR = 'demo-gafetes-geb'
const DATOS = '.emuladores'
const JAVA = process.platform === 'win32' ? 'java.exe' : 'java'

function carpetaJava() {
  const candidatas = []
  if (process.env.JAVA_HOME) candidatas.push(join(process.env.JAVA_HOME, 'bin'))
  const jdks = join(homedir(), '.jdks')
  if (existsSync(jdks)) {
    for (const carpeta of readdirSync(jdks).sort().reverse()) candidatas.push(join(jdks, carpeta, 'bin'))
  }
  return candidatas.find((c) => existsSync(join(c, JAVA))) ?? null
}

const env = { ...process.env }
const binJava = carpetaJava()
if (binJava) {
  const clave = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[clave] = `${binJava}${delimiter}${env[clave] ?? ''}`
}

const FIREBASE = join('node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')
const iExec = process.argv.indexOf('--exec')
const args =
  iExec >= 0
    ? [FIREBASE, 'emulators:exec', '--only', 'auth,firestore', '--project', PROYECTO_EMULADOR, process.argv[iExec + 1]]
    : [
        FIREBASE,
        'emulators:start',
        '--project',
        PROYECTO_EMULADOR,
        ...(existsSync(DATOS) ? ['--import', DATOS] : []),
        '--export-on-exit',
        DATOS,
      ]

const hijo = spawn(process.execPath, args, { stdio: 'inherit', env })
hijo.on('exit', (codigo) => process.exit(codigo ?? 0))
for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => hijo.kill(senal))
