---

🌳 Créer un CartoonTree avec Three.js

par Bruno Simon

---

Ce qu'on va construire

Un arbre stylisé avec :

- Un tronc courbé bruité
- Des branches récursives qui poussent naturellement
- 700 feuilles en billboard instancié
- Un shader de vent GLSL injecté à la volée
- Des OrbitControls pour tourner autour

---

Étape 1 — Setup du projet

npm create vite@latest cartoon-tree -- --template react
cd cartoon-tree
npm install three

Crée src/CartoonTree.jsx et importe ce qu'il faut :

import { useRef, useEffect } from "react"
import \* as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

▎ mergeGeometries sert à fusionner le tronc + toutes les branches en un seul draw call.

---

Étape 2 — Scène, caméra, renderer

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4a261) // orange chaud

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300)
camera.position.set(6, 5, 9)
camera.lookAt(0, 3.5, 0) // on vise le milieu de l'arbre

const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setSize(width, height)
renderer.setPixelRatio(window.devicePixelRatio)
mount.appendChild(renderer.domElement)

▎ antialias: false c'est voulu — le rendu "facetté" renforce le style cartoon.

---

Étape 3 — Lumières

scene.add(new THREE.AmbientLight(0xffffff, 0.85))

const dir = new THREE.DirectionalLight(0xffd9a0, 0.7) // lumière chaude
dir.position.set(5, 10, 5)
scene.add(dir)

const lightDir = new THREE.Vector3().copy(dir.position).normalize()

On sauvegarde lightDir — on s'en sert plus tard pour colorer les feuilles selon leur exposition.

---

Étape 4 — Le sol

const ground = new THREE.Mesh(
new THREE.PlaneGeometry(80, 80),
new THREE.MeshLambertMaterial({ color: 0xc97a3f })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

Un plan horizontal, couleur terre. Simple, efficace.

---

Étape 5 — Le tronc

La géométrie de base c'est un CylinderGeometry, mais on lui applique deux déformations :

1. Une courbure — le tronc s'incline légèrement en montant (parabole en X et Z)
2. Du bruit — pour casser la symétrie parfaite

const trunkHeight = 2.4
const trunkGeo = new THREE.CylinderGeometry(0.05, 0.15, trunkHeight, 7, 8)
const tpos = trunkGeo.attributes.position

for (let i = 0; i < tpos.count; i++) {
const x = tpos.getX(i)
const y = tpos.getY(i)
const z = tpos.getZ(i)

      // Hauteur normalisée 0→1
      const t = (y + trunkHeight / 2) / trunkHeight

      // Courbure parabolique
      const curveX =  t * t * 0.18
      const curveZ = -t * t * 0.10

      // Bruit procédural (sin + cos croisés)
      const noise = (Math.sin(y * 6.1 + x * 3.2) + Math.cos(z * 4.8 + y * 2.3)) * 0.022

      tpos.setX(i, x + curveX + noise)
      tpos.setZ(i, z + curveZ + noise * 0.7)

}

trunkGeo.computeVertexNormals()
trunkGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, trunkHeight / 2, 0))

▎ computeVertexNormals() après la déformation, sinon l'éclairage sera faux.

---

Étape 6 — Segments de branche

Chaque segment est un cylindre orienté entre deux points. La fonction makeBranchGeo :

1. Crée un cylindre dans l'axe Y
2. Applique du bruit sur les vertices
3. Le fait pivoter vers la direction voulue avec un crossVectors
4. Le translate au point de départ

function makeBranchGeo(from, to, rTop, rBot) {
const d = new THREE.Vector3().subVectors(to, from)
const len = d.length()
const geo = new THREE.CylinderGeometry(rTop, rBot, len, 6, 5)

      // Bruit sur les vertices
      const bp = geo.attributes.position
      for (let i = 0; i < bp.count; i++) {
          const bx = bp.getX(i), by = bp.getY(i), bz = bp.getZ(i)
          const n = (Math.sin(by * 11.3 + bx * 5.1) + Math.cos(bz * 7.2 + by * 3.4)) * 0.009
          bp.setX(i, bx + n)
          bp.setZ(i, bz + n * 0.8)
      }
      geo.computeVertexNormals()

      // Aligner le cylindre de Y vers la direction d
      geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, len / 2, 0))
      const up = new THREE.Vector3(0, 1, 0)
      const dirN = d.clone().normalize()
      const axis = new THREE.Vector3().crossVectors(up, dirN)
      if (axis.lengthSq() > 1e-6) {
          geo.applyMatrix4(
              new THREE.Matrix4().makeRotationAxis(axis.normalize(), up.angleTo(dirN))
          )
      }
      geo.applyMatrix4(new THREE.Matrix4().makeTranslation(from.x, from.y, from.z))
      return geo

}

