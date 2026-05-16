import { useRef, useEffect } from "react"
import * as THREE from "three"
import { WebGPURenderer } from "three/webgpu"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { buildTrunkAndBranches } from "./three/branches.js"
import { loadLeafTexture } from "./three/textures.js"
import { createLeafMaterial } from "./three/leafMaterial.js"
import { buildLeaves } from "./three/leaves.js"

const TREE_COUNT = 1
const LEAVES_PER_TREE = 700

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

		const renderer = new WebGPURenderer({ antialias: false })
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

		// --- Tronc + branches ---
		const { mergedGeo: mergedTrunkGeo, clusters } = buildTrunkAndBranches()
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

		// --- Feuilles ---
		const leafTex = loadLeafTexture((fallbackTex) => {
			leafMat.map = fallbackTex
			leafMat.needsUpdate = true
		})
		const { material: leafMat, uTime } = createLeafMaterial(leafTex)
		const leaves = buildLeaves({
			clusters,
			treePositions,
			leavesPerTree: LEAVES_PER_TREE,
			camera,
			lightDir,
			material: leafMat,
		})
		treeGroup.add(leaves)

		// --- Caméra libre ---
		const controls = new OrbitControls(camera, renderer.domElement)
		controls.target.set(0, 3.5, 0)
		controls.enableDamping = true
		controls.dampingFactor = 0.08
		controls.update()

		// --- Resize ---
		const handleResize = () => {
			const w = mount.clientWidth
			const h = mount.clientHeight
			camera.aspect = w / h
			camera.updateProjectionMatrix()
			renderer.setSize(w, h)
		}
		window.addEventListener("resize", handleResize)

		// --- Boucle d'animation (async pour WebGPU) ---
		let disposed = false
		const startTime = performance.now()
		renderer.init().then(() => {
			if (disposed) return
			renderer.setAnimationLoop(() => {
				controls.update()
				uTime.value = (performance.now() - startTime) / 1000
				renderer.render(scene, camera)
			})
		})

		return () => {
			disposed = true
			renderer.setAnimationLoop(null)
			controls.dispose()
			window.removeEventListener("resize", handleResize)
			if (renderer.domElement.parentNode === mount) {
				mount.removeChild(renderer.domElement)
			}
			mergedTrunkGeo.dispose()
			trunkMat.dispose()
			leaves.geometry.dispose()
			leafMat.dispose()
			leafTex.dispose()
			renderer.dispose()
		}
	}, [])

	return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
}
