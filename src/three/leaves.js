import * as THREE from "three"

const colorLit  = new THREE.Color("#8fcc44")
const colorMid  = new THREE.Color("#3a7d1e")
const colorDark = new THREE.Color("#1a3d0a")

function gradientColor(t, out) {
	if (t < 0.5) out.copy(colorDark).lerp(colorMid, t * 2)
	else out.copy(colorMid).lerp(colorLit, (t - 0.5) * 2)
	return out
}

export function buildLeaves({ clusters, treePositions, leavesPerTree, camera, lightDir, material }) {
	const treeCount = treePositions.length
	const totalLeaves = treeCount * leavesPerTree
	const leafGeo = new THREE.PlaneGeometry(0.55, 0.55)
	const leaves = new THREE.InstancedMesh(leafGeo, material, totalLeaves)

	const tmpColor = new THREE.Color()
	const leafPos  = new THREE.Vector3()
	const dummy    = new THREE.Object3D()

	// Pondération des clusters par surface (r²)
	const totalWeight = clusters.reduce((s, c) => s + c.r * c.r, 0)
	clusters.forEach((c) => {
		c.count = Math.round((leavesPerTree * c.r * c.r) / totalWeight)
	})

	const sharedDummy = new THREE.Object3D()
	sharedDummy.position.set(0, 0, 0)
	sharedDummy.lookAt(camera.position)
	const sharedQuaternion = sharedDummy.quaternion.clone()

	let leafIdx = 0
	for (let ti = 0; ti < treeCount; ti++) {
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

	return leaves
}
