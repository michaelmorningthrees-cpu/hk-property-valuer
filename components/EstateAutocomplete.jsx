import { useEffect, useRef, useState } from 'react'

const EstateAutocomplete = ({ district, value, estateId, onChange, disabled }) => {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(value || '')
  const containerRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const handler = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const fetchEstates = async () => {
      if (!open) return
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (district) params.set('district', district)
        if (query) params.set('q', query)
        const response = await fetch(`/api/estates?${params.toString()}`)
        const data = await response.json()
        setOptions(data.estates || [])
      } catch (error) {
        console.error('Error loading estates:', error)
        setOptions([])
      } finally {
        setLoading(false)
      }
    }

    fetchEstates()
  }, [district, query, open])

  const handleInputChange = (e) => {
    const nextValue = e.target.value
    setQuery(nextValue)
    onChange({ name: nextValue, id: '' })
    if (!open) setOpen(true)
  }

  const handleSelect = (option) => {
    onChange({ name: option.name, id: option.id })
    setQuery(option.name)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        id="estate"
        name="estate"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder="例如：藍天海岸"
        className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
        required
        disabled={disabled}
        autoComplete="off"
      />
      <input type="hidden" name="estateId" value={estateId || ''} />
      {open && (
        <div className="absolute z-10 mt-2 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
          {loading && (
            <div className="px-4 py-2 text-sm text-gray-500">載入中...</div>
          )}
          {!loading && options.map((option) => (
            <button
              key={`${option.id}-${option.name}`}
              type="button"
              onMouseDown={() => handleSelect(option)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50"
            >
              {option.name}
            </button>
          ))}
          {!loading && options.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-500">
              找不到屋苑，可直接輸入自訂名稱
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default EstateAutocomplete
