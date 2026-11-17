import { useEffect, useRef, useState } from 'react'

function formatCredits(value) {
  if (value >= 1000000) return `₡ ${(value / 1000000).toFixed(2)}M`
  return `₡ ${Math.round(value / 1000)}K`
}

const TABS = [
  { id: 'map', label: '城市地图', en: 'MAP' },
  { id: 'ops', label: '经营', en: 'OPS' },
  { id: 'threat', label: '战术', en: 'TACTICAL' },
  { id: 'archive', label: '档案', en: 'ARCHIVE' },
]

export default function TopBar({
  city,
  population,
  stability,
  speed,
  setSpeed,
  panel,
  setPanel,
  search,
  setSearch,
  results,
  onSelectResult,
  layers,
  toggleLayer,
}) {
  const [layersOpen, setLayersOpen] = useState(false)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!layersOpen) return
    const onClick = (event) => {
      if (layerRef.current && !layerRef.current.contains(event.target)) setLayersOpen(false)
    }
    window.addEventListener('pointerdown', onClick)
    return () => window.removeEventListener('pointerdown', onClick)
  }, [layersOpen])

  const time = `${String(city.hour).padStart(2, '0')}:${String(city.minute).padStart(2, '0')}`

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark">NN</span>
        <div>
          <strong>新纽约</strong>
          <small>NEW NEW YORK / 2077</small>
        </div>
      </div>

      <nav className="topbar__nav" aria-label="主菜单">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`topbar__tab ${panel === tab.id ? 'is-active' : ''}`}
            onClick={() => setPanel(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.en}</small>
          </button>
        ))}
      </nav>

      <div className="topbar__resources">
        <div className="resource">
          <span>资金</span>
          <strong>{formatCredits(city.credits)}</strong>
        </div>
        <div className="resource">
          <span>人口</span>
          <strong>{(population / 1000000).toFixed(2)}M</strong>
        </div>
        <div className="resource">
          <span>稳定度</span>
          <strong className={stability < 45 ? 'is-danger' : stability < 60 ? 'is-warn' : ''}>
            {stability}%
          </strong>
        </div>
      </div>

      <div className="topbar__right">
        <div className="city-search">
          <span className="city-search__icon">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索城区 / 地点"
            aria-label="搜索城区或地点"
          />
          {search && results.length > 0 && (
            <div className="city-search__results">
              {results.map((result) => (
                <button key={`${result.type}-${result.id}`} onClick={() => onSelectResult(result)}>
                  <span>{result.name}</span>
                  <small>{result.type === 'district' ? result.en : result.en}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="layers" ref={layerRef}>
          <button
            className={`topbar__icon-button ${layersOpen ? 'is-active' : ''}`}
            onClick={() => setLayersOpen((value) => !value)}
            aria-label="地图图层"
          >
            图层
          </button>
          {layersOpen && (
            <div className="layers__menu">
              <p>MAP LAYERS</p>
              {[
                ['districts', '城区边界'],
                ['pois', '兴趣点'],
                ['traffic', '车流'],
                ['grid', '坐标网格'],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="clock">
          <strong>{time}</strong>
          <span>DAY {String(city.day).padStart(2, '0')}</span>
        </div>

        <div className="speed">
          {[
            [0, 'Ⅱ'],
            [1, '1×'],
            [2, '2×'],
            [4, '4×'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={speed === value ? 'is-active' : ''}
              onClick={() => setSpeed(value)}
              aria-label={value === 0 ? '暂停' : `${value} 倍速`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
