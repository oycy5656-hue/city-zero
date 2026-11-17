const THREAT_LABELS = {
  1: '低',
  2: '警戒',
  3: '高',
  4: '危险',
  5: '失控',
}

export default function DistrictRail({
  districts,
  selectedDistrict,
  onSelect,
  onFocus,
  stability,
}) {
  return (
    <aside className="district-rail">
      <div className="rail-header">
        <p className="hud-label">CITY COORDINATOR / 01</p>
        <h1>零号城</h1>
        <p className="rail-header__sub">六区共管 · 城市协调人终端</p>
        <div className="rail-stability">
          <div>
            <span>全局稳定度</span>
            <strong>{stability}%</strong>
          </div>
          <div className="rail-stability__track">
            <i style={{ width: `${stability}%` }} />
          </div>
        </div>
      </div>

      <div className="rail-section-title">
        <span>城区 / SECTORS</span>
        <small>06</small>
      </div>

      <div className="district-list">
        {districts.map((district, index) => {
          const active = selectedDistrict === district.id
          return (
            <button
              key={district.id}
              className={`district-row ${active ? 'is-active' : ''}`}
              onClick={() => onSelect(district.id)}
              onDoubleClick={() => onFocus(district.id)}
              style={{ '--district-color': district.color }}
            >
              <span className="district-row__index">0{index + 1}</span>
              <span className="district-row__body">
                <span className="district-row__name">
                  {district.name}
                  <small>{district.en}</small>
                </span>
                <span className="district-row__meta">
                  <span>控制 {district.control}%</span>
                  <span>动荡 {district.unrest}%</span>
                </span>
                <span className="district-row__bar">
                  <i style={{ width: `${district.control}%` }} />
                </span>
              </span>
              <span className={`district-row__threat threat-${Math.min(5, Math.ceil(district.threat / 20))}`}>
                {THREAT_LABELS[Math.min(5, Math.ceil(district.threat / 20))]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="rail-footer">
        <div className="rail-legend">
          <span><i className="legend-control" /> 控制度</span>
          <span><i className="legend-threat" /> 威胁等级</span>
        </div>
        <p>双击城区可聚焦地图。所有数值为协调人估算。</p>
        <div className="rail-signature">
          <span>AUTHORITY LINK</span>
          <strong>SECURE / 7A</strong>
        </div>
      </div>
    </aside>
  )
}
