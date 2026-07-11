import { Search, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'

function MoleculeDatabase({ molecules, selectedId, onSelect, className = '' }) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(80)
  // Filtering is memoized because the same database is rendered in desktop and
  // mobile layouts, and the full collection contains thousands of entries.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return molecules
    return molecules.filter((molecule) => molecule.searchText.includes(term))
  }, [molecules, query])
  useEffect(() => setVisibleCount(80), [query])
  // Render the list in batches to keep initial DOM work small.
  const visible = filtered.slice(0, visibleCount)

  function handleScroll(event) {
    const element = event.currentTarget
    // Append the next batch shortly before the visitor reaches the bottom.
    if (element.scrollTop + element.clientHeight > element.scrollHeight - 240) {
      setVisibleCount((count) => Math.min(filtered.length, count + 80))
    }
  }

  return (
    <div className={className}>
      <div className="database-head">
        <p className="eyebrow">Molecular index</p>
        <div className="database-title"><h2>Compound library</h2><span>{filtered.length.toLocaleString()}</span></div>
        <div className="search-wrap">
          <Search className="search-icon" size={15} />
          <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Formula, CSD code, SMILES…" aria-label="Search molecule database" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </div>
      </div>
      <div className="molecule-list" role="listbox" aria-label="Molecules" onScroll={handleScroll}>
        {visible.map((molecule) => (
          <button
            key={molecule.id}
            type="button"
            role="option"
            aria-selected={selectedId === molecule.id}
            className={`molecule-row ${selectedId === molecule.id ? 'active' : ''}`}
            onClick={() => onSelect(molecule.id)}
          >
            <img className="mol-thumb" src={`/data/molecules/${molecule.id}.svg`} alt="" loading="lazy" />
            <span className="mol-copy">
              <span className="mol-formula">{molecule.chemical_formula.unicode}</span>
              <span className="mol-code">CSD · {molecule.id}</span>
            </span>
          </button>
        ))}
        {!filtered.length && <div className="database-foot">No compounds match “{query}”.</div>}
      </div>
      <div className="database-foot">tmQMg* validation set · 3 spectral tracks per compound</div>
    </div>
  )
}

// Parent chart updates should not rerender the database unless its props change.
export default memo(MoleculeDatabase)
