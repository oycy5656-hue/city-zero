import { WORLD, POIS } from '../data/city.js'
import { getVisibleBuildings } from './generator.js'

export const MIN_SCALE = 0.028
export const MAX_SCALE = 2.2

const PALETTES = {
  core: ['#1a2b31', '#243c43', '#31515a', '#406a73', '#568891'],
  residential: ['#2b241c', '#3a3024', '#4b3e2d', '#5e4d38', '#756044'],
  strip: ['#2b1824', '#402231', '#582d40', '#713a51', '#8a4863'],
  industrial: ['#2a211b', '#3c2e24', '#523f30', '#68523d', '#7f654a'],
  harbor: ['#16252e', '#203641', '#2c4a58', '#3a6070', '#4a7789'],
  outlands: ['#211e2b', '#2e293b', '#3e3850', '#504764', '#645878'],
}

const POI_COLORS = {
  tower: '#53e0d0',
  finance: '#53e0d0',
  gov: '#ffb454',
  media: '#ff4d9d',
  market: '#ffb454',
  industry: '#ff7a45',
  port: '#4da6ff',
  gang: '#4da6ff',
  airport: '#9d7bff',
  solar: '#ffd36a',
  park: '#8bffb0',
  medical: '#ff6b8a',
  arena: '#ff4d9d',
  transit: '#9fe8f0',
  residential: '#ffb454',
}

const CONTAINER_COLORS = ['#5e3328', '#294e54', '#5b4929', '#3a3d4f', '#365440', '#4d2e39']

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function fitCamera(width, height, padding = 56) {
  const narrow = width < 720
  const pad = narrow ? 16 : padding
  const usableW = Math.max(120, width - pad * 2)
  const usableH = Math.max(120, height - pad * 2)
  const scale = narrow
    ? Math.max(usableW / WORLD.width, usableH / WORLD.height)
    : Math.min(usableW / WORLD.width, usableH / WORLD.height)
  return {
    x: (WORLD.minX + WORLD.maxX) / 2,
    y: (WORLD.minY + WORLD.maxY) / 2,
    scale,
  }
}

export function clampCamera(camera, width, height) {
  const halfW = width / (2 * camera.scale)
  const halfH = height / (2 * camera.scale)
  const cx = (WORLD.minX + WORLD.maxX) / 2
  const cy = (WORLD.minY + WORLD.maxY) / 2
  const x =
    halfW * 2 >= WORLD.width
      ? cx
      : clamp(camera.x, WORLD.minX + halfW, WORLD.maxX - halfW)
  const y =
    halfH * 2 >= WORLD.height
      ? cy
      : clamp(camera.y, WORLD.minY + halfH, WORLD.maxY - halfH)
  return { ...camera, x, y, scale: clamp(camera.scale, MIN_SCALE, MAX_SCALE) }
}

export function worldToScreen(camera, width, height, x, y) {
  return {
    x: (x - camera.x) * camera.scale + width / 2,
    y: (y - camera.y) * camera.scale + height / 2,
  }
}

export function screenToWorld(camera, width, height, sx, sy) {
  return {
    x: (sx - width / 2) / camera.scale + camera.x,
    y: (sy - height / 2) / camera.scale + camera.y,
  }
}

export function zoomCameraAt(camera, width, height, sx, sy, factor) {
  const before = screenToWorld(camera, width, height, sx, sy)
  const scale = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE)
  const next = { ...camera, scale }
  const after = screenToWorld(next, width, height, sx, sy)
  next.x += before.x - after.x
  next.y += before.y - after.y
  return clampCamera(next, width, height)
}

export function cameraBounds(camera, width, height) {
  const halfW = width / (2 * camera.scale)
  const halfH = height / (2 * camera.scale)
  return {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  }
}

function hexToRgb(hex) {
  if (hex.startsWith('rgb')) {
    const parts = hex.match(/[\d.]+/g)
    return {
      r: Number(parts?.[0] || 0),
      g: Number(parts?.[1] || 0),
      b: Number(parts?.[2] || 0),
    }
  }
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const target = amount > 0 ? 255 : 0
  const p = Math.abs(amount)
  return `rgb(${Math.round(r + (target - r) * p)}, ${Math.round(g + (target - g) * p)}, ${Math.round(
    b + (target - b) * p,
  )})`
}

