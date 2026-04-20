// backfill_phones.mjs
// Actualiza phone1 en leads existentes que no tienen teléfono,
// leyendo los CSV SDR y SOB de la carpeta raíz del proyecto.
// Uso: node scripts/backfill_phones.mjs (desde raíz del proyecto)

import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const headers = {
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type':  'application/json',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Parsear CSV ──────────────────────────────────────────────────────────────
function parseCSV(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  const hdrs  = lines[0].split(',').map(h => h.trim())
  const rows  = []
  for (const line of lines.slice(1)) {
    if (!line.trim() || line.startsWith(',,,')) continue
    const vals = line.split(',')
    const row  = {}
    for (let i = 0; i < hdrs.length; i++) row[hdrs[i]] = (vals[i] ?? '').trim()
    if (row['LEAD'] && row['TELEFONO']) rows.push(row)
  }
  return rows
}

// ─── Cargar CSV ───────────────────────────────────────────────────────────────
const sdrRows = parseCSV('../Data INBOUND - BASE SDR.csv')
const sobRows = parseCSV('../Data INBOUND - BASE SOB.csv')
const allRows = [...sdrRows, ...sobRows]

// Mapa lead_id_external → telefono (solo los que tienen teléfono)
const phoneMap = new Map()
for (const r of allRows) {
  const phone = r.TELEFONO.trim()
  if (phone) phoneMap.set(r.LEAD, phone)
}
console.log(`CSV cargados: ${allRows.length} filas, ${phoneMap.size} con teléfono`)

// ─── Obtener leads sin teléfono en batches ────────────────────────────────────
const ids = [...phoneMap.keys()]
let updated = 0, skipped = 0, errors = 0

console.log(`\nActualizando ${ids.length} leads con teléfono desde CSV...`)

for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200)

  // Solo actualizar los que NO tienen phone1 aún
  const url = new URL(`${SUPABASE_URL}/rest/v1/leads`)
  url.searchParams.set('lead_id_external', `in.(${chunk.join(',')})`)
  url.searchParams.set('phone1', 'is.null')
  url.searchParams.set('select', 'id,lead_id_external')

  const res  = await fetch(url, { headers })
  const rows = await res.json()

  if (!Array.isArray(rows)) {
    console.error('Error leyendo leads:', rows)
    errors += chunk.length
    continue
  }

  skipped += chunk.length - rows.length

  // Actualizar uno por uno (PATCH con filtro por lead_id_external)
  for (const lead of rows) {
    const phone = phoneMap.get(lead.lead_id_external)
    if (!phone) continue

    const patchUrl = new URL(`${SUPABASE_URL}/rest/v1/leads`)
    patchUrl.searchParams.set('id', `eq.${lead.id}`)

    const patchRes = await fetch(patchUrl, {
      method:  'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body:    JSON.stringify({ phone1: phone }),
    })

    if (patchRes.ok) {
      updated++
    } else {
      const err = await patchRes.text()
      console.error(`  Error en ${lead.lead_id_external}: ${err.slice(0, 100)}`)
      errors++
    }
  }

  process.stdout.write(`  Procesados ${Math.min(i + 200, ids.length)}/${ids.length}...\r`)
  await sleep(200)
}

console.log('\n\n══════════════════════════════════')
console.log(`Actualizados : ${updated}`)
console.log(`Ya tenían tel: ${skipped}`)
console.log(`Errores      : ${errors}`)