---

Étape 7 — Branches courbées

Une branche n'est pas droite — c'est une polyligne de 5 points avec des déviations aléatoires au milieu :

function makeCurvedBranch(from, to, rTop, rBot, geos, jitter) {
const segs = 4
const pts = [from.clone()]

      for (let s = 1; s < segs; s++) {
          const t = s / segs
          const bend = Math.sin(t * Math.PI) // max au milieu, 0 aux extrémités
          const p = from.clone().lerp(to, t)
          p.x += (Math.random() - 0.5) * jitter * bend
          p.y += (Math.random() - 0.5) * jitter * bend * 0.35
          p.z += (Math.random() - 0.5) * jitter * bend
          pts.push(p)
      }
      pts.push(to.clone())

      // Un segment par paire de points, rayon interpolé
      for (let s = 0; s < pts.length - 1; s++) {
          const t0 = s / (pts.length - 1)
          const t1 = (s + 1) / (pts.length - 1)
          const r0 = rBot + (rTop - rBot) * t0
          const r1 = rBot + (rTop - rBot) * t1
          geos.push(makeBranchGeo(pts[s], pts[s + 1], r1, r0))
      }
      return pts // les points réels pour ancrer les enfants

}

▎ On retourne pts parce que les branches filles partent de la courbe réelle, pas de la droite idéale. Sinon il y a des gaps.

---

Étape 8 — Croissance récursive

C'est le cœur de l'algo. growBranch s'appelle elle-même jusqu'à maxDepth = 2.

function growBranch(from, dir, length, radius, depth, maxDepth, geos, leafClusters) {
const jitter = [0.22, 0.14, 0.07][depth] ?? 0.05
const to = from.clone().addScaledVector(dir, length)
const pts = makeCurvedBranch(from, to, radius \* 0.6, radius, geos, jitter)

      if (depth >= maxDepth) {
          // Feuille : on enregistre un cluster sphérique au bout
          const tip = pts[pts.length - 1]
          leafClusters.push({ cx: tip.x, cy: tip.y, cz: tip.z, r: 0.38 + radius * 11 })
          return
      }

      const numKids = depth === 0 ? 2 + Math.floor(Math.random() * 2) : 2

      for (let k = 0; k < numKids; k++) {
          // Point de bifurcation sur la courbe (entre 45% et 85%)
          const splitT    = 0.45 + Math.random() * 0.40
          const splitFrom = pathPoint(pts, splitT)
          const localDir  = pathTangent(pts, splitT)

          // Repère orthonormal à la tangente
          const worldRef = Math.abs(localDir.y) < 0.9
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(1, 0, 0)
          const right = new THREE.Vector3().crossVectors(localDir, worldRef).normalize()
          const fwd   = new THREE.Vector3().crossVectors(right, localDir).normalize()

          // Angle azimutal distribué équitablement + random
          const az     = (k / numKids) * Math.PI * 2 + (Math.random() - 0.5) * 2.0
          const spread = 0.50 + Math.random() * 0.72

          const perpDir = right.clone()
              .multiplyScalar(Math.cos(az))
              .addScaledVector(fwd, Math.sin(az))

          const childDir = localDir.clone()
              .multiplyScalar(Math.cos(spread))
              .addScaledVector(perpDir, Math.sin(spread))

          childDir.y = Math.max(childDir.y, -0.12) // pas de branches qui pointent vers le bas
          childDir.normalize()

          const childLen = length * (0.48 + Math.random() * 0.32)
          growBranch(splitFrom, childDir, childLen, radius * 0.63, depth + 1, maxDepth, geos, leafClusters)
      }

}

---

Étape 9 — Feuilles avec InstancedMesh

On utilise InstancedMesh pour rendre 700 feuilles en un seul draw call.

Chaque feuille est un PlaneGeometry orienté vers la caméra (billboard statique).

const leafGeo = new THREE.PlaneGeometry(0.55, 0.55)
const leafMat = new THREE.MeshBasicMaterial({
map: leafTex, // /feuille.png ou texture canvas de fallback
transparent: true,
alphaTest: 1,
side: THREE.DoubleSide,
})

const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TOTAL_LEAVES)

Distribution dans les clusters — on tire au sort dans une sphère :

