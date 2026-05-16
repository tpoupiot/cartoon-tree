import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

const TRUNK_HEIGHT = 2.4

// Segment de branche droit entre deux points
function makeBranchGeo(from, to, rTop, rBot) {
	const d = new THREE.Vector3().subVectors(to, from)
	const len = d.length()
	const geo = new THREE.CylinderGeometry(rTop, rBot, len, 6, 5)
	const bp = geo.attributes.position
	for (let i = 0; i < bp.count; i++) {
		const bx = bp.getX(i), by = bp.getY(i), bz = bp.getZ(i)
		const n = (Math.sin(by * 11.3 + bx * 5.1) + Math.cos(bz * 7.2 + by * 3.4)) * 0.009
		bp.setX(i, bx + n)
		bp.setZ(i, bz + n * 0.8)
	}
	geo.computeVertexNormals()
	geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, len / 2, 0))
	const up = new THREE.Vector3(0, 1, 0)
	const dirN = d.clone().normalize()
	const axis = new THREE.Vector3().crossVectors(up, dirN)
	if (axis.lengthSq() > 1e-6) {
		geo.applyMatrix4(new THREE.Matrix4().makeRotationAxis(axis.normalize(), up.angleTo(dirN)))
	}
	geo.applyMatrix4(new THREE.Matrix4().makeTranslation(from.x, from.y, from.z))
	return geo
}

// Branche courbée : retourne les points réels de la polyligne
function makeCurvedBranch(from, to, rTop, rBot, geos, jitter) {
	const segs = 4
	const pts = [from.clone()]
	for (let s = 1; s < segs; s++) {
		const t = s / segs
		const bend = Math.sin(t * Math.PI)
		const p = from.clone().lerp(to, t)
		p.x += (Math.random() - 0.5) * jitter * bend
		p.y += (Math.random() - 0.5) * jitter * bend * 0.35
		p.z += (Math.random() - 0.5) * jitter * bend
		pts.push(p)
	}
	pts.push(to.clone())
	for (let s = 0; s < pts.length - 1; s++) {
		const t0 = s / (pts.length - 1)
		const t1 = (s + 1) / (pts.length - 1)
		const r0 = rBot + (rTop - rBot) * t0
		const r1 = rBot + (rTop - rBot) * t1
		geos.push(makeBranchGeo(pts[s], pts[s + 1], r1, r0))
	}
	return pts
}

function pathPoint(pts, t) {
	const n = pts.length - 1
	const s = Math.min(t * n, n - 1e-6)
	const i = Math.floor(s)
	return pts[i].clone().lerp(pts[i + 1], s - i)
}

function pathTangent(pts, t) {
	const n = pts.length - 1
	const i = Math.min(Math.floor(t * n), n - 1)
	return pts[i + 1].clone().sub(pts[i]).normalize()
}

function growBranch(from, dir, length, radius, depth, maxDepth, geos, leafClusters) {
	const jitter = [0.22, 0.14, 0.07][depth] ?? 0.05
	const to = from.clone().addScaledVector(dir, length)
	const pts = makeCurvedBranch(from, to, radius * 0.6, radius, geos, jitter)

	if (depth >= maxDepth) {
		const tip = pts[pts.length - 1]
		leafClusters.push({ cx: tip.x, cy: tip.y, cz: tip.z, r: 0.38 + radius * 11 })
		return
	}

	const numKids = depth === 0 ? 2 + Math.floor(Math.random() * 2) : 2

	for (let k = 0; k < numKids; k++) {
		const splitT    = 0.45 + Math.random() * 0.40
		const splitFrom = pathPoint(pts, splitT)
		const localDir  = pathTangent(pts, splitT)

		const worldRef = Math.abs(localDir.y) < 0.9
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0)
		const right = new THREE.Vector3().crossVectors(localDir, worldRef).normalize()
		const fwd   = new THREE.Vector3().crossVectors(right, localDir).normalize()

		const az     = (k / numKids) * Math.PI * 2 + (Math.random() - 0.5) * 2.0
		const spread = 0.50 + Math.random() * 0.72

		const perpDir = right.clone()
			.multiplyScalar(Math.cos(az))
			.addScaledVector(fwd, Math.sin(az))

		const childDir = localDir.clone()
			.multiplyScalar(Math.cos(spread))
			.addScaledVector(perpDir, Math.sin(spread))

		childDir.y = Math.max(childDir.y, -0.12)
		childDir.normalize()

		const childLen = length * (0.48 + Math.random() * 0.32)
		growBranch(splitFrom, childDir, childLen, radius * 0.63, depth + 1, maxDepth, geos, leafClusters)
	}
}

// Décalage de la courbe du tronc à hauteur y
function trunkOffset(worldY) {
	const t = worldY / TRUNK_HEIGHT
	return [t * t * 0.18, -t * t * 0.10]
}

function makeTrunkGeo() {
	const trunkGeo = new THREE.CylinderGeometry(0.05, 0.15, TRUNK_HEIGHT, 7, 8)
	const tpos = trunkGeo.attributes.position
	for (let i = 0; i < tpos.count; i++) {
		const x = tpos.getX(i)
		const y = tpos.getY(i)
		const z = tpos.getZ(i)
		const t = (y + TRUNK_HEIGHT / 2) / TRUNK_HEIGHT
		const curveX =  t * t * 0.18
		const curveZ = -t * t * 0.10
		const noise = (Math.sin(y * 6.1 + x * 3.2) + Math.cos(z * 4.8 + y * 2.3)) * 0.022
		tpos.setX(i, x + curveX + noise)
		tpos.setZ(i, z + curveZ + noise * 0.7)
	}
	trunkGeo.computeVertexNormals()
	trunkGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, TRUNK_HEIGHT / 2, 0))
	return trunkGeo
}

// 4 branches primaires à des hauteurs et angles variés
const PRIMARY_DEFS = [
	{ ht: 2.30, az: 0.35, sp: 0.62, len: 0.95, r: 0.055 },
	{ ht: 2.10, az: 2.85, sp: 0.78, len: 0.88, r: 0.052 },
	{ ht: 1.85, az: 4.70, sp: 0.92, len: 0.82, r: 0.048 },
	{ ht: 1.55, az: 1.60, sp: 1.05, len: 0.76, r: 0.044 },
]

export function buildTrunkAndBranches() {
	const trunkGeo = makeTrunkGeo()
	const branchGeos = []
	const clusters = []

	const trunkDirUp = new THREE.Vector3(0, 1, 0)

	for (const pb of PRIMARY_DEFS) {
		const [ox, oz] = trunkOffset(pb.ht)
		const from = new THREE.Vector3(ox, pb.ht, oz)

		const perpH = new THREE.Vector3(Math.cos(pb.az), 0, Math.sin(pb.az))
		const branchDir = trunkDirUp.clone()
			.multiplyScalar(Math.cos(pb.sp))
			.addScaledVector(perpH, Math.sin(pb.sp))
		branchDir.normalize()

		growBranch(from, branchDir, pb.len, pb.r, 0, 2, branchGeos, clusters)
	}

	const mergedGeo = mergeGeometries([trunkGeo, ...branchGeos])
	branchGeos.forEach((g) => g.dispose())

	return { mergedGeo, clusters }
}
