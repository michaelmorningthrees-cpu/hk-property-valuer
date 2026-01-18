import fs from 'fs'
import path from 'path'

let cachedEstates = null

const loadEstates = () => {
  if (cachedEstates) return cachedEstates
  const dataPath = path.join(process.cwd(), 'data', 'hangseng.json')
  const raw = fs.readFileSync(dataPath, 'utf-8')
  cachedEstates = JSON.parse(raw)
  return cachedEstates
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { district = '', q = '' } = req.query
    const estates = loadEstates()
    const normalizedQ = String(q || '').trim()
    const normalizedDistrict = String(district || '').trim()

    let filtered = estates
    if (normalizedDistrict) {
      const exactMatches = filtered.filter((item) => item.district === normalizedDistrict)
      filtered = exactMatches.length > 0 ? exactMatches : filtered
    }
    if (normalizedQ) {
      const qLower = normalizedQ.toLowerCase()
      filtered = filtered.filter((item) => item.name.toLowerCase().includes(qLower))
    }

    const unique = new Map()
    filtered.forEach((item) => {
      if (!unique.has(item.name)) {
        unique.set(item.name, { id: item.value, name: item.name })
      }
    })
    return res.status(200).json({ estates: Array.from(unique.values()) })
  } catch (error) {
    console.error('❌ Estates API error:', error.message)
    return res.status(500).json({ error: 'Failed to load estates' })
  }
}
