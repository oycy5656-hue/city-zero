import { useEffect, useMemo, useState } from 'react'
import {
  ARCHIVE,
  FACTIONS,
  INCIDENTS,
  SQUADS,
  TACTICS,
} from '../data/city.js'

function formatCredits(value) {
  if (Math.abs(value) >= 1000000) return `₡ ${(value / 1000000).toFixed(2)}M`
  return `₡ ${Math.round(value / 1000)}K`
}

function Overlay({ title, en, children, onClose }) {
  return (
    <div className="command-overlay">
      <div className="command-overlay__backdrop" onClick={onClose} />
      <section className="command-panel">
        <header className="command-panel__head">
          <div>
            <p className="hud-label">{en}</p>
            <h2>{title}</h2>
          </div>
          <button className="command-panel__close" onClick={onClose} aria-label="关闭面板">✕</button>
        </header>
        <div className="command-panel__body">{children}</div>
      </section>
    </div>
  )
}

function Operations({
  districts,
  city,
  onUpdateDistrict,
  onEndDay,
  onClose,
}) {
  const totals = useMemo(() => {
    return districts.reduce(
      (sum, district) => {
        const revenue = Math.round((district.population / 10000) * district.economy * (district.tax / 100) * 50)
        const upkeep = Math.round((district.population / 10000) * 38 + (100 - district.infra) * 260)
        return {
          revenue: sum.revenue + revenue,
          upkeep: sum.upkeep + upkeep,
        }
      },
      { revenue: 0, upkeep: 0 },
    )
  }, [districts])

  return (
    <Overlay title="城市运营" en="OPERATIONS / BUDGET ALLOCATION" onClose={onClose}>
      <div className="ops-summary">
        <div>
          <span>预计税收</span>
          <strong className="tone-green">{formatCredits(totals.revenue)}</strong>
        </div>
        <div>
          <span>预计支出</span>
          <strong className="tone-red">{formatCredits(totals.upkeep)}</strong>
        </div>
        <div>
          <span>日净收益</span>
          <strong className={totals.revenue - totals.upkeep >= 0 ? 'tone-green' : 'tone-red'}>
            {formatCredits(totals.revenue - totals.upkeep)}
          </strong>
        </div>
        <div>
          <span>当前资金</span>
          <strong>{formatCredits(city.credits)}</strong>
        </div>
      </div>

      <div className="ops-table">
        <div className="ops-row ops-row--head">
          <span>城区</span>
          <span>税率</span>
          <span>治安预算</span>
          <span>基建预算</span>
          <span>预计净收益</span>
        </div>
        {districts.map((district) => {
          const revenue = Math.round((district.population / 10000) * district.economy * (district.tax / 100) * 50)
          const upkeep = Math.round((district.population / 10000) * 38 + (100 - district.infra) * 260)
          return (
            <div className="ops-row" key={district.id}>
              <span className="ops-district" style={{ '--district-color': district.color }}>
                <i />
                <span>
                  <strong>{district.name}</strong>
                  <small>{district.en}</small>
                </span>
              </span>
              <label className="ops-slider">
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={district.tax}
                  onChange={(event) => onUpdateDistrict(district.id, { tax: Number(event.target.value) })}
                />
                <em>{district.tax}%</em>
              </label>
              <label className="ops-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={district.security}
                  onChange={(event) => onUpdateDistrict(district.id, { security: Number(event.target.value) })}
                />
                <em>{district.security}</em>
              </label>
              <label className="ops-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={district.infra}
                  onChange={(event) => onUpdateDistrict(district.id, { infra: Number(event.target.value) })}
                />
                <em>{district.infra}</em>
              </label>
              <span className={revenue - upkeep >= 0 ? 'tone-green' : 'tone-red'}>
                {formatCredits(revenue - upkeep)}
              </span>
            </div>
          )
        })}
      </div>

      <footer className="command-footer">
        <p>提高税率会增加收入，也会增加动荡。治安与基建预算会立即影响下一天的城区状态。</p>
        <button className="action-button action-button--primary" onClick={onEndDay}>
          结束本日 / END DAY
        </button>
      </footer>
    </Overlay>
  )
}

