import fs from 'node:fs'
import path from 'node:path'
const raw=(n)=>JSON.parse(fs.readFileSync(path.join('tools/raw-all',n),'utf8'))
const LAT0=40.705, LON0=-73.98
const MX=111320*Math.cos(LAT0*Math.PI/180), MY=110540
const proj=([lon,lat])=>[(lon-LON0)*MX,-(lat-LAT0)*MY]
const x=(lon)=>(lon-LON0)*MX, y=(lat)=>-(lat-LAT0)*MY
function rdp(points,tol){if(points.length<3)return points.slice();let maxD=0,idx=0;const [x1,y1]=points[0],[x2,y2]=points[points.length-1];const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;for(let i=1;i<points.length-1;i++){const [px,py]=points[i];let t=len2?((px-x1)*dx+(py-y1)*dy)/len2:0;t=Math.max(0,Math.min(1,t));const d=Math.hypot(px-(x1+t*dx),py-(y1+t*dy));if(d>maxD){maxD=d;idx=i}}if(maxD>tol){const a=rdp(points.slice(0,idx+1),tol),b=rdp(points.slice(idx),tol);return a.slice(0,-1).concat(b)}return [points[0],points[points.length-1]]}
function area(ring){let s=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)s+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return Math.abs(s)/2}
function centroid(ring){let x=0,y=0,a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=f;x+=(ring[j][0]+ring[i][0])*f;y+=(ring[j][1]+ring[i][1])*f}if(Math.abs(a)<1e-9)return ring[0];return [x/(3*a),y/(3*a)]}
function outerRings(g){if(g.type==='Polygon')return [g.coordinates[0]];if(g.type==='MultiPolygon')return g.coordinates.map(p=>p[0]);return []}
function inRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const it=(yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi;if(it)inside=!inside}return inside}
function clipPoly(poly,rect){const {minX,minY,maxX,maxY}=rect;const edges=[p=>p[0]>=minX,p=>p[0]<=maxX,p=>p[1]>=minY,p=>p[1]<=maxY];const inter=(a,b,e)=>{const [ax,ay]=a,[bx,by]=b;if(e===0){const t=(minX-ax)/(bx-ax);return [minX,ay+(by-ay)*t]}if(e===1){const t=(maxX-ax)/(bx-ax);return [maxX,ay+(by-ay)*t]}if(e===2){const t=(minY-ay)/(by-ay);return [ax+(bx-ax)*t,minY]}const t=(maxY-ay)/(by-ay);return [ax+(bx-ax)*t,maxY]};let out=poly;for(let e=0;e<4;e++){const input=out;out=[];for(let i=0;i<input.length;i++){const cur=input[i],prev=input[(i+input.length-1)%input.length];const ci=edges[e](cur),pi=edges[e](prev);if(ci){if(!pi)out.push(inter(prev,cur,e));out.push(cur)}else if(pi)out.push(inter(prev,cur,e))}if(!out.length)break}return out}
const landFeats=raw('land.geojson').features
const areas=[]; const mains={}
for(const f of landFeats){const boro=f.properties.BoroName;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.2)}).filter(r=>r.length>3&&area(r)>20000)
 for(let i=0;i<rings.length;i++)areas.push({id:`${boro}-${i}`,name:boro,boro,poly:rings[i].map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)])})
 rings.sort((a,b)=>area(b)-area(a)); if(rings[0])mains[boro]=rings[0]
}
const all=areas.flatMap(a=>a.poly);const box=all.reduce((o,[a,b])=>({minX:Math.min(o.minX,a),maxX:Math.max(o.maxX,a),minY:Math.min(o.minY,b),maxY:Math.max(o.maxY,b)}),{minX:1e9,maxX:-1e9,minY:1e9,maxY:-1e9});const margin=900
const WORLD={minX:Math.floor(box.minX-margin),minY:Math.floor(box.minY-margin),maxX:Math.ceil(box.maxX+margin),maxY:Math.ceil(box.maxY+margin)};WORLD.width=WORLD.maxX-WORLD.minX;WORLD.height=WORLD.maxY-WORLD.minY;WORLD.areaKm2=+(areas.reduce((s,a)=>s+area(a.poly),0)/1e6).toFixed(2)
WORLD.lon0=LON0;WORLD.lat0=LAT0;WORLD.mx=MX;WORLD.my=MY
const districtDefs=[
 {id:'manhattan',name:'曼哈顿',en:'MANHATTAN',color:'#53e0d0',poly:mains['Manhattan'],population:1620000,economy:96,security:82,unrest:15,control:68,threat:22,tax:20,faction:'helios',type:'五区核心',description:'纽约的金融、媒体与权力中心。摩天楼、旧公寓和全球资本在这里叠在同一张街道网上。',detail:'从华尔街到中央公园，曼哈顿的街道名和建筑轮廓都来自 NYC Open Data。'},
 {id:'brooklyn',name:'布鲁克林',en:'BROOKLYN',color:'#ff4fa3',poly:mains['Brooklyn'],population:2600000,economy:74,security:58,unrest:24,control:52,threat:32,tax:16,faction:'nightingale',type:'文化 / 居住区',description:'纽约人口最多的区。褐石住宅、滨水仓库、创意产业和密集的社区网络并存。',detail:'从布鲁克林大桥到展望公园，真实街区沿着东河展开。'},
 {id:'queens',name:'皇后区',en:'QUEENS',color:'#b18cff',poly:mains['Queens'],population:2400000,economy:68,security:55,unrest:26,control:48,threat:30,tax:15,faction:'nomads',type:'多元居住区',description:'纽约面积最大、语言最多的区。机场、铁路、住宅和工业带拼成复杂的城市肌理。',detail:'法拉盛、牙买加湾和肯尼迪机场构成皇后区的真实边界。'},
 {id:'bronx',name:'布朗克斯',en:'THE BRONX',color:'#ff9f5a',poly:mains['Bronx'],population:1470000,economy:52,security:42,unrest:34,control:38,threat:42,tax:12,faction:'iron',type:'工业 / 居住区',description:'纽约大陆上的北区。铁路、仓库、洋基体育场和大片工人住宅沿着哈莱姆河分布。',detail:'南布朗克斯的工业带与社区街区来自真实 NYC 建筑轮廓。'},
 {id:'staten-island',name:'斯塔滕岛',en:'STATEN ISLAND',color:'#ffd36a',poly:mains['Staten Island'],population:500000,economy:48,security:62,unrest:18,control:44,threat:20,tax:14,faction:'tide',type:'岛屿 / 港区',description:'纽约最南端的岛区。渡轮、港口、低密度住宅和林地构成与曼哈顿完全不同的城市节奏。',detail:'斯塔滕岛渡轮与 Snug Harbor 是岛区的真实地标。'},
]
const centers={manhattan:[-422,-5527],brooklyn:[2532,6080],queens:[12658,-1658],bronx:[8439,-14923],'staten-island':[-14346,13818]}
const districts=districtDefs.map(d=>({...d,realName:d.name,centroid:centers[d.id]}))
function districtAt(px,py){return districts.find(d=>inRing(px,py,d.poly))?.id||'manhattan'}
// NTA communities
const communities=[]
for(const f of raw('nta.geojson').features){const p=f.properties;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.4)}).filter(r=>r.length>3&&area(r)>10000);if(!rings.length)continue;rings.sort((a,b)=>area(b)-area(a));const ring=rings[0];const c=centroid(ring);communities.push({id:'nta-'+p.OBJECTID,name:p.NTAName||p.NTACode,code:p.NTACode,boro:p.BoroName,poly:ring.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)]),centroid:[+c[0].toFixed(0),+c[1].toFixed(0)],area:+area(ring).toFixed(0)})}
// roads major
const roads=[]
for(const f of raw('roads.geojson').features){const p=f.properties;let pts=f.geometry.coordinates.map(proj);if(pts.length<2)continue;pts=rdp(pts,1.5);const width=Math.max(6,Math.min(38,(Number(p.StreetWidth)||0)*0.3048||12));roads.push({id:roads.length,name:(p.Street||'').trim(),width:+width.toFixed(1),points:pts.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)])})}
// parks major
const parks=[]
for(const f of raw('parks.geojson').features){const p=f.properties;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.4)}).filter(r=>r.length>3&&area(r)>12000);if(!rings.length)continue;rings.sort((a,b)=>area(b)-area(a));const ring=rings[0];const c=centroid(ring);parks.push({id:'park-'+p.OBJECTID,name:p.PARK_NAME||'Park',kind:'park',poly:ring.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)]),centroid:[+c[0].toFixed(0),+c[1].toFixed(0)],water:null,paths:[],area:+area(ring).toFixed(0)})}
// POIs
const poiDefs=[
 ['empire-state','帝国大厦','EMPIRE STATE',40.7484,-73.9857,'tower',381],
 ['times-square','时报广场','TIMES SQUARE',40.7580,-73.9855,'civic',20],
 ['one-world','世界贸易中心','ONE WTC',40.7127,-74.0134,'tower',541],
 ['central-park','中央公园','CENTRAL PARK',40.7829,-73.9654,'park',30],
 ['grand-central','中央车站','GRAND CENTRAL',40.7527,-73.9772,'civic',40],
 ['brooklyn-bridge','布鲁克林大桥','BROOKLYN BRIDGE',40.7061,-73.9969,'civic',84],
 ['prospect-park','展望公园','PROSPECT PARK',40.6602,-73.9690,'park',20],
 ['barclays','巴克莱中心','BARCLAYS CENTER',40.6826,-73.9754,'civic',40],
 ['coney-island','康尼岛','CONEY ISLAND',40.5749,-73.9856,'park',10],
 ['flushing-meadows','法拉盛草原','FLUSHING MEADOWS',40.7397,-73.8406,'park',20],
 ['citi-field','花旗球场','CITI FIELD',40.7571,-73.8458,'civic',30],
 ['yankee-stadium','洋基体育场','YANKEE STADIUM',40.8296,-73.9262,'civic',40],
 ['bronx-zoo','布朗克斯动物园','BRONX ZOO',40.8506,-73.8770,'park',15],
 ['staten-ferry','斯塔滕岛渡轮','STATEN ISLAND FERRY',40.6437,-74.0736,'harbor',15],
 ['snug-harbor','斯纳格港','SNUG HARBOR',40.6430,-74.1020,'park',15],
]
const pois=poiDefs.map(([id,name,en,lat,lon,type,height])=>{const px=x(lon),py=y(lat);return{id,name,en,district:districtAt(px,py),x:+px.toFixed(0),y:+py.toFixed(0),height,type,status:'开放',description:'真实纽约地标。'}})
const map={WORLD,CITY_AREAS:areas,DISTRICTS:districts,COMMUNITIES:communities,PARKS:parks,ROADS:roads,POIS:pois,TOTAL_BUILDINGS:1082349}
fs.writeFileSync('src/data/nyc-map.json',JSON.stringify(map))
console.log('areas',areas.length,'districts',districts.length,'communities',communities.length,'roads',roads.length,'parks',parks.length,'size MB',(fs.statSync('src/data/nyc-map.json').size/1048576).toFixed(2))
