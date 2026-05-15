import { useRef, useEffect } from "react"
import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

const TREE_COUNT = 1
const LEAVES_PER_TREE = 700
const TOTAL_LEAVES = TREE_COUNT * LEAVES_PER_TREE

export default function CartoonTree() {
	const mountRef = useRef(null)

	useEffect(() => {
		const mount = mountRef.current
		const width = mount.clientWidth
		const height = mount.clientHeight

		// --- Scene / Camera / Renderer ---
		const scene = new THREE.Scene()
		scene.background = new THREE.Color(0xf4a261)

		const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300)
		camera.position.set(6, 5, 9)
		camera.lookAt(0, 3.5, 0)

		const renderer = new THREE.WebGLRenderer({ antialias: false })
		renderer.setSize(width, height)
		renderer.setPixelRatio(window.devicePixelRatio)
		mount.appendChild(renderer.domElement)

		// --- Lumières ---
		scene.add(new THREE.AmbientLight(0xffffff, 0.85))
		const dir = new THREE.DirectionalLight(0xffd9a0, 0.7)
		dir.position.set(5, 10, 5)
		scene.add(dir)
		const lightDir = new THREE.Vector3().copy(dir.position).normalize()

		// --- Sol ---
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(80, 80),
			new THREE.MeshLambertMaterial({ color: 0xc97a3f }),
		)
		ground.rotation.x = -Math.PI / 2
		scene.add(ground)

		// --- Positions des arbres ---
		const treePositions = Array.from({ length: TREE_COUNT }, () => new THREE.Vector3(0, 0, 0))

		// --- Segment de branche droit entre deux points ---
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

		// Branche courbée : retourne les points réels de la polyligne (utilisés pour ancrer les enfants)
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

		// Position interpolée sur une polyligne à t ∈ [0,1]
		function pathPoint(pts, t) {
			const n = pts.length - 1
			const s = Math.min(t * n, n - 1e-6)
			const i = Math.floor(s)
			return pts[i].clone().lerp(pts[i + 1], s - i)
		}

		// Tangente locale sur la polyligne à t ∈ [0,1]
		function pathTangent(pts, t) {
			const n = pts.length - 1
			const i = Math.min(Math.floor(t * n), n - 1)
			return pts[i + 1].clone().sub(pts[i]).normalize()
		}

		// Croissance récursive de branches
		function growBranch(from, dir, length, radius, depth, maxDepth, geos, leafClusters) {
			const jitter = [0.22, 0.14, 0.07][depth] ?? 0.05
			const to = from.clone().addScaledVector(dir, length)
			// pts = points réels de la courbe (géométrie = ce qu'on voit)
			const pts = makeCurvedBranch(from, to, radius * 0.6, radius, geos, jitter)

			if (depth >= maxDepth) {
				const tip = pts[pts.length - 1]
				leafClusters.push({ cx: tip.x, cy: tip.y, cz: tip.z, r: 0.38 + radius * 11 })
				return
			}

			const numKids = depth === 0 ? 2 + Math.floor(Math.random() * 2) : 2

			for (let k = 0; k < numKids; k++) {
				// Point de bifurcation ancré sur la courbe réelle (plus de gap)
				const splitT    = 0.45 + Math.random() * 0.40
				const splitFrom = pathPoint(pts, splitT)
				// Tangente locale = direction héritée par l'enfant
				const localDir  = pathTangent(pts, splitT)

				// Repère orthonormal basé sur la tangente réelle
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
			const t = worldY / 2.4
			return [t * t * 0.18, -t * t * 0.10]
		}

		// --- Tronc ---
		const trunkHeight = 2.4
		const trunkGeo = new THREE.CylinderGeometry(0.05, 0.15, trunkHeight, 7, 8)
		const tpos = trunkGeo.attributes.position
		for (let i = 0; i < tpos.count; i++) {
			const x = tpos.getX(i)
			const y = tpos.getY(i)
			const z = tpos.getZ(i)
			const t = (y + trunkHeight / 2) / trunkHeight
			const curveX =  t * t * 0.18
			const curveZ = -t * t * 0.10
			const noise = (Math.sin(y * 6.1 + x * 3.2) + Math.cos(z * 4.8 + y * 2.3)) * 0.022
			tpos.setX(i, x + curveX + noise)
			tpos.setZ(i, z + curveZ + noise * 0.7)
		}
		trunkGeo.computeVertexNormals()
		trunkGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, trunkHeight / 2, 0))

		// --- Génération des branches récursives ---
		const allBranchGeos = []
		const clusters = []

		// 4 branches primaires à des hauteurs et angles variés
		const primaryDefs = [
			{ ht: 2.30, az: 0.35, sp: 0.62, len: 0.95, r: 0.055 },
			{ ht: 2.10, az: 2.85, sp: 0.78, len: 0.88, r: 0.052 },
			{ ht: 1.85, az: 4.70, sp: 0.92, len: 0.82, r: 0.048 },
			{ ht: 1.55, az: 1.60, sp: 1.05, len: 0.76, r: 0.044 },
		]

		const trunkDirUp = new THREE.Vector3(0, 1, 0)

		for (const pb of primaryDefs) {
			const [ox, oz] = trunkOffset(pb.ht)
			const from = new THREE.Vector3(ox, pb.ht, oz)

			// Direction de la branche : mix entre vertical et horizontal
			const perpH = new THREE.Vector3(Math.cos(pb.az), 0, Math.sin(pb.az))
			const branchDir = trunkDirUp.clone()
				.multiplyScalar(Math.cos(pb.sp))
				.addScaledVector(perpH, Math.sin(pb.sp))
			branchDir.normalize()

			growBranch(from, branchDir, pb.len, pb.r, 0, 2, allBranchGeos, clusters)
		}

		const mergedTrunkGeo = mergeGeometries([trunkGeo, ...allBranchGeos])
		allBranchGeos.forEach((g) => g.dispose())

		const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3520, flatShading: true })
		const trunkInstances = new THREE.InstancedMesh(mergedTrunkGeo, trunkMat, TREE_COUNT)

		const dummy = new THREE.Object3D()
		for (let i = 0; i < TREE_COUNT; i++) {
			dummy.position.copy(treePositions[i])
			dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
			dummy.scale.setScalar(1)
			dummy.updateMatrix()
			trunkInstances.setMatrixAt(i, dummy.matrix)
		}
		trunkInstances.instanceMatrix.needsUpdate = true
		const treeGroup = new THREE.Group()
		scene.add(treeGroup)
		treeGroup.add(trunkInstances)

		// --- Texture des feuilles ---
		function makeFallbackTexture() {
			const size = 128
			const canvas = document.createElement("canvas")
			canvas.width = size
			canvas.height = size
			const ctx = canvas.getContext("2d")
			ctx.translate(size / 2, size / 2)
			ctx.fillStyle = "#ffffff"
			ctx.beginPath()
			ctx.moveTo(0, -52)
			ctx.quadraticCurveTo(44, -16, 24, 40)
			ctx.quadraticCurveTo(0, 52, -24, 40)
			ctx.quadraticCurveTo(-44, -16, 0, -52)
			ctx.fill()
			const tex = new THREE.CanvasTexture(canvas)
			tex.colorSpace = THREE.SRGBColorSpace
			return tex
		}

		const textureLoader = new THREE.TextureLoader()
		const leafTex = textureLoader.load(
			"/feuille.png",
			(tex) => {
				tex.colorSpace = THREE.SRGBColorSpace
				tex.minFilter = THREE.LinearMipmapLinearFilter
				tex.magFilter = THREE.LinearFilter
				tex.generateMipmaps = true
				tex.needsUpdate = true
			},
			undefined,
			() => {
				leafMat.map = makeFallbackTexture()
				leafMat.needsUpdate = true
			},
		)

		const leafGeo = new THREE.PlaneGeometry(0.55, 0.55)
		const leafMat = new THREE.MeshBasicMaterial({
			map: leafTex,
			transparent: true,
			alphaTest: 1,
			side: THREE.DoubleSide,
		})

		// Shader de vent
		let windUniforms = null
		leafMat.onBeforeCompile = (shader) => {
			shader.uniforms.uTime = { value: 0 }
			windUniforms = shader.uniforms

			shader.vertexShader = shader.vertexShader.replace(
				"#include <common>",
				`#include <common>
				uniform float uTime;`,
			)
			shader.vertexShader = shader.vertexShader.replace(
				"#include <project_vertex>",
				`#include <project_vertex>
				// Position monde du vertex (espace monde, pas vue)
				vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);

				float seed   = float(gl_InstanceID) * 0.6180339887;
				float rPhase = fract(seed)           * 6.2831853;
				float rAmp   = 0.8 + fract(seed * 5.1) * 0.6;
				float rFreq  = 0.7 + fract(seed * 3.3) * 0.8;

				// Direction du vent qui oscille lentement (pas de rotation complète, juste un balancement)
				float windAngle = sin(uTime * 0.06) * 0.6;
				vec2  windDir   = vec2(cos(windAngle), sin(windAngle));

				// Propagation spatiale (vague de vent traversant le feuillage)
				float spatial = worldPos.x * 0.30 + worldPos.z * 0.20;

				// Balancement principal lent
				float sway    = sin(uTime * 0.55 * rFreq + spatial + rPhase) * 0.04 * rAmp;

				// Frémissement rapide individuel
				float flutter = sin(uTime * 3.5 + rPhase * 5.1 + spatial * 2.0) * 0.008;

				// Rafale ponctuelle et brève (puissance 6 = très ciblée)
				float gust    = pow(max(0.0, sin(uTime * 0.13 + spatial * 0.4 + rPhase * 0.2)), 6.0) * 0.035;

				float horizMove = sway + flutter + gust;

				// Frémissement vertical léger
				float flutY = sin(uTime * 4.2 + rPhase * 3.1 + spatial) * 0.004;

				worldPos.x += windDir.x * horizMove;
				worldPos.z += windDir.y * horizMove;
				worldPos.y += flutY;

				gl_Position = projectionMatrix * viewMatrix * worldPos;`,
			)
		}

		const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TOTAL_LEAVES)

		const colorLit  = new THREE.Color("#8fcc44")
		const colorMid  = new THREE.Color("#3a7d1e")
		const colorDark = new THREE.Color("#1a3d0a")
		const tmpColor  = new THREE.Color()
		const leafPos   = new THREE.Vector3()

		// Pondération des clusters par surface (r²)
		const totalWeight = clusters.reduce((s, c) => s + c.r * c.r, 0)
		clusters.forEach((c) => {
			c.count = Math.round((LEAVES_PER_TREE * c.r * c.r) / totalWeight)
		})

		function gradientColor(t, out) {
			if (t < 0.5) out.copy(colorDark).lerp(colorMid, t * 2)
			else out.copy(colorMid).lerp(colorLit, (t - 0.5) * 2)
			return out
		}

		const sharedDummy = new THREE.Object3D()
		sharedDummy.position.set(0, 0, 0)
		sharedDummy.lookAt(camera.position)
		const sharedQuaternion = sharedDummy.quaternion.clone()

		let leafIdx = 0
		for (let ti = 0; ti < TREE_COUNT; ti++) {
			const treePos = treePositions[ti]

			for (const cluster of clusters) {
				const worldCenter = new THREE.Vector3(
					treePos.x + cluster.cx,
					treePos.y + cluster.cy,
					treePos.z + cluster.cz,
				)
				const r = cluster.r

				for (let i = 0; i < cluster.count; i++) {
					let x, y, z, d
					do {
						x = Math.random() * 2 - 1
						y = Math.random() * 2 - 1
						z = Math.random() * 2 - 1
						d = x * x + y * y + z * z
					} while (d > 1)

					const radiusBias = 0.2 + Math.random() * 0.65
					const norm = Math.sqrt(d) || 0.001
					const nx = (x / norm) * radiusBias + (Math.random() - 0.5) * 0.1
					const ny = (y / norm) * radiusBias + (Math.random() - 0.5) * 0.1
					const nz = (z / norm) * radiusBias + (Math.random() - 0.5) * 0.1

					leafPos.set(
						worldCenter.x + nx * r,
						worldCenter.y + ny * r,
						worldCenter.z + nz * r,
					)

					// Masquer les feuilles trop proches du sol
					if (leafPos.y < 1.5) {
						dummy.position.set(0, -999, 0)
						dummy.scale.setScalar(0.001)
						dummy.updateMatrix()
						leaves.setMatrixAt(leafIdx, dummy.matrix)
						leafIdx++
						continue
					}

					dummy.position.copy(leafPos)
					dummy.quaternion.copy(sharedQuaternion)

					const closeness = 1 - Math.min(1, Math.sqrt(nx * nx + ny * ny + nz * nz))
					const sc = 0.5 + 0.9 * closeness + (Math.random() - 0.5) * 0.2
					dummy.scale.setScalar(Math.max(0.3, sc))
					dummy.updateMatrix()
					leaves.setMatrixAt(leafIdx, dummy.matrix)

					const dot = leafPos.clone().sub(worldCenter).normalize().dot(lightDir)
					let t = Math.pow((dot + 1) * 0.5, 1.3) + (Math.random() - 0.5) * 0.12
					t = Math.max(0, Math.min(1, t))
					gradientColor(t, tmpColor)
					leaves.setColorAt(leafIdx, tmpColor)

					leafIdx++
				}
			}
		}

		leaves.instanceMatrix.needsUpdate = true
		if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true
		treeGroup.add(leaves)

		// --- Caméra libre ---
		const controls = new OrbitControls(camera, renderer.domElement)
		controls.target.set(0, 3.5, 0)
		controls.enableDamping = true
		controls.dampingFactor = 0.08
		controls.update()

		// --- Boucle d'animation ---
		const clock = new THREE.Clock()
		let frameId
		const animate = () => {
			controls.update()
			const t = clock.getElapsedTime()
			if (windUniforms) windUniforms.uTime.value = t
renderer.render(scene, camera)
			frameId = requestAnimationFrame(animate)
		}
		animate()

		// --- Resize ---
		const handleResize = () => {
			const w = mount.clientWidth
			const h = mount.clientHeight
			camera.aspect = w / h
			camera.updateProjectionMatrix()
			renderer.setSize(w, h)
		}
		window.addEventListener("resize", handleResize)

		return () => {
			cancelAnimationFrame(frameId)
			controls.dispose()
			window.removeEventListener("resize", handleResize)
			mount.removeChild(renderer.domElement)
			mergedTrunkGeo.dispose()
			trunkMat.dispose()
			leafGeo.dispose()
			leafMat.dispose()
			leafTex.dispose()
			renderer.dispose()
		}
	}, [])

	return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
}