function mixColor(a, b, amount) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * amount)}, ${Math.round(
    ca.g + (cb.g - ca.g) * amount,
  )}, ${Math.round(ca.b + (cb.b - ca.b) * amount)})`
}

const STYLE_TINTS = {
  glass: '#4f9eaa',
  concrete: '#77766e',
  brick: '#884c36',
  metal: '#61747a',
  neon: '#a13d72',
}

function buildingColor(districtId, height, kind) {
  const palette = PALETTES[districtId] || PALETTES.core
  const max = kind === 'outpost' ? 35 : kind === 'industrial' ? 90 : 260
  const index = clamp(Math.floor((height / max) * palette.length), 0, palette.length - 1)
  return palette[index]
}

function tracePolygon(ctx, camera, width, height, poly) {
  if (!poly.length) return
  const first = worldToScreen(camera, width, height, poly[0][0], poly[0][1])
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < poly.length; i += 1) {
    const p = worldToScreen(camera, width, height, poly[i][0], poly[i][1])
    ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

function screenRect(camera, width, height, minX, minY, maxX, maxY) {
  const a = worldToScreen(camera, width, height, minX, minY)
  const b = worldToScreen(camera, width, height, maxX, maxY)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

function drawGrid(ctx, camera, width, height) {
  ctx.save()
  ctx.lineWidth = 1
  const step = 1000
  const bounds = cameraBounds(camera, width, height)
  const startX = Math.floor(bounds.minX / step) * step
  const endX = Math.ceil(bounds.maxX / step) * step
  const startY = Math.floor(bounds.minY / step) * step
  const endY = Math.ceil(bounds.maxY / step) * step

  for (let x = startX; x <= endX; x += step) {
    const sx = worldToScreen(camera, width, height, x, 0).x
    ctx.strokeStyle = x % 5000 === 0 ? 'rgba(120,170,180,0.075)' : 'rgba(120,170,180,0.032)'
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
    ctx.stroke()
  }
  for (let y = startY; y <= endY; y += step) {
    const sy = worldToScreen(camera, width, height, 0, y).y
    ctx.strokeStyle = y % 5000 === 0 ? 'rgba(120,170,180,0.075)' : 'rgba(120,170,180,0.032)'
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLand(ctx, camera, width, height, data) {
  ctx.save()
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#07141c')
  gradient.addColorStop(0.55, '#040d13')
  gradient.addColorStop(1, '#02070a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Water texture outside the city edge.
  ctx.strokeStyle = 'rgba(110, 190, 205, 0.045)'
  ctx.lineWidth = 1
  for (let y = 0; y < height; y += 26) {
    ctx.beginPath()
    for (let i = 0; i <= 8; i += 1) {
      const x = (width * i) / 8
      const yy = y + Math.sin(i * 1.4 + y * 0.02) * 4
      if (i === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }

  if (data.cityFootprint) {
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, data.cityFootprint)
    ctx.fillStyle = '#0a1114'
    ctx.fill()
    ctx.strokeStyle = 'rgba(74, 190, 205, 0.42)'
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.strokeStyle = 'rgba(74, 190, 205, 0.08)'
    ctx.lineWidth = 14
    ctx.stroke()
  }
  ctx.restore()
}

function drawRivers(ctx, camera, width, height, data) {
  for (const river of data.rivers || []) {
    ctx.save()
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, river.poly)
    ctx.fillStyle = '#04131b'
    ctx.fill()
    ctx.strokeStyle = 'rgba(79, 182, 198, 0.34)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(79, 182, 198, 0.06)'
    ctx.lineWidth = 12
    ctx.stroke()

    if (camera.scale > 0.12) {
      const xs = river.poly.map((p) => p[0])
      const ys = river.poly.map((p) => p[1])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      ctx.strokeStyle = 'rgba(117, 190, 202, 0.08)'
      ctx.lineWidth = 0.7
      for (let y = Math.floor(minY / 160) * 160; y < maxY; y += 160) {
        const a = worldToScreen(camera, width, height, minX, y)
        const b = worldToScreen(camera, width, height, maxX, y)
        ctx.beginPath()
        for (let i = 0; i <= 6; i += 1) {
          const x = a.x + ((b.x - a.x) * i) / 6
          const yy = a.y + Math.sin(i * 1.3 + y * 0.01) * 2
          if (i === 0) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

function drawParks(ctx, camera, width, height, data) {
  const scale = camera.scale
  for (const park of data.parks) {
    ctx.save()
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, park.poly)
    if (park.kind === 'solar') {
      ctx.fillStyle = 'rgba(35, 34, 29, 0.9)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 211, 106, 0.22)'
      ctx.lineWidth = 1
      ctx.stroke()
      const p = worldToScreen(camera, width, height, park.centroid[0], park.centroid[1])
      const panelW = 190 * scale
      const panelH = 34 * scale
      if (scale > 0.08) {
        ctx.fillStyle = 'rgba(255, 203, 86, 0.16)'
        for (let row = -4; row <= 4; row += 1) {
          for (let col = -5; col <= 5; col += 1) {
            if (row * row + col * col > 28) continue
            ctx.fillRect(p.x + col * panelW * 0.92, p.y + row * panelH * 1.2, panelW * 0.72, panelH)
          }
        }
      }
      ctx.restore()
      continue
    }

    const gradient = ctx.createRadialGradient(
      worldToScreen(camera, width, height, park.centroid[0], park.centroid[1]).x,
      worldToScreen(camera, width, height, park.centroid[0], park.centroid[1]).y,
      0,
      worldToScreen(camera, width, height, park.centroid[0], park.centroid[1]).x,
      worldToScreen(camera, width, height, park.centroid[0], park.centroid[1]).y,
      Math.max(16, 900 * scale),
    )
    gradient.addColorStop(0, 'rgba(38, 92, 69, 0.82)')
    gradient.addColorStop(1, 'rgba(14, 42, 33, 0.78)')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(110, 215, 158, 0.38)'
    ctx.lineWidth = 1
    ctx.stroke()

    if (park.water) {
      ctx.beginPath()
      tracePolygon(ctx, camera, width, height, park.water)
      ctx.fillStyle = 'rgba(10, 45, 55, 0.9)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(83, 197, 204, 0.58)'
      ctx.lineWidth = Math.max(0.7, 1.2)
      ctx.stroke()

      // Water ripples, clipped to the reservoir.
      ctx.save()
      ctx.beginPath()
      tracePolygon(ctx, camera, width, height, park.water)
      ctx.clip()
      ctx.strokeStyle = 'rgba(104, 199, 205, 0.09)'
      ctx.lineWidth = 1
      for (let i = 1; i <= 9; i += 1) {
        const y = -2300 + i * 72
        const a = worldToScreen(camera, width, height, -3000, y)
        const b = worldToScreen(camera, width, height, -1600, y + 18)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.bezierCurveTo(
          a.x + (b.x - a.x) * 0.3,
          a.y - 3,
          a.x + (b.x - a.x) * 0.7,
          a.y + 7,
          b.x,
          b.y,
        )
        ctx.stroke()
      }
      ctx.restore()

      if (park.islands) {
        for (const island of park.islands) {
          ctx.beginPath()
          tracePolygon(ctx, camera, width, height, island)
          ctx.fillStyle = 'rgba(36, 86, 61, 0.96)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(138, 214, 160, 0.4)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }

    if (park.paths && scale > 0.1) {
      ctx.strokeStyle = 'rgba(196, 178, 135, 0.34)'
      ctx.lineWidth = Math.min(4, Math.max(1, 3 * scale))
      ctx.setLineDash([6, 8])
      for (const path of park.paths) {
        ctx.beginPath()
        path.forEach(([x, y], index) => {
          const p = worldToScreen(camera, width, height, x, y)
          if (index === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    if (scale > 0.13 && park.trees) {
      for (const tree of park.trees) {
        const p = worldToScreen(camera, width, height, tree.x, tree.y)
        if (p.x < -8 || p.x > width + 8 || p.y < -8 || p.y > height + 8) continue
        const radius = Math.max(0.55, tree.size * Math.max(0.7, scale * 0.9))
        ctx.fillStyle = tree.tone > 0.5 ? 'rgba(68, 145, 97, 0.75)' : 'rgba(42, 111, 78, 0.75)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (scale > 0.16 && park.id !== 'reservoir') {
      const p = worldToScreen(camera, width, height, park.centroid[0], park.centroid[1])
      ctx.font = '500 11px "Noto Sans SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(168, 232, 196, 0.72)'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
      ctx.shadowBlur = 8
      ctx.fillText(park.name, p.x, p.y)
    }
    ctx.restore()
  }
}


function drawCityGlow(ctx, camera, width, height, data) {
  ctx.save()
  for (const district of data.districts) {
    const p = worldToScreen(camera, width, height, district.centroid[0], district.centroid[1])
    const radius = Math.max(30, Math.min(260, 1350 * camera.scale))
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
    gradient.addColorStop(0, rgba(district.color, district.id === 'core' ? 0.085 : 0.045))
    gradient.addColorStop(0.55, rgba(district.color, 0.018))
    gradient.addColorStop(1, rgba(district.color, 0))
    ctx.fillStyle = gradient
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2)
  }
  ctx.restore()
}

function drawDistricts(ctx, camera, width, height, data, selectedId) {
  ctx.save()
  for (const district of data.districts) {
    const selected = district.id === selectedId
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, district.poly)
    ctx.fillStyle = rgba(district.color, selected ? 0.11 : 0.05)
    ctx.fill()
    ctx.strokeStyle = rgba(district.color, selected ? 0.78 : 0.34)
    ctx.lineWidth = selected ? 1.6 : 1
    ctx.setLineDash(selected ? [] : [7, 7])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}

function drawDistrictLabels(ctx, camera, width, height, data, selectedId) {
  ctx.save()
  ctx.textAlign = 'center'
  for (const district of data.districts) {
    const p = worldToScreen(camera, width, height, district.centroid[0], district.centroid[1])
    if (p.x < -160 || p.x > width + 160 || p.y < -80 || p.y > height + 80) continue
    const selected = district.id === selectedId
    ctx.font = `500 ${selected ? 22 : 18}px "Noto Sans SC", "Microsoft YaHei", sans-serif`
    ctx.fillStyle = rgba(district.color, selected ? 0.92 : 0.52)
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 12
    ctx.fillText(district.name.split('').join(' '), p.x, p.y)
    ctx.font = '9px "Cascadia Mono", Consolas, monospace'
    ctx.fillStyle = rgba(district.color, selected ? 0.62 : 0.3)
    ctx.fillText(district.en, p.x, p.y + 16)
  }
  ctx.restore()
}

function drawRoads(ctx, camera, width, height, data, scale) {
  const bounds = cameraBounds(camera, width, height)
  const groups = new Map()
  for (const road of data.roads) {
    if (scale < 0.16 && road.width < 10) continue
    if (Math.max(road.x1, road.x2) < bounds.minX || Math.min(road.x1, road.x2) > bounds.maxX) continue
    if (Math.max(road.y1, road.y2) < bounds.minY || Math.min(road.y1, road.y2) > bounds.maxY) continue
    const bucket = Math.round(road.width)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(road)
  }

  for (const [roadWidth, roads] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    ctx.save()
    ctx.beginPath()
    for (const road of roads) {
      const a = worldToScreen(camera, width, height, road.x1, road.y1)
      const b = worldToScreen(camera, width, height, road.x2, road.y2)
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.strokeStyle = 'rgba(5, 9, 11, 0.92)'
    ctx.lineWidth = Math.max(0.9, roadWidth * scale + 1.4)
    ctx.stroke()
    ctx.strokeStyle =
      roadWidth >= 22
        ? 'rgba(67, 83, 91, 0.96)'
        : roadWidth >= 17
          ? 'rgba(53, 72, 81, 0.95)'
          : roadWidth >= 10
            ? 'rgba(38, 55, 63, 0.92)'
            : 'rgba(27, 42, 50, 0.9)'
    ctx.lineWidth = Math.max(0.55, roadWidth * scale)
    ctx.stroke()

    if (roadWidth >= 17 && scale > 0.4) {
      ctx.setLineDash([Math.max(2, 6 * scale), Math.max(2, 7 * scale)])
      ctx.strokeStyle = 'rgba(206, 201, 176, 0.22)'
      ctx.lineWidth = Math.max(0.45, 0.8 * scale)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  // Elevated expressways are rendered after the buildings so they read as
  // overpasses instead of surface streets.
}

function drawBlocks(ctx, camera, width, height, data) {
  const bounds = cameraBounds(camera, width, height)
  const groups = new Map()
  for (const block of data.blocks) {
    if (block.x < bounds.minX - 200 || block.x > bounds.maxX + 200) continue
    if (block.y < bounds.minY - 200 || block.y > bounds.maxY + 200) continue
    if (block.w * camera.scale < 1 || block.h * camera.scale < 1) continue
    const style = block.plaza
      ? 'plaza'
      : block.yard
        ? 'yard'
        : buildingColor(block.district, block.height || 20, 'mixed')
    if (!groups.has(style)) groups.set(style, [])
    groups.get(style).push(block)
  }

  ctx.save()
  for (const [style, blocks] of groups) {
    ctx.beginPath()
    for (const block of blocks) {
      block.corners.forEach(([x, y], index) => {
        const p = worldToScreen(camera, width, height, x, y)
        if (index === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
    }
    ctx.globalAlpha = style === 'plaza' ? 0.78 : 0.58
    ctx.fillStyle = style === 'plaza' ? 'rgba(27, 69, 52, 0.76)' : style === 'yard' ? 'rgba(24, 29, 31, 0.86)' : style
    ctx.fill()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = 'rgba(144, 188, 190, 0.2)'
    ctx.lineWidth = 0.55
    ctx.stroke()
  }
  ctx.restore()
}

function drawBlockGround(ctx, camera, width, height, data) {
  const bounds = cameraBounds(camera, width, height)
  const scale = camera.scale
  for (const block of data.blocks) {
    if (block.x < bounds.minX - 200 || block.x > bounds.maxX + 200) continue
    if (block.y < bounds.minY - 200 || block.y > bounds.maxY + 200) continue
    const p = worldToScreen(camera, width, height, block.x, block.y)
    const w = block.w * scale
    const h = block.h * scale
    if (w < 3 || h < 3) continue
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(block.angle)
    ctx.fillStyle = 'rgba(17, 25, 27, 0.82)'
    ctx.fillRect(-w / 2, -h / 2, w, h)

    if (block.courtyard) {
      const cw = block.courtyard.w * scale
      const ch = block.courtyard.h * scale
      ctx.fillStyle = block.courtyard.green ? 'rgba(28, 70, 52, 0.82)' : 'rgba(35, 39, 40, 0.86)'
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
      if (block.courtyard.green && scale > 0.6) {
        ctx.fillStyle = 'rgba(69, 138, 95, 0.55)'
        for (let i = 0; i < 7; i += 1) {
          const angle = i * 2.4 + block.x * 0.0001
          const tx = Math.cos(angle) * (cw * 0.26 + (i % 3) * 3)
          const ty = Math.sin(angle) * (ch * 0.26 + (i % 2) * 2)
          ctx.beginPath()
          ctx.arc(tx, ty, Math.max(0.7, 1.6 * scale), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    if (block.yard) {
      ctx.fillStyle = 'rgba(33, 34, 31, 0.4)'
      ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84)
      if (scale > 0.5) {
        ctx.strokeStyle = 'rgba(191, 184, 151, 0.1)'
        ctx.lineWidth = 0.7
        for (let i = -2; i <= 2; i += 1) {
          ctx.beginPath()
          ctx.moveTo(i * w * 0.14, -h * 0.32)
          ctx.lineTo(i * w * 0.14, h * 0.32)
          ctx.stroke()
        }
      }
    }

    if (block.solar && scale > 0.32) {
      ctx.fillStyle = 'rgba(30, 47, 58, 0.7)'
      for (let sx = -2; sx <= 2; sx += 1) {
        for (let sy = -1; sy <= 1; sy += 1) {
          ctx.fillRect(sx * w * 0.16 - w * 0.06, sy * h * 0.18 - h * 0.05, w * 0.1, h * 0.08)
        }
      }
    }

    if (block.construction && scale > 0.27) {
      const height = Math.min(h * 0.6, 90 * scale)
      ctx.strokeStyle = 'rgba(255, 190, 84, 0.64)'
      ctx.lineWidth = Math.max(0.7, 1.2 * scale)
      ctx.beginPath()
      ctx.moveTo(0, h * 0.2)
      ctx.lineTo(0, h * 0.2 - height)
      ctx.lineTo(w * 0.28, h * 0.2 - height * 0.72)
      ctx.moveTo(0, h * 0.2 - height)
      ctx.lineTo(-w * 0.18, h * 0.2 - height * 0.84)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(139, 188, 188, 0.16)'
    ctx.lineWidth = 0.7
    ctx.strokeRect(-w / 2, -h / 2, w, h)

    if (scale > 0.72 && w > 12 && h > 12) {
      ctx.fillStyle = 'rgba(74, 143, 102, 0.5)'
      const treeInset = Math.min(w, h) * 0.04
      const positions = [
        [-w / 2 + treeInset, -h / 2 + treeInset],
        [w / 2 - treeInset, -h / 2 + treeInset],
        [-w / 2 + treeInset, h / 2 - treeInset],
        [w / 2 - treeInset, h / 2 - treeInset],
        [0, -h / 2 + treeInset],
        [0, h / 2 - treeInset],
      ]
      for (const [tx, ty] of positions) {
        ctx.beginPath()
        ctx.arc(tx, ty, Math.min(2.6, Math.max(0.8, 1.2 * scale)), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

function drawExpressways(ctx, camera, width, height, data, scale) {
  if (scale < 0.27) return
  for (const highway of data.highways) {
    const path = () => {
      ctx.beginPath()
      highway.points.forEach(([x, y], index) => {
        const p = worldToScreen(camera, width, height, x, y)
        if (index === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
    }

    // Elevated shadow.
    ctx.save()
    ctx.translate(10, 13)
    path()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)'
    ctx.lineWidth = Math.max(4, highway.width * scale + 10)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()

    // Concrete deck and edge barriers.
    path()
    ctx.strokeStyle = 'rgba(4, 8, 10, 0.98)'
    ctx.lineWidth = Math.max(4, highway.width * scale + 6)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(75, 86, 90, 0.96)'
    ctx.lineWidth = Math.max(3, highway.width * scale)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(154, 171, 172, 0.28)'
    ctx.lineWidth = Math.max(0.7, 1.2)
    ctx.stroke()

    if (scale > 0.36) {
      path()
      ctx.setLineDash([Math.max(3, 10 * scale), Math.max(3, 9 * scale)])
      ctx.strokeStyle = 'rgba(255, 190, 95, 0.65)'
      ctx.lineWidth = Math.max(0.6, 1.2 * scale)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Support columns along the viaduct.
    if (scale > 0.55) {
      for (let i = 0; i < highway.points.length - 1; i += 1) {
        const [x1, y1] = highway.points[i]
        const [x2, y2] = highway.points[i + 1]
        const length = Math.hypot(x2 - x1, y2 - y1)
        const count = Math.floor(length / 120)
        const nx = -(y2 - y1) / Math.max(1, length)
        const ny = (x2 - x1) / Math.max(1, length)
        for (let j = 0; j <= count; j += 1) {
          const t = j / Math.max(1, count)
          const x = x1 + (x2 - x1) * t
          const y = y1 + (y2 - y1) * t
          for (const side of [-1, 1]) {
            const p = worldToScreen(
              camera,
              width,
              height,
              x + nx * side * (highway.width / 2 + 2),
              y + ny * side * (highway.width / 2 + 2),
            )
            ctx.fillStyle = 'rgba(18, 25, 27, 0.9)'
            ctx.beginPath()
            ctx.arc(p.x, p.y, Math.max(0.8, 1.8 * scale), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }
  }
}

function drawRamps(ctx, camera, width, height, data, scale) {
  if (scale < 0.27) return
  for (const ramp of data.ramps || []) {
    const a = worldToScreen(camera, width, height, ramp.x1, ramp.y1)
    const b = worldToScreen(camera, width, height, ramp.x2, ramp.y2)
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18
    const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.18
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.quadraticCurveTo(mx, my, b.x, b.y)
    }
    ctx.save()
    ctx.translate(5, 7)
    path()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.lineWidth = Math.max(3, 15 * scale)
    ctx.stroke()
    ctx.restore()

    path()
    ctx.strokeStyle = 'rgba(8, 12, 14, 0.96)'
    ctx.lineWidth = Math.max(2, 12 * scale)
    ctx.stroke()
    path()
    ctx.strokeStyle = 'rgba(95, 113, 118, 0.92)'
    ctx.lineWidth = Math.max(1.5, 8 * scale)
    ctx.stroke()
    if (scale > 0.5) {
      ctx.setLineDash([Math.max(2, 5 * scale), Math.max(2, 6 * scale)])
      ctx.strokeStyle = 'rgba(255, 209, 132, 0.55)'
      ctx.lineWidth = Math.max(0.5, 0.8 * scale)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Merge arrow at the surface end.
    const angle = Math.atan2(b.y - my, b.x - mx)
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(angle)
    ctx.fillStyle = 'rgba(255, 203, 112, 0.75)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-8 * Math.max(0.6, scale), -4 * Math.max(0.6, scale))
    ctx.lineTo(-8 * Math.max(0.6, scale), 4 * Math.max(0.6, scale))
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

function drawBridges(ctx, camera, width, height, data, scale) {
  if (scale < 0.04) return
  for (const bridge of data.bridges || []) {
    const path = () => {
      ctx.beginPath()
      bridge.points.forEach(([x, y], index) => {
        const p = worldToScreen(camera, width, height, x, y)
        if (index === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
    }
    ctx.save()
    ctx.translate(5, 8)
    path()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.34)'
    ctx.lineWidth = Math.max(3, bridge.width * scale + 8)
    ctx.stroke()
    ctx.restore()

    path()
    ctx.strokeStyle = 'rgba(4, 8, 10, 0.98)'
    ctx.lineWidth = Math.max(3, bridge.width * scale + 5)
    ctx.stroke()
    path()
    ctx.strokeStyle = 'rgba(86, 103, 107, 0.96)'
    ctx.lineWidth = Math.max(2, bridge.width * scale)
    ctx.stroke()

    if (scale > 0.4) {
      path()
      ctx.setLineDash([Math.max(2, 7 * scale), Math.max(2, 7 * scale)])
      ctx.strokeStyle = 'rgba(255, 205, 126, 0.55)'
      ctx.lineWidth = Math.max(0.5, 0.9 * scale)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Suspension towers and cable fans.
    if (scale > 0.3) {
      for (const [tx, ty] of bridge.towers || []) {
        const p = worldToScreen(camera, width, height, tx, ty)
        const size = Math.max(2, 26 * scale)
        ctx.fillStyle = 'rgba(44, 57, 61, 0.95)'
        ctx.fillRect(p.x - size * 0.35, p.y - size, size * 0.7, size * 1.5)
        ctx.strokeStyle = 'rgba(180, 213, 214, 0.38)'
        ctx.lineWidth = Math.max(0.6, 0.9 * scale)
        ctx.beginPath()
        ctx.moveTo(p.x - size * 0.35, p.y - size)
        ctx.lineTo(p.x, p.y - size * 0.55)
        ctx.lineTo(p.x + size * 0.35, p.y - size)
        ctx.stroke()
      }
    }
  }
}

function drawInterchanges(ctx, camera, width, height, data, scale) {
  if (scale < 0.3) return
  for (const node of data.interchanges || []) {
    const p = worldToScreen(camera, width, height, node.x, node.y)
    const radius = Math.max(4, 42 * scale)
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 198, 104, 0.4)'
    ctx.lineWidth = Math.max(0.8, 1.2 * scale)
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 219, 152, 0.7)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(1.2, radius * 0.32), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawDistrictOutlines(ctx, camera, width, height, data, selectedId) {
  ctx.save()
  for (const district of data.districts) {
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, district.poly)
    ctx.strokeStyle = rgba(district.color, district.id === selectedId ? 0.9 : 0.42)
    ctx.lineWidth = district.id === selectedId ? 1.8 : 1
    ctx.setLineDash(district.id === selectedId ? [] : [9, 7])
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}

function drawLowZoomRoads(ctx, camera, width, height, data) {
  const bounds = cameraBounds(camera, width, height)
  const groups = new Map()
  for (const road of data.roads) {
    if (Math.max(road.x1, road.x2) < bounds.minX || Math.min(road.x1, road.x2) > bounds.maxX) continue
    if (Math.max(road.y1, road.y2) < bounds.minY || Math.min(road.y1, road.y2) > bounds.maxY) continue
    const bucket = Math.round(road.width)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(road)
  }

  ctx.save()
  for (const [roadWidth, roads] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    ctx.beginPath()
    for (const road of roads) {
      const a = worldToScreen(camera, width, height, road.x1, road.y1)
      const b = worldToScreen(camera, width, height, road.x2, road.y2)
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.strokeStyle =
      roadWidth >= 22
        ? 'rgba(141, 166, 168, 0.85)'
        : roadWidth >= 17
          ? 'rgba(110, 143, 148, 0.76)'
          : roadWidth >= 10
            ? 'rgba(77, 103, 110, 0.62)'
            : 'rgba(55, 76, 84, 0.5)'
    ctx.lineWidth = Math.max(0.55, roadWidth * 0.052)
    ctx.stroke()
  }

  for (const highway of data.highways) {
    ctx.beginPath()
    highway.points.forEach(([x, y], index) => {
      const p = worldToScreen(camera, width, height, x, y)
      if (index === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.strokeStyle = 'rgba(255, 180, 84, 0.5)'
    ctx.lineWidth = 1.6
    ctx.stroke()
  }
  ctx.restore()
}

function drawBuildings(ctx, camera, width, height, data, scale, hoveredId) {
  const bounds = cameraBounds(camera, width, height)
  const buildings = getVisibleBuildings(data, bounds)
  const detailed = scale > 0.34
  const extruded = scale > 0.46
  const veryDetailed = scale > 1.05
  const ordered = extruded ? [...buildings].sort((a, b) => a.height - b.height) : buildings
  const districtColors = new Map(data.districts.map((district) => [district.id, district.color]))

  // Ground shadows. Keeping these in a separate pass makes the city read as a
  // collection of volumes instead of a flat colour field.
  if (detailed) {
    ctx.save()
    for (const b of buildings) {
      if (b.height < 10) continue
      const p = worldToScreen(camera, width, height, b.x, b.y)
      const w = b.w * scale
      const h = b.h * scale
      if (w < 1.4 || h < 1.4) continue
      const offset = Math.min(12, b.height * scale * 0.12)
      if (offset < 0.8) continue
      const cos = Math.cos(b.angle)
      const sin = Math.sin(b.angle)
      const hw = w / 2
      const hh = h / 2
      const corners = [
        [p.x + (-hw * cos + hh * sin) + offset, p.y + (-hw * sin - hh * cos) + offset * 0.75],
        [p.x + (hw * cos + hh * sin) + offset, p.y + (hw * sin - hh * cos) + offset * 0.75],
        [p.x + (hw * cos - hh * sin) + offset, p.y + (hw * sin + hh * cos) + offset * 0.75],
        [p.x + (-hw * cos - hh * sin) + offset, p.y + (-hw * sin + hh * cos) + offset * 0.75],
      ]
      ctx.beginPath()
      ctx.moveTo(corners[0][0], corners[0][1])
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i][0], corners[i][1])
      ctx.closePath()
      ctx.fillStyle = `rgba(0, 0, 0, ${b.height > 100 ? 0.2 : 0.12})`
      ctx.fill()
    }
    ctx.restore()
  }

  ctx.save()
  for (const b of ordered) {
    const p = worldToScreen(camera, width, height, b.x, b.y)
    const w = b.w * scale
    const h = b.h * scale
    if (w < 0.7 || h < 0.7) continue
    const toneShift = (b.tone - 0.5) * 0.26
    let baseColor = shade(buildingColor(b.district, b.height, b.type), toneShift)
    if (b.type === 'container') {
      baseColor = CONTAINER_COLORS[Math.floor(b.tone * CONTAINER_COLORS.length) % CONTAINER_COLORS.length]
    } else if (b.style && STYLE_TINTS[b.style]) {
      baseColor = mixColor(baseColor, STYLE_TINTS[b.style], 0.42)
    }
    const accent = districtColors.get(b.district) || '#53e0d0'

    if (b.shape === 'cross' || b.shape === 'L' || b.shape === 'U') {
      const offset = Math.min(12, b.height * scale * 0.12)
      const cos = Math.cos(b.angle)
      const sin = Math.sin(b.angle)
      const paint = (fill) => {
        ctx.fillStyle = fill
        if (b.shape === 'cross') {
          ctx.fillRect(-w / 2, -h / 2, w, h)
          ctx.fillRect(-w * 0.16, -h * 0.72, w * 0.32, h * 1.44)
        } else if (b.shape === 'L') {
          ctx.fillRect(-w / 2, -h / 2, w * 0.64, h)
          ctx.fillRect(-w / 2, h * 0.05, w, h * 0.45)
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h * 0.42)
          ctx.fillRect(-w / 2, -h / 2, w * 0.28, h)
          ctx.fillRect(w * 0.22, -h / 2, w * 0.28, h)
        }
      }
      ctx.save()
      ctx.translate(p.x + offset, p.y + offset)
      ctx.rotate(b.angle)
      paint('rgba(0, 0, 0, 0.2)')
      ctx.restore()
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(b.angle)
      paint(shade(baseColor, -0.18))
      ctx.restore()
      if (hoveredId === b.id) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(b.angle)
        ctx.strokeStyle = '#ffd36a'
        ctx.lineWidth = 1.5
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.restore()
      }
      continue
    }

    if (b.shape === 'round') {
      const radius = Math.max(1, Math.min(w, h) / 2)
      const offset = Math.min(12, b.height * scale * 0.12)
      ctx.beginPath()
      ctx.arc(p.x + offset, p.y + offset * 0.7, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = shade(baseColor, -0.36)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y - Math.min(4, radius * 0.14), radius * 0.78, 0, Math.PI * 2)
      ctx.fillStyle = shade(baseColor, 0.18)
      ctx.fill()
      ctx.strokeStyle = rgba(accent, 0.32)
      ctx.lineWidth = 0.7
      ctx.stroke()
      if (veryDetailed && radius > 7) {
        ctx.beginPath()
        ctx.arc(p.x, p.y - Math.min(4, radius * 0.14), radius * 0.28, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(160, 220, 220, 0.28)'
        ctx.stroke()
      }
      if (hoveredId === b.id) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius + 1, 0, Math.PI * 2)
        ctx.strokeStyle = '#ffd36a'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      continue
    }

    const cos = Math.cos(b.angle)
    const sin = Math.sin(b.angle)
    const hw = w / 2
    const hh = h / 2
    const corners = [
      { x: p.x + (-hw * cos + hh * sin), y: p.y + (-hw * sin - hh * cos) },
      { x: p.x + (hw * cos + hh * sin), y: p.y + (hw * sin - hh * cos) },
      { x: p.x + (hw * cos - hh * sin), y: p.y + (hw * sin + hh * cos) },
      { x: p.x + (-hw * cos - hh * sin), y: p.y + (-hw * sin + hh * cos) },
    ]

    if (!extruded) {
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y)
      ctx.closePath()
      ctx.fillStyle = baseColor
      ctx.fill()
      if (detailed) {
        ctx.strokeStyle = rgba(accent, 0.22)
        ctx.lineWidth = 0.55
        ctx.stroke()
      }
      if (detailed && b.height > 55 && w > 4 && h > 4) {
        ctx.fillStyle = 'rgba(170, 225, 225, 0.1)'
        ctx.fillRect(p.x - w * 0.22, p.y - h * 0.22, w * 0.44, h * 0.44)
      }
    } else {
      const heightPx = Math.min(20, Math.max(0.7, b.height * scale * 0.17))
      const ox = heightPx * 0.3
      const oy = -heightPx
      const roof = corners.map((corner) => ({ x: corner.x + ox, y: corner.y + oy }))

      // Base footprint.
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y)
      ctx.closePath()
      ctx.fillStyle = shade(baseColor, -0.62)
      ctx.fill()

      // Two visible side faces.
      ctx.beginPath()
      ctx.moveTo(corners[3].x, corners[3].y)
      ctx.lineTo(corners[2].x, corners[2].y)
      ctx.lineTo(roof[2].x, roof[2].y)
      ctx.lineTo(roof[3].x, roof[3].y)
      ctx.closePath()
      ctx.fillStyle = shade(baseColor, -0.46)
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(corners[2].x, corners[2].y)
      ctx.lineTo(corners[1].x, corners[1].y)
      ctx.lineTo(roof[1].x, roof[1].y)
      ctx.lineTo(roof[2].x, roof[2].y)
      ctx.closePath()
      ctx.fillStyle = shade(baseColor, -0.3)
      ctx.fill()

      // Roof plane.
      ctx.beginPath()
      ctx.moveTo(roof[0].x, roof[0].y)
      for (let i = 1; i < 4; i += 1) ctx.lineTo(roof[i].x, roof[i].y)
      ctx.closePath()
      ctx.fillStyle = shade(baseColor, 0.16)
      ctx.fill()
      if (w > 4 && h > 4) {
        ctx.strokeStyle = rgba(accent, 0.2)
        ctx.lineWidth = 0.6
        ctx.stroke()
      }

      if (veryDetailed && b.height > 20 && w > 8 && h > 8) {
        const cx = (roof[0].x + roof[1].x + roof[2].x + roof[3].x) / 4
        const cy = (roof[0].y + roof[1].y + roof[2].y + roof[3].y) / 4
        ctx.fillStyle = 'rgba(7, 17, 20, 0.48)'
        ctx.fillRect(cx - w * 0.28, cy - h * 0.16, w * 0.16, h * 0.12)
        ctx.fillRect(cx + w * 0.1, cy - h * 0.04, w * 0.1, h * 0.08)
        if (b.height > 48) {
          const inset = 0.58
          ctx.beginPath()
          roof.forEach((corner, index) => {
            const x = cx + (corner.x - cx) * inset
            const y = cy + (corner.y - cy) * inset
            if (index === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.closePath()
          ctx.fillStyle = 'rgba(125, 205, 207, 0.13)'
          ctx.fill()
        }

        if (b.tone > 0.8) {
          ctx.strokeStyle = rgba(accent, 0.55)
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(roof[3].x + 2, roof[3].y - 2)
          ctx.lineTo(roof[2].x - 2, roof[2].y - 2)
          ctx.stroke()
        }

        if (b.height > 100) {
          ctx.strokeStyle = 'rgba(190, 240, 240, 0.35)'
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx, cy - Math.min(18, b.height * scale * 0.22))
          ctx.stroke()
          ctx.fillStyle = 'rgba(255, 78, 88, 0.85)'
          ctx.beginPath()
          ctx.arc(cx, cy - Math.min(18, b.height * scale * 0.22), 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(255, 208, 110, 0.5)'
        ctx.fillRect(cx - w * 0.16, cy - h * 0.06, 1.6, 1.6)
        ctx.fillRect(cx + w * 0.12, cy + h * 0.1, 1.3, 1.3)

        if (b.roof === 'skylight') {
          ctx.fillStyle = 'rgba(192, 239, 245, 0.34)'
          ctx.fillRect(cx - w * 0.26, cy - h * 0.05, w * 0.52, h * 0.1)
          ctx.fillStyle = 'rgba(220, 250, 250, 0.5)'
          ctx.fillRect(cx - w * 0.2, cy - h * 0.02, w * 0.4, 1.2)
        } else if (b.roof === 'cooling') {
          ctx.fillStyle = 'rgba(22, 34, 36, 0.7)'
          for (let i = -2; i <= 2; i += 1) {
            ctx.fillRect(cx + i * w * 0.14 - 2, cy - h * 0.12, w * 0.08, h * 0.16)
          }
        } else if (b.roof === 'garden') {
          ctx.fillStyle = 'rgba(54, 126, 80, 0.5)'
          ctx.fillRect(cx - w * 0.3, cy - h * 0.2, w * 0.6, h * 0.4)
        } else if (b.roof === 'solar') {
          ctx.strokeStyle = 'rgba(104, 170, 190, 0.5)'
          ctx.lineWidth = 0.7
          for (let i = -1; i <= 1; i += 1) {
            for (let j = -1; j <= 1; j += 1) {
              ctx.strokeRect(cx + i * w * 0.2 - w * 0.08, cy + j * h * 0.18 - h * 0.06, w * 0.16, h * 0.12)
            }
          }
        } else if (b.roof === 'billboard') {
          ctx.fillStyle = 'rgba(255, 54, 146, 0.58)'
          ctx.fillRect(cx - w * 0.3, cy - h * 0.52, w * 0.6, h * 0.18)
          ctx.fillStyle = 'rgba(255, 234, 245, 0.75)'
          ctx.fillRect(cx - w * 0.22, cy - h * 0.45, w * 0.34, 1.2)
          ctx.fillRect(cx - w * 0.22, cy - h * 0.41, w * 0.2, 1)
        } else if (b.roof === 'sawtooth') {
          ctx.strokeStyle = 'rgba(190, 220, 220, 0.32)'
          ctx.lineWidth = 0.8
          ctx.beginPath()
          for (let i = 0; i < 5; i += 1) {
            const x = cx - w * 0.34 + i * w * 0.16
            ctx.moveTo(x, cy + h * 0.18)
            ctx.lineTo(x + w * 0.08, cy - h * 0.14)
            ctx.lineTo(x + w * 0.16, cy + h * 0.18)
          }
          ctx.stroke()
        } else if (b.roof === 'arch') {
          ctx.strokeStyle = 'rgba(186, 224, 226, 0.36)'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(cx, cy + h * 0.16, Math.min(w, h) * 0.36, Math.PI, 0)
          ctx.stroke()
        } else if (b.roof === 'open') {
          ctx.strokeStyle = 'rgba(204, 204, 184, 0.24)'
          ctx.lineWidth = 0.7
          for (let i = -2; i <= 2; i += 1) {
            ctx.beginPath()
            ctx.moveTo(cx + i * w * 0.13, cy - h * 0.28)
            ctx.lineTo(cx + i * w * 0.13, cy + h * 0.28)
            ctx.stroke()
          }
        } else if (b.roof === 'canopy') {
          ctx.fillStyle = 'rgba(255, 176, 84, 0.36)'
          ctx.fillRect(cx - w * 0.26, cy - h * 0.08, w * 0.52, h * 0.06)
        } else if (b.roof === 'watertower') {
          ctx.fillStyle = 'rgba(48, 42, 34, 0.9)'
          ctx.beginPath()
          ctx.arc(cx + w * 0.15, cy - h * 0.08, Math.min(4.5, w * 0.12), 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(120, 104, 82, 0.55)'
          ctx.lineWidth = 0.7
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(cx + w * 0.15 - 3, cy - h * 0.08 + 3)
          ctx.lineTo(cx + w * 0.15 + 3, cy - h * 0.08 + 3)
          ctx.stroke()
        }
      }
    }

    if (hoveredId === b.id) {
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y)
      ctx.closePath()
      ctx.strokeStyle = '#ffd36a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawTraffic(ctx, camera, width, height, data, scale, time) {
  if (scale < 0.18) return
  ctx.save()
  for (const vehicle of data.vehicles) {
    const route = data.trafficRoutes[vehicle.route]
    if (!route || !route.length) continue
    const t = ((vehicle.t + time * vehicle.speed * 0.04 * vehicle.dir) % 1 + 1) % 1
    const distance = t * route.length
    let segment = route.segments[route.segments.length - 1]
    for (let i = 0; i < route.segments.length; i += 1) {
      const seg = route.segments[i]
      if (distance >= seg.start && distance <= seg.start + seg.length) {
        segment = seg
        break
      }
    }
    if (!segment) continue
    const local = (distance - segment.start) / segment.length
    const wx = segment.x1 + (segment.x2 - segment.x1) * local
    const wy = segment.y1 + (segment.y2 - segment.y1) * local
    const p = worldToScreen(camera, width, height, wx, wy)
    if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) continue
    ctx.fillStyle = vehicle.color
    ctx.globalAlpha = 0.8
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
    if (scale > 0.8) {
      ctx.globalAlpha = 0.16
      ctx.fillRect(p.x - 5, p.y - 1, 10, 2)
    }
  }
  ctx.restore()
}

function drawStreetLights(ctx, camera, width, height, data, scale) {
  if (scale < 0.3) return
  ctx.save()
  for (const highway of data.highways) {
    for (let i = 0; i < highway.points.length - 1; i += 1) {
      const [x1, y1] = highway.points[i]
      const [x2, y2] = highway.points[i + 1]
      const length = Math.hypot(x2 - x1, y2 - y1)
      const count = Math.max(1, Math.floor(length / 130))
      for (let j = 0; j <= count; j += 1) {
        const t = j / count
        const x = x1 + (x2 - x1) * t
        const y = y1 + (y2 - y1) * t
        const p = worldToScreen(camera, width, height, x, y)
        if (p.x < -4 || p.x > width + 4 || p.y < -4 || p.y > height + 4) continue
        ctx.fillStyle = j % 3 === 0 ? 'rgba(255, 205, 120, 0.72)' : 'rgba(255, 222, 157, 0.36)'
        ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6)
      }
    }
  }
  ctx.restore()
}

function drawPoiIcon(ctx, x, y, type, color, size) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.fillStyle = 'rgba(5, 10, 12, 0.92)'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.arc(0, 0, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  if (type === 'tower') {
    ctx.moveTo(0, -size * 0.55)
    ctx.lineTo(size * 0.34, size * 0.4)
    ctx.lineTo(0, size * 0.2)
    ctx.lineTo(-size * 0.34, size * 0.4)
    ctx.closePath()
  } else if (type === 'finance') {
    ctx.moveTo(0, -size * 0.5)
    ctx.lineTo(size * 0.45, 0)
    ctx.lineTo(0, size * 0.5)
    ctx.lineTo(-size * 0.45, 0)
    ctx.closePath()
  } else if (type === 'gov') {
    ctx.rect(-size * 0.38, -size * 0.35, size * 0.76, size * 0.7)
    ctx.moveTo(-size * 0.5, -size * 0.35)
    ctx.lineTo(0, -size * 0.62)
    ctx.lineTo(size * 0.5, -size * 0.35)
  } else if (type === 'media') {
    ctx.moveTo(-size * 0.3, -size * 0.4)
    ctx.lineTo(size * 0.48, 0)
    ctx.lineTo(-size * 0.3, size * 0.4)
    ctx.closePath()
  } else if (type === 'industry' || type === 'solar') {
    ctx.moveTo(-size * 0.4, size * 0.32)
    ctx.lineTo(-size * 0.16, -size * 0.45)
    ctx.lineTo(size * 0.16, -size * 0.45)
    ctx.lineTo(size * 0.4, size * 0.32)
    ctx.closePath()
  } else if (type === 'port' || type === 'gang') {
    ctx.arc(0, -size * 0.22, size * 0.18, 0, Math.PI * 2)
    ctx.moveTo(0, -size * 0.05)
    ctx.lineTo(0, size * 0.42)
    ctx.moveTo(-size * 0.34, size * 0.12)
    ctx.lineTo(0, size * 0.36)
    ctx.lineTo(size * 0.34, size * 0.12)
  } else if (type === 'airport') {
    ctx.moveTo(-size * 0.5, 0)
    ctx.lineTo(size * 0.5, 0)
    ctx.moveTo(0, -size * 0.48)
    ctx.lineTo(0, size * 0.48)
    ctx.moveTo(-size * 0.22, -size * 0.2)
    ctx.lineTo(size * 0.3, size * 0.32)
  } else if (type === 'medical') {
    ctx.moveTo(-size * 0.14, -size * 0.48)
    ctx.lineTo(size * 0.14, -size * 0.48)
    ctx.lineTo(size * 0.14, -size * 0.14)
    ctx.lineTo(size * 0.48, -size * 0.14)
    ctx.lineTo(size * 0.48, size * 0.14)
    ctx.lineTo(size * 0.14, size * 0.14)
    ctx.lineTo(size * 0.14, size * 0.48)
    ctx.lineTo(-size * 0.14, size * 0.48)
    ctx.lineTo(-size * 0.14, size * 0.14)
    ctx.lineTo(-size * 0.48, size * 0.14)
    ctx.lineTo(-size * 0.48, -size * 0.14)
    ctx.lineTo(-size * 0.14, -size * 0.14)
    ctx.closePath()
  } else if (type === 'arena') {
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2)
    ctx.moveTo(-size * 0.3, 0)
    ctx.lineTo(size * 0.3, 0)
  } else if (type === 'park') {
    ctx.moveTo(0, -size * 0.45)
    ctx.quadraticCurveTo(size * 0.48, 0, 0, size * 0.46)
    ctx.quadraticCurveTo(-size * 0.48, 0, 0, -size * 0.45)
  } else if (type === 'transit') {
    ctx.moveTo(-size * 0.42, -size * 0.3)
    ctx.lineTo(0, 0)
    ctx.lineTo(-size * 0.42, size * 0.3)
    ctx.moveTo(0, -size * 0.3)
    ctx.lineTo(size * 0.42, 0)
    ctx.lineTo(0, size * 0.3)
  } else {
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.restore()
}

function drawPois(ctx, camera, width, height, data, scale, selectedPoiId) {
  ctx.save()
  for (const poi of data.pois) {
    const p = worldToScreen(camera, width, height, poi.x, poi.y)
    if (p.x < -80 || p.x > width + 80 || p.y < -60 || p.y > height + 60) continue
    const color = POI_COLORS[poi.type] || '#d9e6e8'
    const selected = poi.id === selectedPoiId
    const size = selected ? 10 : 7.5
    if (selected) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 17, 0, Math.PI * 2)
      ctx.fillStyle = rgba(color, 0.12)
      ctx.fill()
      ctx.strokeStyle = rgba(color, 0.7)
      ctx.lineWidth = 1
      ctx.stroke()
    }
    drawPoiIcon(ctx, p.x, p.y, poi.type, color, size)
    if (scale > 0.16 || selected) {
      ctx.font = `500 ${selected ? 12 : 10}px "Noto Sans SC", "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'left'
      ctx.fillStyle = selected ? '#f1f7f7' : 'rgba(211, 228, 232, 0.76)'
      ctx.shadowColor = 'rgba(0,0,0,0.95)'
      ctx.shadowBlur = 6
      ctx.fillText(poi.name, p.x + 13, p.y + 3)
      if (selected) {
        ctx.font = '8px "Cascadia Mono", Consolas, monospace'
        ctx.fillStyle = rgba(color, 0.8)
        ctx.fillText(poi.en, p.x + 13, p.y + 15)
      }
    }
  }
  ctx.restore()
}