// Rejet de Monte-Carlo : on reste dans la sphère unitaire
do {
x = Math.random() _ 2 - 1
y = Math.random() _ 2 - 1
z = Math.random() _ 2 - 1
d = x _ x + y _ y + z _ z
} while (d > 1)

// Bias vers la surface (effet volume creux)
const radiusBias = 0.2 + Math.random() \* 0.65

Couleur selon la lumière — gradient dark → mid → lit selon dot(normal, lightDir) :

const dot = leafPos.clone().sub(worldCenter).normalize().dot(lightDir)
let t = Math.pow((dot + 1) _ 0.5, 1.3) + (Math.random() - 0.5) _ 0.12
gradientColor(t, tmpColor)
leaves.setColorAt(leafIdx, tmpColor)

---

Étape 10 — Shader de vent

C'est la partie la plus stylée. On injecte du GLSL dans le shader compilé via onBeforeCompile :

leafMat.onBeforeCompile = (shader) => {
shader.uniforms.uTime = { value: 0 }
windUniforms = shader.uniforms

      // Déclaration de l'uniform
      shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;`
      )

      // Injection après la projection
      shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);

          float seed   = float(gl_InstanceID) * 0.6180339887; // nombre d'or
          float rPhase = fract(seed) * 6.2831853;
          float rAmp   = 0.8 + fract(seed * 5.1) * 0.6;
          float rFreq  = 0.7 + fract(seed * 3.3) * 0.8;

          float windAngle = sin(uTime * 0.06) * 0.6;
          vec2  windDir   = vec2(cos(windAngle), sin(windAngle));

          float spatial = worldPos.x * 0.30 + worldPos.z * 0.20;

          float sway    = sin(uTime * 0.55 * rFreq + spatial + rPhase) * 0.04 * rAmp;
          float flutter = sin(uTime * 3.5 + rPhase * 5.1 + spatial * 2.0) * 0.008;
          float gust    = pow(max(0.0, sin(uTime * 0.13 + spatial * 0.4 + rPhase * 0.2)), 6.0) * 0.035;

          float horizMove = sway + flutter + gust;
          float flutY = sin(uTime * 4.2 + rPhase * 3.1 + spatial) * 0.004;

          worldPos.x += windDir.x * horizMove;
          worldPos.z += windDir.y * horizMove;
          worldPos.y += flutY;

          gl_Position = projectionMatrix * viewMatrix * worldPos;`
      )

}

Les trois couches de vent :

┌─────────┬──────────────────────────┬───────────┬─────────────────────────┐
│ Couche │ Fréquence │ Amplitude │ Effet │
├─────────┼──────────────────────────┼───────────┼─────────────────────────┤
│ sway │ lente │ ±4cm │ balancement principal │
├─────────┼──────────────────────────┼───────────┼─────────────────────────┤
│ flutter │ rapide │ ±0.8cm │ frémissement individuel │
├─────────┼──────────────────────────┼───────────┼─────────────────────────┤
│ gust │ très lente + puissance 6 │ ±3.5cm │ rafales ponctuelles │
└─────────┴──────────────────────────┴───────────┴─────────────────────────┘

---

Étape 11 — Boucle d'animation

const clock = new THREE.Clock()
const animate = () => {
controls.update()
if (windUniforms) windUniforms.uTime.value = clock.getElapsedTime()
renderer.render(scene, camera)
frameId = requestAnimationFrame(animate)
}
animate()

---

Étape 12 — Cleanup React

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

▎ Toujours dispose() les géométries, matériaux et textures dans le return du useEffect — sinon fuite mémoire GPU garantie.

---

Résumé des techniques clés

┌──────────────────────┬────────────────────────────────────────────────────────┐
│ Technique │ Pourquoi │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ mergeGeometries │ Tronc + branches = 1 draw call │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ InstancedMesh │ 700 feuilles = 1 draw call │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ onBeforeCompile │ Shader vent sans écrire un ShaderMaterial complet │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ Monte-Carlo rejet │ Distribution uniforme dans une sphère │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ Polyligne récursive │ Bifurcations ancrées sur la vraie courbe (pas de gaps) │
├──────────────────────┼────────────────────────────────────────────────────────┤
│ Bruit sin/cos croisé │ Irrégularité organique sans librairie │
└──────────────────────┴────────────────────────────────────────────────────────┘

---

Le composant final : <CartoonTree /> dans un div avec width: 100%; height: 100vh et c'est parti. 🌳
