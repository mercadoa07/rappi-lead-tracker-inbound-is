// import_new_leads.mjs
// Importa Data INBOUND - BASE SDR.csv y Data INBOUND - BASE SOB.csv
// Distribuye leads nuevos round-robin entre líderes por país
// Uso: node scripts/import_new_leads.mjs (desde raíz del proyecto)

import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const headers = {
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type':  'application/json',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Líderes por país ─────────────────────────────────────────────────────────
const LEADERS = {
  CO: ['1313b940-aac5-4d3d-a7e2-62175b3c6a68', 'e7deed54-ba69-44bd-8a01-6f710f5c40d8'], // Marcela, Nicolas
  MX: ['f1ea4dcd-a2c5-4ef8-875f-aad23a0c193a', '32b27c1b-3cd6-4d67-9b8e-51fec0d86ce1',
       'd6432669-2acc-466d-8925-7e81f2a4ba57', '250375de-9d12-4135-a7d2-27ebee02843d',
       '6e94078d-c82e-400c-9ba6-b3f7a2804f3f'], // Maria, Sebastian, Estefany, Oscar C, Alejandro
  AR: ['14b775e3-a538-4952-a7eb-82e6298085e3'], // Camila
  PE: ['9366691b-2a2f-4c67-b22a-ed441aeb1847'], // Oscar Barajas
  CL: ['14b775e3-a538-4952-a7eb-82e6298085e3'], // Camila
  EC: ['9366691b-2a2f-4c67-b22a-ed441aeb1847'], // Oscar Barajas
}

// ─── Parsear CSV ──────────────────────────────────────────────────────────────
function parseCSV(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (const line of lines.slice(1)) {
    if (!line.trim() || line.startsWith(',,,')) continue
    const vals = line.split(',')
    const row = {}
    for (let i = 0; i < headers.length; i++) row[headers[i]] = (vals[i] ?? '').trim()
    if (row['COUNTRY'] && row['LEAD']) rows.push(row)
  }
  return rows
}

// ─── Verificar duplicados en DB ───────────────────────────────────────────────
async function getExistingIds(ids) {
  const existing = new Set()
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const url = new URL(`${SUPABASE_URL}/rest/v1/leads`)
    url.searchParams.set('lead_id_external', `in.(${chunk.join(',')})`)
    url.searchParams.set('select', 'lead_id_external')
    const res = await fetch(url, { headers })
    const data = await res.json()
    for (const r of data) existing.add(r.lead_id_external)
  }
  return existing
}

// ─── Upsert batch ─────────────────────────────────────────────────────────────
async function insertBatch(rows) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?on_conflict=lead_id_external`,
    {
      method:  'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify(rows),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err.slice(0, 300))
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const sdrRows = parseCSV('../Data INBOUND - BASE SDR.csv')
const sobRows = parseCSV('../Data INBOUND - BASE SOB.csv')
const allRows = [...sdrRows, ...sobRows]

console.log(`SDR: ${sdrRows.length} | SOB: ${sobRows.length} | Total: ${allRows.length}`)

// Filtrar US y países sin líder
const validRows = allRows.filter(r => LEADERS[r.COUNTRY])
const skippedCountry = allRows.length - validRows.length
console.log(`Países sin líder (US etc): ${skippedCountry} saltados`)

// Deduplicar entre archivos
const seen = new Map()
for (const r of validRows) {
  if (!seen.has(r.LEAD)) seen.set(r.LEAD, r)
}
const deduped = [...seen.values()]
console.log(`Duplicados entre archivos: ${validRows.length - deduped.length}`)

// Verificar contra DB
console.log('\nVerificando duplicados contra DB...')
const allIds = deduped.map(r => r.LEAD)
const existingIds = await getExistingIds(allIds)
const newRows = deduped.filter(r => !existingIds.has(r.LEAD))
console.log(`Ya existen en DB: ${existingIds.size}`)
console.log(`Leads nuevos a insertar: ${newRows.length}`)

// Distribuir round-robin por país
const counters = {}
const batch = []

for (const row of newRows) {
  const country = row.COUNTRY
  const leaders = LEADERS[country]
  if (!counters[country]) counters[country] = 0
  const leaderId = leaders[counters[country] % leaders.length]
  counters[country]++

  const source = (row.ENTRY_METHOD || '').toUpperCase() === 'SOB' ? 'SOB' : 'SDR'
  const assignedAt = row.START_DATE_TIME
    ? `${row.START_DATE_TIME}T00:00:00Z`
    : new Date().toISOString()

  const phone = (row.TELEFONO || '').trim() || null

  batch.push({
    lead_id_external:        row.LEAD,
    name:                    (row.NAME || row.BRAND_NAME || row.LEAD).trim(),
    current_stage:           'SIN_CONTACTO',
    country,
    source,
    assigned_to_id:          leaderId,
    assigned_at:             assignedAt,
    ops_zone:                (row.OPS_ZONE || row.MICROZONE_NAME || '').trim() || null,
    phone1:                  phone,
    negociacion_exitosa:     false,
    bloqueado:               false,
    tiene_intento_contacto:  false,
    tiene_contacto_efectivo: false,
  })
}

// Resumen por país
console.log('\nDistribución por país:')
for (const [c, n] of Object.entries(counters)) {
  const leaders = LEADERS[c]
  const perLeader = Math.floor(n / leaders.length)
  const remainder = n % leaders.length
  console.log(`  ${c}: ${n} leads → ${leaders.length} líderes (~${perLeader}${remainder ? '+' : ''} c/u)`)
}

// Insertar en batches de 500
console.log('\nInsertando...')
let totalInserted = 0, totalErrors = 0

for (let i = 0; i < batch.length; i += 500) {
  const chunk = batch.slice(i, i + 500)
  try {
    await insertBatch(chunk)
    totalInserted += chunk.length
    process.stdout.write(`  ✓ ${totalInserted} insertados...\r`)
  } catch (e) {
    totalErrors += chunk.length
    console.error(`\n  ✗ Error chunk ${i}: ${e.message}`)
  }
  await sleep(300)
}

console.log('\n\n══════════════════════════════════')
console.log(`Insertados   : ${totalInserted}`)
console.log(`Ya existían  : ${existingIds.size}`)
console.log(`Saltados     : ${skippedCountry}`)
console.log(`Errores      : ${totalErrors}`)
