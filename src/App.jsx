import { useEffect, useMemo, useRef, useState } from 'react'
import TopBar from './components/TopBar.jsx'
import DistrictRail from './components/DistrictRail.jsx'
import DistrictInspector from './components/DistrictInspector.jsx'
import CommandPanels from './components/CommandPanels.jsx'
import MapCanvas from './map/MapCanvas.jsx'
import { getCityData } from './map/generator.js'
import { CITY, DISTRICTS, INCIDENTS, SQUADS, TACTICS, WORLD } from './data/city.js'

const initialDistricts = DISTRICTS.map((district, index) => ({
  ...district,
  infra: [78, 54, 48, 36, 42][index] ?? 50,
}))

const initialLog = [
  { id: 1, time: '23:47', district: 'manhattan', text: '赫利俄斯塔进入夜间警戒。', tone: 'info' },
  { id: 2, time: '23:31', district: 'brooklyn', text: '自由区码头报告不明货柜。', tone: 'warn' },
  { id: 3, time: '22:58', district: 'bronx', text: '铁工联炼化厂压力下降 14%。', tone: 'danger' },
  { id: 4, time: '22:12', district: 'queens', text: '自由港雷达再次离线。', tone: 'info' },
]

function formatTime(city) {
  return `${String(city.hour).padStart(2, '0')}:${String(city.minute).padStart(2, '0')}`
}