function drawLandmarks(ctx, camera, width, height, data, scale) {
  ctx.save()
  for (const poi of POIS) {
    if (poi.type !== 'tower' && poi.type !== 'media') continue
    const p = worldToScreen(camera, width, height, poi.x, poi.y)
    if (p.x < -100 || p.x > width + 100 || p.y < -100 || p.y > height + 100) continue
    const radius = Math.max(2, poi.height * scale * 0.055)
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(83, 224, 208, 0.035)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(83, 224, 208, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

function drawScaleBar(ctx, camera, width, height, rightInset = 36) {
  const targetPx = 110
  const meters = targetPx / camera.scale
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].reduce((best, value) =>
    Math.abs(value - meters) < Math.abs(best - meters) ? value : best,
  )
  const px = nice * camera.scale
  const x = width - rightInset - px
  const y = height - 30
  ctx.save()
  ctx.strokeStyle = 'rgba(211, 228, 232, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + px, y)
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x, y + 4)
  ctx.moveTo(x + px, y - 4)
  ctx.lineTo(x + px, y + 4)
  ctx.stroke()
  ctx.font = '9px "Cascadia Mono", Consolas, monospace'
  ctx.fillStyle = 'rgba(211, 228, 232, 0.5)'
  ctx.textAlign = 'center'
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + px / 2, y - 9)
  ctx.restore()
}

