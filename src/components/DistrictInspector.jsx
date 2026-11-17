import { FACTION_BY_ID } from '../data/city.js'

const POI_TYPE_LABELS = {
  tower: '企业地标',
  finance: '金融设施',
  gov: '市政设施',
  media: '传媒设施',
  market: '黑市',
  industry: '工业设施',
  port: '港口设施',
  gang: '帮派据点',
  airport: '空港',
  solar: '能源设施',
  park: '开放空间',
  medical: '医疗设施',
  arena: '娱乐设施',
  transit: '交通设施',
  residential: '居住设施',
}

const ACTIONS = [
  {
    id: 'invest',
    label: '投资基建',
    en: 'INVEST',
    cost: 250000,
    desc: '经济 +3 · 控制 +2 · 动荡 -1',
  },
  {
    id: 'patrol',
    label: '部署巡逻',
    en: 'PATROL',
    cost: 90000,
    desc: '治安 +5 · 威胁 -2 · 动荡 -3',
  },
  {
    id: 'negotiate',
    label: '谈判',
    en: 'NEGOTIATE',
    cost: 60000,
    desc: '威胁 -4 · 动荡 -2 · 控制 +1',
  },
]

function formatCredits(value) {
  return `₡ ${Math.round(value / 1000)}K`
}

function Metric({ label, value, tone = 'cyan', suffix = '' }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={`tone-${tone}`}>
        {value}
        {suffix}
      </strong>
    </div>
  )
}

export default function DistrictInspector({
  district,
  poi,
  city,
  log,
  onAction,
  onFocus,
  onFocusPoi,
  onClosePoi,
}) {
  if (poi) {
    const faction = FACTION_BY_ID[district?.faction]
    return (
      <aside className="inspector">
        <div className="inspector__top">
          <p className="hud-label">POINT OF INTEREST / {poi.type.toUpperCase()}</p>
          <button className="inspector__close" onClick={onClosePoi} aria-label="关闭地点详情">✕</button>
        </div>
        <div className="poi-detail">
          <span className="poi-detail__type">{POI_TYPE_LABELS[poi.type] || poi.type}</span>
          <h2>{poi.name}</h2>
          <p className="poi-detail__en">{poi.en}</p>
          <div className="poi-detail__status">
            <span>状态</span>
            <strong>{poi.status}</strong>
          </div>
          <p className="poi-detail__desc">{poi.desc}</p>
          <dl className="poi-detail__facts">
            <div>
              <dt>所属城区</dt>
              <dd>{district?.name} / {district?.en}</dd>
            </div>
            <div>
              <dt>实际控制</dt>
              <dd>{faction?.name}</dd>
            </div>
            <div>
              <dt>坐标</dt>
              <dd>{(poi.x / 1000).toFixed(2)} / {(poi.y / 1000).toFixed(2)}</dd>
            </div>
            <div>
              <dt>建筑高度</dt>
              <dd>{poi.height} m</dd>
            </div>
          </dl>
          <button className="action-button action-button--primary" onClick={() => onFocusPoi(poi)}>
            聚焦地点
          </button>
        </div>
      </aside>
    )
  }

  if (!district) return null
  const faction = FACTION_BY_ID[district.faction]
  const recentLog = log.filter((entry) => entry.district === district.id).slice(0, 4)

  return (
    <aside className="inspector" style={{ '--district-color': district.color }}>
      <div className="inspector__top">
        <p className="hud-label">SECTOR DOSSIER / {district.en}</p>
        <button className="inspector__close" onClick={() => onFocus(district.id)} aria-label="聚焦城区">⌖</button>
      </div>

      <div className="inspector__title">
        <div className="inspector__line" />
        <h2>{district.name}</h2>
        <p>{district.en} · {district.type}</p>
      </div>

      <p className="inspector__desc">{district.description}</p>

      <div className="inspector__stats">
        <Metric label="人口" value={(district.population / 10000).toFixed(1)} suffix=" 万" />
        <Metric label="经济" value={district.economy} tone="cyan" />
        <Metric label="治安" value={district.security} tone={district.security < 40 ? 'red' : 'green'} />
        <Metric label="动荡" value={district.unrest} tone={district.unrest > 45 ? 'red' : 'amber'} />
        <Metric label="控制" value={district.control} suffix="%" tone={district.control < 35 ? 'red' : 'cyan'} />
        <Metric label="威胁" value={district.threat} tone={district.threat > 55 ? 'red' : 'amber'} />
      </div>

      <div className="control-bar">
        <div>
          <span>城区控制度</span>
          <strong>{district.control}%</strong>
        </div>
        <div className="control-bar__track">
          <i style={{ width: `${district.control}%` }} />
        </div>
      </div>

      <div className="inspector__faction">
        <span className="inspector__faction-mark" style={{ borderColor: faction?.color }} />
        <div>
          <span>主权归属</span>
          <strong style={{ color: faction?.color }}>{faction?.name}</strong>
        </div>
        <small>{faction?.motto}</small>
      </div>

      {district.factions?.length > 0 && (
        <div className="inspector__influence">
          <p className="hud-label">FACTION INFLUENCE / 势力渗透</p>
          {[...district.factions]
            .sort((a, b) => b.share - a.share)
            .slice(0, 5)
            .map((item) => {
              const group = FACTION_BY_ID[item.id]
              return (
                <div className="influence-row" key={item.id}>
                  <span className="influence-row__name" style={{ color: group?.color }}>
                    {group?.name || item.id}
                  </span>
                  <span className="influence-row__track">
                    <i style={{ width: `${item.share}%`, background: group?.color }} />
                  </span>
                  <strong>{item.share}%</strong>
                </div>
              )
            })}
        </div>
      )}

      <div className="inspector__actions">
        <p className="hud-label">DIRECT ACTION</p>
        {ACTIONS.map((action) => {
          const disabled = city.credits < action.cost
          return (
            <button
              key={action.id}
              className="action-button"
              onClick={() => onAction(action.id, district.id)}
              disabled={disabled}
            >
              <span>
                <strong>{action.label}</strong>
                <small>{action.desc}</small>
              </span>
              <em>{formatCredits(action.cost)}</em>
            </button>
          )
        })}
      </div>

      <div className="inspector__log">
        <div className="inspector__log-head">
          <span>城区动态</span>
          <small>LIVE FEED</small>
        </div>
        {recentLog.length ? (
          recentLog.map((entry) => (
            <p key={entry.id}>
              <span>{entry.time}</span>
              {entry.text}
            </p>
          ))
        ) : (
          <p className="is-muted">暂无本区动态。</p>
        )}
      </div>

      <button className="inspector__focus" onClick={() => onFocus(district.id)}>
        <span>聚焦此城区</span>
        <span>⌖</span>
      </button>
    </aside>
  )
}