export default function App() {
  const data = useMemo(() => getCityData(), [])
  const mapRef = useRef(null)
  const [booting, setBooting] = useState(true)
  const [panel, setPanel] = useState('map')
  const [city, setCity] = useState(CITY)
  const [districts, setDistricts] = useState(initialDistricts)
  const [selectedDistrict, setSelectedDistrict] = useState('manhattan')
  const [selectedPoi, setSelectedPoi] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const [speed, setSpeed] = useState(1)
  const [layers, setLayers] = useState({
    districts: true,
    pois: true,
    traffic: true,
    grid: true,
  })
  const [incidents, setIncidents] = useState(INCIDENTS)
  const [combatResult, setCombatResult] = useState(null)
  const [log, setLog] = useState(initialLog)
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')

  const selected = districts.find((district) => district.id === selectedDistrict) || districts[0]
  const population = districts.reduce((sum, district) => sum + district.population, 0)
  const stability = Math.round(
    districts.reduce((sum, district) => sum + (100 - district.unrest * 0.62) * district.population, 0) / population,
  )

  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []
    const districtResults = districts
      .filter((district) => `${district.name} ${district.realName || ''} ${district.en} ${district.type}`.toLowerCase().includes(query))
      .map((district) => ({
        type: 'district',
        id: district.id,
        name: district.name,
        en: district.en,
      }))
    const poiResults = data.pois
      .filter((poi) => `${poi.name} ${poi.alias || ''} ${poi.realName || ''} ${poi.en}`.toLowerCase().includes(query))
      .map((poi) => ({
        type: 'poi',
        id: poi.id,
        name: poi.name,
        en: poi.en,
        districtId: poi.district,
        poi,
      }))
    return [...districtResults, ...poiResults].slice(0, 7)
  }, [search, districts, data])

  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 1250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!speed) return
    const timer = setInterval(() => {
      setCity((current) => {
        const total = current.hour * 60 + current.minute + 5 * speed
        const days = Math.floor(total / 1440)
        const minute = total % 1440
        return {
          ...current,
          day: current.day + days,
          hour: Math.floor(minute / 60),
          minute: minute % 60,
        }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [speed])

  const pushLog = (text, districtId = null, tone = 'info') => {
    setLog((current) => [
      {
        id: Date.now() + Math.random(),
        time: formatTime(city),
        district: districtId,
        text,
        tone,
      },
      ...current,
    ].slice(0, 30))
  }

  const patchDistrict = (id, patch) => {
    setDistricts((current) =>
      current.map((district) => (district.id === id ? { ...district, ...patch } : district)),
    )
  }

  const selectDistrict = (id) => {
    setSelectedDistrict(id)
    setSelectedPoi(null)
    setPanel('map')
  }

  const focusDistrict = (id) => {
    if (!id) return
    setSelectedDistrict(id)
    setSelectedPoi(null)
    setFocusRequest({ districtId: id, ts: Date.now() })
  }

  const handleSelectPoi = (poi) => {
    if (!poi) {
      setSelectedPoi(null)
      return
    }
    setSelectedPoi(poi)
    setSelectedDistrict(poi.district)
  }

  const handleSelectResult = (result) => {
    setSearch('')
    if (result.type === 'district') {
      focusDistrict(result.id)
    } else {
      setSelectedPoi(result.poi)
      setSelectedDistrict(result.districtId)
      setFocusRequest({
        x: result.poi.x,
        y: result.poi.y,
        scale: 0.42,
        ts: Date.now(),
      })
    }
  }

  const handleDistrictAction = (action, districtId) => {
    const district = districts.find((item) => item.id === districtId)
    if (!district) return
    if (action === 'invest') {
      if (city.credits < 250000) {
        setToast('资金不足。')
        return
      }
      setCity((current) => ({ ...current, credits: current.credits - 250000 }))
      patchDistrict(districtId, {
        economy: Math.min(100, district.economy + 3),
        control: Math.min(100, district.control + 2),
        unrest: Math.max(0, district.unrest - 1),
        infra: Math.min(100, district.infra + 2),
      })
      pushLog(`向${district.name}注入 25 万基建资金。`, districtId, 'success')
      setToast(`${district.name} 基建投资已到账。`)
      return
    }
    if (action === 'patrol') {
      if (city.credits < 90000) {
        setToast('资金不足。')
        return
      }
      setCity((current) => ({ ...current, credits: current.credits - 90000 }))
      patchDistrict(districtId, {
        security: Math.min(100, district.security + 5),
        threat: Math.max(0, district.threat - 2),
        unrest: Math.max(0, district.unrest - 3),
      })
      pushLog(`向${district.name}增派巡逻单位。`, districtId, 'success')
      setToast(`${district.name} 巡逻已部署。`)
      return
    }
    if (action === 'negotiate') {
      if (city.credits < 60000) {
        setToast('资金不足。')
        return
      }
      setCity((current) => ({ ...current, credits: current.credits - 60000 }))
      patchDistrict(districtId, {
        threat: Math.max(0, district.threat - 4),
        unrest: Math.max(0, district.unrest - 2),
        control: Math.min(100, district.control + 1),
      })
      pushLog(`在${district.name}启动一次闭门谈判。`, districtId, 'info')
      setToast(`${district.name} 的紧张局势暂时缓和。`)
    }
  }

  const updateDistrict = (id, patch) => {
    patchDistrict(id, patch)
  }

  const advanceDay = () => {
    let net = 0
    const nextDistricts = districts.map((district) => {
      const revenue = Math.round((district.population / 10000) * district.economy * (district.tax / 100) * 50)
      const upkeep = Math.round((district.population / 10000) * 38 + (100 - district.infra) * 260)
      net += revenue - upkeep
      const securityDrift = district.security < 38 ? 1 : district.security > 68 ? -1 : 0
      const infraDrift = district.infra > 60 ? 1 : district.infra < 30 ? -2 : -1
      return {
        ...district,
        security: Math.max(0, Math.min(100, district.security + securityDrift)),
        infra: Math.max(0, Math.min(100, district.infra + infraDrift)),
        unrest: Math.max(
          0,
          Math.min(100, district.unrest + (district.security < 40 ? 2 : -1) + (district.tax > 20 ? 1 : 0)),
        ),
        control: Math.max(
          0,
          Math.min(100, district.control + (district.security > 60 ? 1 : 0) - (district.unrest > 55 ? 1 : 0)),
        ),
        threat: Math.max(0, Math.min(100, district.threat + Math.round((Math.random() - 0.5) * 7))),
      }
    })
    setDistricts(nextDistricts)
    setCity((current) => ({
      ...current,
      credits: Math.max(0, current.credits + net),
      day: current.day + 1,
      hour: 6,
      minute: 0,
    }))
    pushLog(`市政结算完成。日净收益 ${net >= 0 ? '+' : ''}${Math.round(net / 1000)}K。`, null, net >= 0 ? 'success' : 'danger')
    setToast(`第 ${city.day} 日结算完成。`)
    if (incidents.length === 0) {
      setIncidents(INCIDENTS.slice(0, 3))
    }
  }

  const resolveIncident = ({ incidentId, squadId, tacticId }) => {
    const incident = incidents.find((item) => item.id === incidentId)
    const squad = SQUADS.find((item) => item.id === squadId)
    const tactic = TACTICS.find((item) => item.id === tacticId)
    if (!incident || !squad || !tactic) return
    if (city.credits < tactic.cost) {
      setToast('资金不足，无法执行这次行动。')
      return
    }
    setCombatResult(null)
    const roll = Math.random() * 12
    const success = squad.power + tactic.power + roll - incident.threat * 5 >= 8
    const district = districts.find((item) => item.id === incident.district)
    if (success) {
      setIncidents((current) => current.filter((item) => item.id !== incident.id))
      setCity((current) => ({
        ...current,
        credits: current.credits + incident.reward - tactic.cost,
      }))
      patchDistrict(incident.district, {
        control: Math.min(100, district.control + tactic.control),
        threat: Math.max(0, district.threat + tactic.threat),
        unrest: Math.max(0, district.unrest - 2),
      })
      setCombatResult({
        success: true,
        title: '行动成功',
        text: `${squad.name}完成“${incident.title}”。目标区域恢复控制，${district.name}的街头暂时安静下来。`,
        control: tactic.control,
        threat: tactic.threat,
        credits: incident.reward - tactic.cost,
      })
      pushLog(`“${incident.title}”已解决。`, incident.district, 'success')
      setToast('行动成功，报酬已入账。')
    } else {
      setCity((current) => ({ ...current, credits: Math.max(0, current.credits - tactic.cost) }))
      patchDistrict(incident.district, {
        control: Math.max(0, district.control - 4),
        threat: Math.min(100, district.threat + 3),
      })
      setCombatResult({
        success: false,
        title: '行动失败',
        text: `${squad.name}在${district.name}遭遇顽强抵抗，被迫撤离。目标仍在活动，城区控制度下降。`,
        control: -4,
        threat: 3,
        credits: -tactic.cost,
      })
      pushLog(`“${incident.title}”行动失败。`, incident.district, 'danger')
      setToast('行动失败。')
    }
  }

  const toggleLayer = (key) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className="game">
      <TopBar
        city={city}
        population={population}
        stability={stability}
        speed={speed}
        setSpeed={setSpeed}
        panel={panel}
        setPanel={setPanel}
        search={search}
        setSearch={setSearch}
        results={results}
        onSelectResult={handleSelectResult}
        layers={layers}
        toggleLayer={toggleLayer}
      />

      <main className="game-body">
        <MapCanvas
          ref={mapRef}
          data={data}
          selectedDistrict={selectedDistrict}
          onSelectDistrict={selectDistrict}
          selectedPoi={selectedPoi}
          onSelectPoi={handleSelectPoi}
          layers={layers}
          focusRequest={focusRequest}
        />

        <DistrictRail
          districts={districts}
          selectedDistrict={selectedDistrict}
          onSelect={selectDistrict}
          onFocus={focusDistrict}
          stability={stability}
        />

        <DistrictInspector
          district={selected}
          poi={selectedPoi}
          city={city}
          log={log}
          onAction={handleDistrictAction}
          onFocus={focusDistrict}
          onFocusPoi={(poi) =>
            setFocusRequest({ x: poi.x, y: poi.y, scale: 0.46, ts: Date.now() })
          }
          onClosePoi={() => setSelectedPoi(null)}
        />

        <div className="mobile-districts" aria-label="城区快速选择">
          {districts.map((district) => (
            <button
              key={district.id}
              className={selectedDistrict === district.id ? 'is-active' : ''}
              style={{ '--district-color': district.color }}
              onClick={() => selectDistrict(district.id)}
            >
              <i />
              <span>{district.name}</span>
              <em>{district.control}%</em>
            </button>
          ))}
        </div>

        {panel !== 'map' && (
          <CommandPanels
            panel={panel}
            districts={districts}
            city={city}
            incidents={incidents}
            onUpdateDistrict={updateDistrict}
            onEndDay={advanceDay}
            onResolve={resolveIncident}
            combatResult={combatResult}
            onClose={() => setPanel('map')}
          />
        )}
      </main>

      {toast && <div className="game-toast">{toast}</div>}

      {booting && (
        <div className="boot-screen">
          <div className="boot-screen__grid" aria-hidden="true" />
          <div className="boot-screen__inner">
            <span className="boot-screen__mark">NY</span>
            <p className="hud-label">NEW NEW YORK / 2077</p>
            <h1>新纽约</h1>
            <p>正在载入五区边界与社区数据 · {data.stats.buildings.toLocaleString('zh-CN')} 栋建筑按视口加载</p>
            <div className="boot-screen__bar"><i /></div>
            <div className="boot-screen__meta">
              <span>GRID {Math.round(WORLD.width / 100) / 10} × {Math.round(WORLD.height / 100) / 10} KM</span>
              <span>SECTOR LINK 05</span>
              <span>AUTHORITY 7A</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
