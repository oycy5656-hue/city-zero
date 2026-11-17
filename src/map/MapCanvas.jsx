import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { DISTRICT_BY_ID, WORLD } from '../data/city.js'
import { buildBuildingIndex, expandRoads, hitTestBuildings } from './generator.js'
import {
  ROAD_TILE_SIZE,
  TILE_SIZE,
  fetchRoadTile,
  fetchTile,
  roadTileKey,
  tileKey,
} from './stream.js'
import {
  MAX_SCALE,
  MIN_SCALE,
  cameraBounds,
  clampCamera,
  drawMap,
  drawMinimap,
  fitCamera,
  minimapToWorld,
  screenToWorld,
  zoomCameraAt,
} from './renderer.js'

function formatCoord(value) {
  return `${value >= 0 ? '+' : ''}${(value / 1000).toFixed(2)}`
}

function formatZoom(scale) {
  const denominator = Math.round(1 / (scale * 0.00028))
  return `1:${denominator.toLocaleString('zh-CN')}`
}

const MapCanvas = forwardRef(function MapCanvas(
  {
    data,
    selectedDistrict,
    onSelectDistrict,
    selectedPoi,
    onSelectPoi,
    layers,
    focusRequest,
  },
  ref,
) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const miniRef = useRef(null)
  const cameraRef = useRef(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const pointersRef = useRef(new Map())
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const animRef = useRef(null)
  const hoverRef = useRef(null)
  const hoveredIdRef = useRef(null)
  const lastHudRef = useRef(0)
  const lastPaintRef = useRef(0)
  const interactingRef = useRef(false)
  const interactionTimerRef = useRef(0)
  const lastMoveRef = useRef(0)
  const cacheCanvasRef = useRef(null)
  const cacheCameraRef = useRef(null)
  const cacheReadyRef = useRef(false)

  const captureFrame = useCallback(() => {
    const canvas = canvasRef.current
    const camera = cameraRef.current
    if (!canvas || !camera) return
    if (!cacheCanvasRef.current) cacheCanvasRef.current = document.createElement('canvas')
    const cache = cacheCanvasRef.current
    cache.width = canvas.width
    cache.height = canvas.height
    const cacheCtx = cache.getContext('2d')
    cacheCtx.setTransform(1, 0, 0, 1, 0, 0)
    cacheCtx.drawImage(canvas, 0, 0)
    cacheCameraRef.current = { ...camera }
    cacheReadyRef.current = true
  }, [])

  const markInteracting = useCallback(() => {
    interactingRef.current = true
    lastMoveRef.current = performance.now()
    window.clearTimeout(interactionTimerRef.current)
    interactionTimerRef.current = window.setTimeout(() => {
      interactingRef.current = false
    }, 220)
  }, [])
  const streamRef = useRef({
    tiles: new Map(),
    loading: new Set(),
    roadTiles: new Map(),
    roadLoading: new Set(),
    buildings: [],
    roads: [],
  })
  const streamAbortRef = useRef(null)
  const renderDataRef = useRef(data)
  const [hud, setHud] = useState({ x: 0, y: 0, zoom: '1:24,000' })
  const [hoverInfo, setHoverInfo] = useState(null)
  const [scaleLabel, setScaleLabel] = useState(1)

  const setCamera = useCallback((camera) => {
    const { width, height } = sizeRef.current
    cameraRef.current = clampCamera(camera, width, height)
  }, [])

  const focusPoint = useCallback((x, y, scale = 0.38, animate = true) => {
    if (!cameraRef.current) return
    const { width, height } = sizeRef.current
    const target = clampCamera(
      { x, y, scale },
      width,
      height,
    )
    if (!animate) {
      cameraRef.current = target
      return
    }
    animRef.current = {
      from: { ...cameraRef.current },
      to: target,
      start: performance.now(),
      duration: 620,
    }
  }, [])

  const focusDistrict = useCallback(
    (districtId, animate = true) => {
      const district = DISTRICT_BY_ID[districtId]
      if (!district || !cameraRef.current) return
      const { width, height } = sizeRef.current
      const targetScale = Math.max(cameraRef.current.scale, 0.34)
      const target = clampCamera(
        { x: district.centroid[0], y: district.centroid[1], scale: targetScale },
        width,
        height,
      )
      if (!animate) {
        cameraRef.current = target
        return
      }
      animRef.current = {
        from: { ...cameraRef.current },
        to: target,
        start: performance.now(),
        duration: 620,
      }
    },
    [],
  )

  const resetView = useCallback(() => {
    const { width, height } = sizeRef.current
    const target = fitCamera(width, height)
    animRef.current = {
      from: { ...cameraRef.current },
      to: target,
      start: performance.now(),
      duration: 620,
    }
  }, [])

  const zoomBy = useCallback((factor) => {
    if (!cameraRef.current) return
    const { width, height } = sizeRef.current
    const camera = cameraRef.current
    animRef.current = null
    cameraRef.current = clampCamera(
      { ...camera, scale: camera.scale * factor },
      width,
      height,
    )
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      focusDistrict,
      focusPoint,
      resetView,
      zoomBy,
      getCamera: () => cameraRef.current,
    }),
    [focusDistrict, focusPoint, resetView, zoomBy],
  )


  // Resize and initialize the camera.
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const mini = miniRef.current
    if (!wrap || !canvas || !mini) return
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      sizeRef.current = { width, height, dpr }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      mini.width = Math.round(230 * dpr)
      mini.height = Math.round(160 * dpr)
      mini.style.width = '230px'
      mini.style.height = '160px'
      if (!cameraRef.current) {
        cameraRef.current = fitCamera(width, height)
      } else {
        cameraRef.current = clampCamera(cameraRef.current, width, height)
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Focus requests coming from the district list or search.
  useEffect(() => {
    if (!focusRequest) return
    if (typeof focusRequest.x === 'number' && typeof focusRequest.y === 'number') {
      focusPoint(focusRequest.x, focusRequest.y, focusRequest.scale || 0.4)
      return
    }
    if (focusRequest.districtId) {
      focusDistrict(focusRequest.districtId)
    }
  }, [focusRequest, focusDistrict, focusPoint])

  useEffect(() => {
    streamAbortRef.current?.abort()
    streamRef.current = {
      tiles: new Map(),
      loading: new Set(),
      roadTiles: new Map(),
      roadLoading: new Set(),
      buildings: [],
      roads: [],
    }
    renderDataRef.current = {
      ...data,
      buildings: [],
      buildingIndex: new Map(),
    }
    return () => streamAbortRef.current?.abort()
  }, [data])

  // Viewport-streamed NYC building footprints and local streets.
  useEffect(() => {
    let stopped = false
    const controller = new AbortController()
    streamAbortRef.current = controller
    let rebuildTimer = 0

    const rebuild = () => {
      const buildings = []
      const roads = []
      for (const tile of streamRef.current.tiles.values()) {
        buildings.push(...tile.buildings)
      }
      for (const tileRoads of streamRef.current.roadTiles.values()) {
        roads.push(...tileRoads)
      }
      const extraRoads = expandRoads(roads)
      renderDataRef.current = {
        ...data,
        buildings,
        roads: [...data.roads, ...extraRoads],
        buildingIndex: buildBuildingIndex(buildings),
      }
    }

    const scheduleRebuild = () => {
      window.clearTimeout(rebuildTimer)
      rebuildTimer = window.setTimeout(rebuild, 90)
    }

    const loadVisible = async () => {
      const camera = cameraRef.current
      const { width, height } = sizeRef.current
      if (!camera || width < 1 || interactingRef.current || performance.now() - lastMoveRef.current < 700) return
      const bounds = cameraBounds(camera, width, height)
      if (camera.scale >= 0.3) {
        const minTx = Math.floor((bounds.minX - 200 - WORLD.minX) / TILE_SIZE)
        const maxTx = Math.floor((bounds.maxX + 200 - WORLD.minX) / TILE_SIZE)
        const minTy = Math.floor((bounds.minY - 200 - WORLD.minY) / TILE_SIZE)
        const maxTy = Math.floor((bounds.maxY + 200 - WORLD.minY) / TILE_SIZE)
        const candidates = []
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          for (let ty = minTy; ty <= maxTy; ty += 1) {
            const key = tileKey(tx, ty)
            if (streamRef.current.tiles.has(key) || streamRef.current.loading.has(key)) continue
            const cx = WORLD.minX + (tx + 0.5) * TILE_SIZE
            const cy = WORLD.minY + (ty + 0.5) * TILE_SIZE
            candidates.push({ tx, ty, key, distance: Math.hypot(cx - camera.x, cy - camera.y) })
          }
        }
        candidates.sort((a, b) => a.distance - b.distance)
        for (const candidate of candidates.slice(0, 4)) {
          streamRef.current.loading.add(candidate.key)
          fetchTile(candidate.tx, candidate.ty, controller.signal)
            .then((tile) => {
              if (stopped) return
              streamRef.current.tiles.set(candidate.key, tile)
              if (streamRef.current.tiles.size > 140) {
                const first = streamRef.current.tiles.keys().next().value
                streamRef.current.tiles.delete(first)
              }
              scheduleRebuild()
            })
            .catch(() => {})
            .finally(() => streamRef.current.loading.delete(candidate.key))
        }
      }

      if (camera.scale >= 0.12) {
        const minTx = Math.floor((bounds.minX - 300 - WORLD.minX) / ROAD_TILE_SIZE)
        const maxTx = Math.floor((bounds.maxX + 300 - WORLD.minX) / ROAD_TILE_SIZE)
        const minTy = Math.floor((bounds.minY - 300 - WORLD.minY) / ROAD_TILE_SIZE)
        const maxTy = Math.floor((bounds.maxY + 300 - WORLD.minY) / ROAD_TILE_SIZE)
        const candidates = []
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          for (let ty = minTy; ty <= maxTy; ty += 1) {
            const key = roadTileKey(tx, ty)
            if (streamRef.current.roadTiles.has(key) || streamRef.current.roadLoading.has(key)) continue
            const cx = WORLD.minX + (tx + 0.5) * ROAD_TILE_SIZE
            const cy = WORLD.minY + (ty + 0.5) * ROAD_TILE_SIZE
            candidates.push({ tx, ty, key, distance: Math.hypot(cx - camera.x, cy - camera.y) })
          }
        }
        candidates.sort((a, b) => a.distance - b.distance)
        for (const candidate of candidates.slice(0, 6)) {
          streamRef.current.roadLoading.add(candidate.key)
          fetchRoadTile(candidate.tx, candidate.ty, controller.signal)
            .then((roads) => {
              if (stopped) return
              streamRef.current.roadTiles.set(candidate.key, roads)
              if (streamRef.current.roadTiles.size > 140) {
                const first = streamRef.current.roadTiles.keys().next().value
                streamRef.current.roadTiles.delete(first)
              }
              scheduleRebuild()
            })
            .catch(() => {})
            .finally(() => streamRef.current.roadLoading.delete(candidate.key))
        }
      }
    }

    const timer = window.setInterval(loadVisible, 500)
    loadVisible()
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearTimeout(rebuildTimer)
      controller.abort()
    }
  }, [data])

  // Main render loop.
  useEffect(() => {
    let raf = 0
    let disposed = false
    const canvas = canvasRef.current
    const mini = miniRef.current
    if (!canvas || !mini) return
    const ctx = canvas.getContext('2d')
    const miniCtx = mini.getContext('2d')

    const frame = (time) => {
      if (disposed) return
      const camera = cameraRef.current
      const { width, height, dpr } = sizeRef.current
      if (camera && width > 0) {
        if (animRef.current) {
          const anim = animRef.current
          const progress = Math.min(1, (time - anim.start) / anim.duration)
          const eased = 1 - Math.pow(1 - progress, 3)
          cameraRef.current = {
            x: anim.from.x + (anim.to.x - anim.from.x) * eased,
            y: anim.from.y + (anim.to.y - anim.from.y) * eased,
            scale: anim.from.scale + (anim.to.scale - anim.from.scale) * eased,
          }
          if (progress >= 1) {
            cameraRef.current = clampCamera(cameraRef.current, width, height)
            animRef.current = null
          }
        }

        if (
          interactingRef.current &&
          cacheReadyRef.current &&
          cacheCameraRef.current &&
          cacheCanvasRef.current
        ) {
          const cache = cacheCanvasRef.current
          const base = cacheCameraRef.current
          const ratio = cameraRef.current.scale / base.scale
          const dx =
            width / 2 +
            (base.x - cameraRef.current.x) * cameraRef.current.scale -
            (width / 2) * ratio
          const dy =
            height / 2 +
            (base.y - cameraRef.current.y) * cameraRef.current.scale -
            (height / 2) * ratio
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.fillStyle = '#05080b'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(cache, 0, 0, cache.width, cache.height, dx, dy, width * ratio, height * ratio)
          raf = requestAnimationFrame(frame)
          return
        }

        if (time - lastPaintRef.current < 32) {
          raf = requestAnimationFrame(frame)
          return
        }
        lastPaintRef.current = time

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawMap(ctx, renderDataRef.current, cameraRef.current, width, height, {
          selectedDistrict,
          selectedPoi,
          hoveredBuilding: hoveredIdRef.current,
          layers,
          time: time / 1000,
          grid: layers.grid,
          districts: layers.districts,
          pois: layers.pois,
          traffic: layers.traffic,
          fast: interactingRef.current,
          scaleRight: width < 900 ? 20 : 366,
        })

        miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawMinimap(miniCtx, renderDataRef.current, cameraRef.current, 230, 160, width, height)

        if (time - lastHudRef.current > 250) {
          lastHudRef.current = time
          setHud({
            x: cameraRef.current.x,
            y: cameraRef.current.y,
            zoom: formatZoom(cameraRef.current.scale),
          })
          setScaleLabel(cameraRef.current.scale)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
    }
  }, [data, selectedDistrict, selectedPoi, layers])

  const hitTest = (screenX, screenY) => {
    if (!cameraRef.current) return
    const { width, height } = sizeRef.current
    const world = screenToWorld(cameraRef.current, width, height, screenX, screenY)

    // POIs win over everything else.
    let closest = null
    let closestDistance = 18
    for (const poi of data.pois) {
      const sx = (poi.x - cameraRef.current.x) * cameraRef.current.scale + width / 2
      const sy = (poi.y - cameraRef.current.y) * cameraRef.current.scale + height / 2
      const distance = Math.hypot(screenX - sx, screenY - sy)
      if (distance < closestDistance) {
        closest = poi
        closestDistance = distance
      }
    }
    if (closest) {
      onSelectPoi(closest)
      return
    }

    if (cameraRef.current.scale > 0.36) {
      const building = hitTestBuildings(renderDataRef.current, world.x, world.y)
      if (building) {
        onSelectPoi(null)
        setHoverInfo({
          x: screenX,
          y: screenY,
          title: building.name ? building.name : `BIN ${building.bin || String(building.id).slice(-7)}`,
          lines: [
            `${DISTRICT_BY_ID[building.district]?.name || '纽约'} · ${building.type}`,
            `高度 ${building.height.toFixed(1)} m · ${building.floors} 层`,
            `建造年份 ${building.year || '未知'} · ${building.bbl || ''}`,
          ],
        })
        return
      }
    }

    const district = [...data.districts].reverse().find((item) => {
      let inside = false
      const poly = item.poly
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0]
        const yi = poly[i][1]
        const xj = poly[j][0]
        const yj = poly[j][1]
        const intersect = yi > world.y !== yj > world.y && world.x < ((xj - xi) * (world.y - yi)) / (yj - yi) + xi
        if (intersect) inside = !inside
      }
      return inside
    })
    if (district) {
      onSelectDistrict(district.id)
      setHoverInfo(null)
    }
  }

  const onPointerDown = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!interactingRef.current) captureFrame()
    const rect = canvas.getBoundingClientRect()
    markInteracting()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    pointersRef.current.set(event.pointerId, point)
    canvas.setPointerCapture(event.pointerId)
    animRef.current = null

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: point.x,
        startY: point.y,
        camera: { ...cameraRef.current },
        moved: false,
        pointerId: event.pointerId,
      }
      pinchRef.current = null
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        camera: { ...cameraRef.current },
      }
      dragRef.current = null
    }
  }

  const onPointerMove = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (pointersRef.current.size > 0) markInteracting()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const { width, height } = sizeRef.current

    // Hover inspection.
    if (cameraRef.current && cameraRef.current.scale > 0.4 && pointersRef.current.size === 0) {
      const world = screenToWorld(cameraRef.current, width, height, point.x, point.y)
      const building = hitTestBuildings(renderDataRef.current, world.x, world.y)
      hoveredIdRef.current = building?.id ?? null
      if (building) {
        setHoverInfo({
          x: point.x,
          y: point.y,
          title: building.name ? building.name : `BIN ${building.bin || String(building.id).slice(-7)}`,
          lines: [
            `${DISTRICT_BY_ID[building.district]?.name || '纽约'} · ${building.type}`,
            `高度 ${building.height.toFixed(1)} m · ${building.floors} 层`,
          ],
        })
      } else {
        setHoverInfo(null)
      }
    }

    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, point)

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const pinch = pinchRef.current
      const ratio = distance / Math.max(1, pinch.distance)
      const before = screenToWorld(pinch.camera, width, height, pinch.midpoint.x, pinch.midpoint.y)
      const next = {
        ...pinch.camera,
        scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.camera.scale * ratio)),
      }
      const after = screenToWorld(next, width, height, midpoint.x, midpoint.y)
      next.x += before.x - after.x
      next.y += before.y - after.y
      cameraRef.current = clampCamera(next, width, height)
      return
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    cameraRef.current = clampCamera(
      {
        ...drag.camera,
        x: drag.camera.x - dx / drag.camera.scale,
        y: drag.camera.y - dy / drag.camera.scale,
      },
      width,
      height,
    )
  }

  const onPointerUp = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId && !drag.moved) {
      hitTest(point.x, point.y)
    }
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 0) {
      dragRef.current = null
      pinchRef.current = null
    } else if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.entries()]
      dragRef.current = {
        startX: remaining[1].x,
        startY: remaining[1].y,
        camera: { ...cameraRef.current },
        moved: true,
        pointerId: remaining[0],
      }
      pinchRef.current = null
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event) => {
      event.preventDefault()
      if (!interactingRef.current) captureFrame()
      markInteracting()
      if (!cameraRef.current) return
      const rect = canvas.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const { width, height } = sizeRef.current
      const factor = Math.exp(-event.deltaY * 0.0014)
      animRef.current = null
      cameraRef.current = zoomCameraAt(cameraRef.current, width, height, sx, sy, factor)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const onMiniPointer = (event) => {
    const mini = miniRef.current
    if (!mini || !cameraRef.current) return
    const rect = mini.getBoundingClientRect()
    const world = minimapToWorld(event.clientX - rect.left, event.clientY - rect.top, 230, 160)
    const { width, height } = sizeRef.current
    cameraRef.current = clampCamera(
      { ...cameraRef.current, x: world.x, y: world.y },
      width,
      height,
    )
    animRef.current = null
  }

  const onDoubleClick = (event) => {
    if (!cameraRef.current) return
    if (!interactingRef.current) captureFrame()
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { width, height } = sizeRef.current
    animRef.current = null
    cameraRef.current = zoomCameraAt(
      cameraRef.current,
      width,
      height,
      event.clientX - rect.left,
      event.clientY - rect.top,
      1.7,
    )
  }

  return (
    <div className="map-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hoveredIdRef.current = null
          setHoverInfo(null)
        }}
        onDoubleClick={onDoubleClick}
      />
      <div className="map-scanlines" aria-hidden="true" />
      <div className="map-vignette" aria-hidden="true" />

      <div className="map-hud map-hud--top">
        <span>GRID / {WORLD.areaKm2} KM²</span>
        <span className="map-hud__divider" />
        <span>{data.stats.buildings.toLocaleString('zh-CN')} BUILDINGS</span>
        <span className="map-hud__divider" />
        <span>{data.districts.length} SECTORS</span>
        <span className="map-hud__divider" />
        <span>NYC OPEN DATA</span>
      </div>

      <div className="map-hud map-hud--bottom">
        <span>X {formatCoord(hud.x)}</span>
        <span>Y {formatCoord(hud.y)}</span>
        <span className="map-hud__divider" />
        <span>{hud.zoom}</span>
        <span className="map-hud__divider" />
        <span>{Math.round(scaleLabel * 100)}%</span>
      </div>

      <div className="map-compass" aria-hidden="true">
        <span>N</span>
        <i />
      </div>

      <div className="map-tools">
        <button onClick={() => zoomBy(1.45)} aria-label="放大">+</button>
        <button onClick={() => zoomBy(1 / 1.45)} aria-label="缩小">−</button>
        <button onClick={resetView} aria-label="重置视图">⌂</button>
      </div>

      <canvas
        ref={miniRef}
        className="minimap"
        onPointerDown={onMiniPointer}
        onPointerMove={(event) => {
          if (event.buttons === 1) onMiniPointer(event)
        }}
      />
      <div className="minimap-label">SECTOR OVERVIEW</div>

      {hoverInfo && (
        <div
          className="map-tooltip"
          style={{ left: Math.min(hoverInfo.x + 14, sizeRef.current.width - 210), top: hoverInfo.y + 14 }}
        >
          <strong>{hoverInfo.title}</strong>
          {hoverInfo.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}

      <div className="map-hint">
        <span>拖拽平移</span>
        <span>滚轮缩放</span>
        <span>放大后流式加载建筑</span>
      </div>
    </div>
  )
})

export default MapCanvas
