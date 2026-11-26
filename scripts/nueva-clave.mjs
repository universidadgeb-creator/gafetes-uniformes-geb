// Genera una clave nueva de administrador.
//
//   npm run nueva-clave
//
// - Guarda la clave en privado/clave-admin.txt (esa carpeta NO se sube a GitHub).
// - Escribe solo su huella SHA-256 en firestore.rules.
// - Después hay que publicar las reglas:  npm run deploy:reglas
// - Los dispositivos que ya eran admin siguen siéndolo; para sacarlos usa Ajustes → Accesos.
import { createHash, randomInt } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const grupos = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join(''),
)
const clave = `GEB-${grupos.join('-')}`
const huella = createHash('sha256').update(clave, 'utf8').digest('hex')

const reglas = readFileSync('firestore.rules', 'utf8')
const nuevas = reglas.replace(
  /(hashing\.sha256\(clave\)\.toHexString\(\)\.lower\(\) == ')[0-9a-f]{64}(')/,
  `$1${huella}$2`,
)
if (nuevas === reglas && !reglas.includes(huella)) {
  console.error('No encontré dónde escribir la huella en firestore.rules.')
  process.exit(1)
}
writeFileSync('firestore.rules', nuevas)
mkdirSync('privado', { recursive: true })
writeFileSync(
  'privado/clave-admin.txt',
  `Clave de administrador de Gafetes y Uniformes GEB\r\n\r\n${clave}\r\n\r\nGenerada: ${new Date().toLocaleString('es-MX')}\r\nNo la compartas por grupos de WhatsApp. Para cambiarla: npm run nueva-clave y luego npm run deploy:reglas\r\n`,
)
console.log('Clave nueva guardada en privado/clave-admin.txt y huella escrita en firestore.rules.')
console.log('Falta publicar las reglas: npm run deploy:reglas')