export function drawMap(ctx, data, camera, width, height, options = {}) {
  const scale = camera.scale
  const time = options.time || 0
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#05080b'
  ctx.fillRect(0, 0, width, height)

  drawLand(ctx, camera, width, height, data)
  if (options.grid !== false) {
    ctx.save()
    ctx.beginPath()
    tracePolygon(ctx, camera, width, height, data.cityFootprint)
    ctx.clip()
    drawGrid(ctx, camera, width, height)
    ctx.restore()
  }
  drawCityGlow(ctx, camera, width, height, data)
  if (options.districts !== false) drawDistricts(ctx, camera, width, height, data, options.selectedDistrict)
  drawRivers(ctx, camera, width, height, data)
  drawParks(ctx, camera, width, height, data)
  drawRoads(ctx, camera, width, height, data, scale)

  if (scale < 0.27) {
    drawBlocks(ctx, camera, width, height, data)
    drawLowZoomRoads(ctx, camera, width, height, data)
    if (options.districts !== false) drawDistrictOutlines(ctx, camera, width, height, data, options.selectedDistrict)
  } else {
    drawBlockGround(ctx, camera, width, height, data)
    drawBuildings(ctx, camera, width, height, data, scale, options.hoveredBuilding)
  }

  drawRamps(ctx, camera, width, height, data, scale)
  drawExpressways(ctx, camera, width, height, data, scale)
  drawBridges(ctx, camera, width, height, data, scale)
  drawInterchanges(ctx, camera, width, height, data, scale)
  if (options.traffic !== false) drawTraffic(ctx, camera, width, height, data, scale, time)
  drawStreetLights(ctx, camera, width, height, data, scale)
  drawLandmarks(ctx, camera, width, height, data, scale)
  if (options.pois !== false) drawPois(ctx, camera, width, height, data, scale, options.selectedPoi)
  if (options.districts !== false) drawDistrictLabels(ctx, camera, width, height, data, options.selectedDistrict)
  drawScaleBar(ctx, camera, width, height, options.scaleRight ?? 36)
}