function Threat({ incidents, districts, city, onResolve, combatResult, onClose }) {
  const [selectedIncident, setSelectedIncident] = useState(incidents[0]?.id || null)
  const [selectedSquad, setSelectedSquad] = useState(SQUADS[0].id)
  const [selectedTactic, setSelectedTactic] = useState(TACTICS[0].id)
  const incident = incidents.find((item) => item.id === selectedIncident)
  const district = incident ? districts.find((item) => item.id === incident.district) : null
  const squad = SQUADS.find((item) => item.id === selectedSquad) || SQUADS[0]
  const tactic = TACTICS.find((item) => item.id === selectedTactic) || TACTICS[0]

  useEffect(() => {
    if (!incidents.some((item) => item.id === selectedIncident)) {
      setSelectedIncident(incidents[0]?.id || null)
    }
  }, [incidents, selectedIncident])

  return (
    <Overlay title="战术行动" en="TACTICAL / INCIDENT RESPONSE" onClose={onClose}>
      <div className="threat-layout">
        <div className="threat-list">
          <div className="threat-list__head">
            <span>未处理事件</span>
            <small>{incidents.length}</small>
          </div>
          {incidents.map((item) => {
            const itemDistrict = districts.find((districtItem) => districtItem.id === item.district)
            return (
              <button
                key={item.id}
                className={`threat-card ${selectedIncident === item.id ? 'is-active' : ''}`}
                onClick={() => setSelectedIncident(item.id)}
              >
                <span className="threat-card__top">
                  <span style={{ color: itemDistrict?.color }}>{itemDistrict?.name}</span>
                  <em>THREAT {item.threat}</em>
                </span>
                <strong>{item.title}</strong>
                <small>{item.type} · {item.target}</small>
              </button>
            )
          })}
          {!incidents.length && (
            <div className="threat-empty">
              <p>本日威胁已清除。</p>
              <span>结束一天后会有新的情报进入终端。</span>
            </div>
          )}
        </div>

        <div className="threat-console">
          {incident ? (
            <>
              <div className="threat-console__head">
                <div>
                  <p className="hud-label">INCIDENT / {incident.id.toUpperCase()}</p>
                  <h3>{incident.title}</h3>
                  <p>{incident.desc}</p>
                </div>
                <div className="threat-meter">
                  <span>威胁等级</span>
                  <strong>{incident.threat} / 5</strong>
                  <div><i style={{ width: `${incident.threat * 20}%` }} /></div>
                </div>
              </div>

              <div className="threat-targets">
                <div>
                  <span>目标城区</span>
                  <strong style={{ color: district?.color }}>{district?.name}</strong>
                </div>
                <div>
                  <span>行动目标</span>
                  <strong>{incident.target}</strong>
                </div>
                <div>
                  <span>成功报酬</span>
                  <strong className="tone-green">{formatCredits(incident.reward)}</strong>
                </div>
              </div>

              <p className="hud-label">选择行动单位</p>
              <div className="squad-grid">
                {SQUADS.map((item) => (
                  <button
                    key={item.id}
                    className={`squad-card ${selectedSquad === item.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedSquad(item.id)}
                  >
                    <span>{item.type}</span>
                    <strong>{item.name}</strong>
                    <small>{item.desc}</small>
                    <em>POWER {item.power}</em>
                  </button>
                ))}
              </div>

              <p className="hud-label">选择战术</p>
              <div className="tactic-grid">
                {TACTICS.map((item) => (
                  <button
                    key={item.id}
                    className={`tactic-card ${selectedTactic === item.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedTactic(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>{item.desc}</small>
                    <em>{item.cost ? formatCredits(item.cost) : '免费'}</em>
                  </button>
                ))}
              </div>

              <div className="threat-actions">
                <div>
                  <span>预计控制变化 +{tactic.control}</span>
                  <span>威胁变化 {tactic.threat}</span>
                  <span>行动成本 {formatCredits(tactic.cost)}</span>
                </div>
                <button
                  className="action-button action-button--primary"
                  onClick={() =>
                    onResolve({
                      incidentId: incident.id,
                      squadId: selectedSquad,
                      tacticId: selectedTactic,
                    })
                  }
                  disabled={city.credits < tactic.cost}
                >
                  执行行动 / EXECUTE
                </button>
              </div>
            </>
          ) : (
            <div className="threat-empty threat-empty--large">
              <p>当前没有可处理的事件。</p>
              <span>结束一天，或者等待新的情报。</span>
            </div>
          )}

          {combatResult && (
            <div className={`combat-result ${combatResult.success ? 'is-success' : 'is-fail'}`}>
              <p className="hud-label">{combatResult.success ? 'OPERATION COMPLETE' : 'OPERATION FAILED'}</p>
              <h4>{combatResult.title}</h4>
              <p>{combatResult.text}</p>
              <div>
                <span>控制 {combatResult.control >= 0 ? '+' : ''}{combatResult.control}</span>
                <span>威胁 {combatResult.threat >= 0 ? '+' : ''}{combatResult.threat}</span>
                <span>资金 {formatCredits(combatResult.credits)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}

function Archive({ districts, onClose }) {
  const entries = useMemo(
    () => [
      ...ARCHIVE,
      ...districts.map((district) => ({
        id: `district-${district.id}`,
        category: '城区',
        title: district.name,
        subtitle: `${district.en} · ${district.type}`,
        body: [district.description, district.detail],
      })),
      ...FACTIONS.map((faction) => ({
        id: `faction-${faction.id}`,
        category: '势力',
        title: faction.name,
        subtitle: faction.en,
        body: [faction.desc, faction.detail],
      })),
    ],
    [districts],
  )
  const [activeId, setActiveId] = useState(entries[0]?.id)
  const active = entries.find((entry) => entry.id === activeId) || entries[0]

  return (
    <Overlay title="新纽约档案" en="ARCHIVE / NEW NEW YORK" onClose={onClose}>
      <div className="archive-layout">
        <div className="archive-list">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={`archive-entry ${activeId === entry.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(entry.id)}
            >
              <span>{entry.category}</span>
              <strong>{entry.title}</strong>
              <small>{entry.subtitle}</small>
            </button>
          ))}
        </div>
        <article className="archive-reader">
          <p className="hud-label">{active.category} / DATASTORE</p>
          <h3>{active.title}</h3>
          <p className="archive-reader__sub">{active.subtitle}</p>
          <div className="archive-reader__line" />
          {active.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <div className="archive-reader__foot">
            <span>ZERO CITY ARCHIVE</span>
            <span>ACCESS LEVEL 03</span>
          </div>
        </article>
      </div>
    </Overlay>
  )
}

export default function CommandPanels(props) {
  if (props.panel === 'ops') {
    return (
      <Operations
        districts={props.districts}
        city={props.city}
        onUpdateDistrict={props.onUpdateDistrict}
        onEndDay={props.onEndDay}
        onClose={props.onClose}
      />
    )
  }
  if (props.panel === 'threat') {
    return (
      <Threat
        incidents={props.incidents}
        districts={props.districts}
        city={props.city}
        onResolve={props.onResolve}
        combatResult={props.combatResult}
        onClose={props.onClose}
      />
    )
  }
  if (props.panel === 'archive') {
    return <Archive districts={props.districts} onClose={props.onClose} />
  }
  return null
}