export function drawMinimap(ctx, data, camera, width, height, mainWidth, mainHeight) {
  const padding = 9
  const scale = Math.min((width - padding * 2) / WORLD.width, (height - padding * 2) / WORLD.height)
  const offsetX = (width - WORLD.width * scale) / 2
  const offsetY = (height - WORLD.height * scale) / 2
  const tx = (x) => offsetX + (x - WORLD.minX) * scale
  const ty = (y) => offsetY + (y - WORLD.minY) * scale

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(3, 8, 10, 0.94)'
  ctx.fillRect(0, 0, width, height)

  ctx.beginPath()
  const footprint = data.cityFootprint || []
  footprint.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(tx(x), ty(y))
    else ctx.lineTo(tx(x), ty(y))
  })
  ctx.closePath()
  ctx.fillStyle = '#0a1215'
  ctx.fill()
  ctx.strokeStyle = 'rgba(74, 190, 205, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (const river of data.rivers || []) {
    ctx.beginPath()
    river.poly.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(tx(x), ty(y))
      else ctx.lineTo(tx(x), ty(y))
    })
    ctx.closePath()
    ctx.fillStyle = '#04131b'
    ctx.fill()
    ctx.strokeStyle = 'rgba(74, 190, 205, 0.3)'
    ctx.lineWidth = 0.7
    ctx.stroke()
  }

  for (const district of data.districts) {
    ctx.beginPath()
    district.poly.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(tx(x), ty(y))
      else ctx.lineTo(tx(x), ty(y))
    })
    ctx.closePath()
    ctx.fillStyle = rgba(district.color, 0.16)
    ctx.fill()
    ctx.strokeStyle = rgba(district.color, 0.42)
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(255, 180, 84, 0.45)'
  ctx.lineWidth = 1
  for (const highway of data.highways) {
    ctx.beginPath()
    highway.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(tx(x), ty(y))
      else ctx.lineTo(tx(x), ty(y))
    })
    ctx.stroke()
  }

  const bounds = cameraBounds(camera, mainWidth, mainHeight)
  ctx.strokeStyle = 'rgba(211, 244, 247, 0.92)'
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(83, 224, 208, 0.08)'
  const vx = tx(bounds.minX)
  const vy = ty(bounds.minY)
  const vw = (bounds.maxX - bounds.minX) * scale
  const vh = (bounds.maxY - bounds.minY) * scale
  ctx.fillRect(vx, vy, vw, vh)
  ctx.strokeRect(vx, vy, vw, vh)

  ctx.strokeStyle = 'rgba(83, 224, 208, 0.24)'
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
}

export function minimapToWorld(clickX, clickY, width, height) {
  const padding = 9
  const scale = Math.min((width - padding * 2) / WORLD.width, (height - padding * 2) / WORLD.height)
  const offsetX = (width - WORLD.width * scale) / 2
  const offsetY = (height - WORLD.height * scale) / 2
  return {
    x: WORLD.minX + (clickX - offsetX) / scale,
    y: WORLD.minY + (clickY - offsetY) / scale,
  }
}

export { POI_COLORS }
