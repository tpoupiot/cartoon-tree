---

Tutoriel — Arbre cartoon 3D avec Three.js et React

Vue d'ensemble

L'arbre repose sur 5 idées clés :

1. Un tronc (CylinderGeometry) dont les vertices sont déformés à la main
2. Des branches récursives courbées qui se bifurquent à chaque niveau
3. Des clusters de feuilles placés aux extrémités des branches
4. Un InstancedMesh pour afficher 700 feuilles en un seul draw call
5. Un shader de vent GLSL injecté dans le matériau via onBeforeCompile

---

1. Mise en place

npm create vite@latest cartoon-tree -- --template react
cd cartoon-tree
npm install three

Structure :
src/
App.jsx
CartoonTree.jsx
public/
feuille.png ← texture PNG avec fond transparent (optionnel)

App.jsx ne fait que monter le composant dans un div plein écran :

import CartoonTree from "./CartoonTree.jsx"

export default function App() {
return (
<div style={{ width: "100vw", height: "100vh" }}>
<CartoonTree />
</div>
)
}

CartoonTree.jsx initialise Three.js dans un useEffect et attache le canvas au DOM via une ref.

---

2. Scène de base

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4a261) // fond orange chaud

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300)
camera.position.set(6, 5, 9)
camera.lookAt(0, 3.5, 0) // on regarde le milieu de l'arbre

const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setSize(width, height)
mount.appendChild(renderer.domElement)

Lumières — une ambiante douce + une directionnelle chaude :

scene.add(new THREE.AmbientLight(0xffffff, 0.85))
const dir = new THREE.DirectionalLight(0xffd9a0, 0.7)
dir.position.set(5, 10, 5)
scene.add(dir)
// On garde la direction pour coloriser les feuilles plus tard
const lightDir = new THREE.Vector3().copy(dir.position).normalize()

Sol — un plan large tourné à plat :

const ground = new THREE.Mesh(
new THREE.PlaneGeometry(80, 80),
new THREE.MeshLambertMaterial({ color: 0xc97a3f }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

---

3. Le tronc

On part d'un CylinderGeometry (plus large en bas, plus fin en haut), puis on déforme chaque vertex manuellement pour
deux effets :

- Une courbe quadratique (l'arbre se penche légèrement)
- Un bruit sinusoïdal pour une texture organique

const trunkHeight = 2.4
const trunkGeo = new THREE.CylinderGeometry(
0.05, // rayon haut
0.15, // rayon bas
trunkHeight,
7, // segments radiaux (peu = look cartoon)
8 // segments en hauteur (pour la déformation)
)

const tpos = trunkGeo.attributes.position
for (let i = 0; i < tpos.count; i++) {
const x = tpos.getX(i)
const y = tpos.getY(i)
const z = tpos.getZ(i)
const t = (y + trunkHeight / 2) / trunkHeight // 0 en bas, 1 en haut

    const curveX =  t * t * 0.18   // courbe quadratique → s'accentue en montant
    const curveZ = -t * t * 0.10
    const noise = (Math.sin(y * 6.1 + x * 3.2) + Math.cos(z * 4.8 + y * 2.3)) * 0.022

    tpos.setX(i, x + curveX + noise)
    tpos.setZ(i, z + curveZ + noise * 0.7)

}
trunkGeo.computeVertexNormals()
// Remonter la géo pour que la base soit à y=0
trunkGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, trunkHeight / 2, 0))

▎ Pourquoi flatShading: true sur le matériau ? Ça donne l'effet "facettes" typique du cartoon, sans interpolation de
▎ normales.

---

4. Les branches récursives

C'est le cœur de l'arbre. Deux fonctions travaillent ensemble.

4a. makeBranchGeo(from, to, rTop, rBot)

Crée un cylindre entre deux points 3D quelconques. Le problème : CylinderGeometry est toujours aligné sur Y. Il faut
donc :

1. Créer le cylindre aligné Y
2. Le translater de len/2 vers le haut (pivot à la base)
3. Calculer l'axe de rotation entre (0,1,0) et la direction réelle
4. Appliquer cette rotation
5. Le translater à la position from

function makeBranchGeo(from, to, rTop, rBot) {
const d = new THREE.Vector3().subVectors(to, from)
const len = d.length()
const geo = new THREE.CylinderGeometry(rTop, rBot, len, 6, 5)

    // Bruit organique sur les vertices
    const bp = geo.attributes.position
    for (let i = 0; i < bp.count; i++) {
      const bx = bp.getX(i), by = bp.getY(i), bz = bp.getZ(i)
      const n = (Math.sin(by * 11.3 + bx * 5.1) + Math.cos(bz * 7.2 + by * 3.4)) * 0.009
      bp.setX(i, bx + n)
      bp.setZ(i, bz + n * 0.8)
    }
    geo.computeVertexNormals()

    // Pivot à la base, puis rotation, puis translation
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

4b. makeCurvedBranch(from, to, rTop, rBot, geos, jitter)

Au lieu d'une ligne droite, on subdivise la branche en 4 segments avec une déviation aléatoire au milieu (la déviation
est maximale au milieu grâce au sin(t \* π)) :

function makeCurvedBranch(from, to, rTop, rBot, geos, jitter) {
const segs = 4
const pts = [from.clone()]

    for (let s = 1; s < segs; s++) {
      const t = s / segs
      const bend = Math.sin(t * Math.PI) // pic au milieu
      const p = from.clone().lerp(to, t)
      p.x += (Math.random() - 0.5) * jitter * bend
      p.y += (Math.random() - 0.5) * jitter * bend * 0.35
      p.z += (Math.random() - 0.5) * jitter * bend
      pts.push(p)
    }
    pts.push(to.clone())

    // Créer un cylindre pour chaque segment de la polyligne
    for (let s = 0; s < pts.length - 1; s++) {
      const t0 = s / (pts.length - 1)
      const t1 = (s + 1) / (pts.length - 1)
      geos.push(makeBranchGeo(pts[s], pts[s + 1],
        rBot + (rTop - rBot) * t1,
        rBot + (rTop - rBot) * t0
      ))
    }
    return pts // retourner la polyligne réelle pour ancrer les enfants

}

4c. growBranch(...) — la récursion

Paramètres clés : depth (profondeur actuelle), maxDepth (3 niveaux → profondeur 0, 1, 2).

function growBranch(from, dir, length, radius, depth, maxDepth, geos, leafClusters) {
const jitter = [0.22, 0.14, 0.07][depth] ?? 0.05 // moins de tremblement en profondeur
const to = from.clone().addScaledVector(dir, length)
const pts = makeCurvedBranch(from, to, radius \* 0.6, radius, geos, jitter)

    // Cas terminal : enregistrer un cluster de feuilles
    if (depth >= maxDepth) {
      const tip = pts[pts.length - 1]
      leafClusters.push({ cx: tip.x, cy: tip.y, cz: tip.z, r: 0.38 + radius * 11 })
      return
    }

    const numKids = depth === 0 ? 2 + Math.floor(Math.random() * 2) : 2

    for (let k = 0; k < numKids; k++) {
      // Point de bifurcation quelque part sur la branche parent
      const splitT    = 0.45 + Math.random() * 0.40
      const splitFrom = pathPoint(pts, splitT)      // position sur la polyligne
      const localDir  = pathTangent(pts, splitT)    // direction locale à ce point

      // Construire un repère orthonormal à partir de la tangente
      const worldRef = Math.abs(localDir.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0)
      const right = new THREE.Vector3().crossVectors(localDir, worldRef).normalize()
      const fwd   = new THREE.Vector3().crossVectors(right, localDir).normalize()

      // Angle azimutal réparti + aléatoire, écart angulaire aléatoire
      const az     = (k / numKids) * Math.PI * 2 + (Math.random() - 0.5) * 2.0
      const spread = 0.50 + Math.random() * 0.72

      const perpDir = right.clone()
        .multiplyScalar(Math.cos(az))
        .addScaledVector(fwd, Math.sin(az))

      // Direction enfant = mélange tangente locale + perpendiculaire
      const childDir = localDir.clone()
        .multiplyScalar(Math.cos(spread))
        .addScaledVector(perpDir, Math.sin(spread))

      childDir.y = Math.max(childDir.y, -0.12) // ne jamais pointer vers le bas
      childDir.normalize()

      growBranch(splitFrom, childDir, length * (0.48 + Math.random() * 0.32),
        radius * 0.63, depth + 1, maxDepth, geos, leafClusters)
    }

}

pathPoint et pathTangent sont deux utilitaires qui interpolent respectivement une position et une direction sur la
polyligne à un paramètre t ∈ [0,1].

4d. Lancer la génération

On définit 4 branches primaires qui partent du tronc à des hauteurs et angles différents, puis on fusionne toutes les
géométries en une seule avec mergeGeometries (un seul draw call pour l'arbre entier) :

const primaryDefs = [
{ ht: 2.30, az: 0.35, sp: 0.62, len: 0.95, r: 0.055 },
// ...
]

for (const pb of primaryDefs) {
const from = new THREE.Vector3(ox, pb.ht, oz) // ancré sur la courbe du tronc
growBranch(from, branchDir, pb.len, pb.r, 0, 2, allBranchGeos, clusters)
}

const mergedGeo = mergeGeometries([trunkGeo, ...allBranchGeos])
const trunkMesh = new THREE.InstancedMesh(mergedGeo,
new THREE.MeshLambertMaterial({ color: 0x5a3520, flatShading: true }),
TREE_COUNT
)

---

5. Les feuilles — InstancedMesh

InstancedMesh permet de rendre des milliers de meshes identiques en un seul draw call GPU. Chaque instance a sa propre
matrice (position/rotation/échelle) et couleur.

5a. Répartir les feuilles dans les clusters

À la fin de la récursion, clusters contient des sphères { cx, cy, cz, r }. On répartit les 700 feuilles
proportionnellement à la surface de chaque sphère (r²) :

const totalWeight = clusters.reduce((s, c) => s + c.r _ c.r, 0)
clusters.forEach((c) => {
c.count = Math.round((LEAVES_PER_TREE _ c.r \* c.r) / totalWeight)
})

Pour chaque feuille dans un cluster, on tire un point dans la sphère puis on le reprojette vers la surface (avec
radiusBias pour éviter le trop plein au centre) :

let x, y, z, d
do {
x = Math.random() _ 2 - 1
y = Math.random() _ 2 - 1
z = Math.random() _ 2 - 1
d = x _ x + y _ y + z _ z
} while (d > 1) // rejet si hors de la sphère unité

const radiusBias = 0.2 + Math.random() _ 0.65
const norm = Math.sqrt(d) || 0.001
// Reprojection vers la surface + léger bruit
const nx = (x / norm) _ radiusBias + (Math.random() - 0.5) \* 0.1
// ... idem ny, nz

5b. Orienter les feuilles vers la caméra (billboarding)

Toutes les feuilles partagent la même orientation : face à la caméra. On calcule le quaternion une seule fois avant la
boucle :

const sharedDummy = new THREE.Object3D()
sharedDummy.lookAt(camera.position)
const sharedQuaternion = sharedDummy.quaternion.clone()
// puis pour chaque feuille :
dummy.quaternion.copy(sharedQuaternion)

5c. Taille variable selon la profondeur

Les feuilles près du centre du cluster (plus proches des branches) sont plus grandes :

const closeness = 1 - Math.min(1, Math.sqrt(nx _ nx + ny _ ny + nz _ nz))
const sc = 0.5 + 0.9 _ closeness + (Math.random() - 0.5) \* 0.2
dummy.scale.setScalar(Math.max(0.3, sc))

5d. Couleur selon l'éclairage

On calcule le dot product entre la direction de la lumière et la normale de la feuille (sa position par rapport au
centre du cluster) pour décider si elle est éclairée ou dans l'ombre :

const dot = leafPos.clone().sub(worldCenter).normalize().dot(lightDir)
let t = Math.pow((dot + 1) _ 0.5, 1.3) + (Math.random() - 0.5) _ 0.12
t = Math.max(0, Math.min(1, t))
gradientColor(t, tmpColor) // vert foncé → vert moyen → vert clair
leaves.setColorAt(leafIdx, tmpColor)

---

6. Le shader de vent

C'est la partie la plus avancée. On injecte du GLSL dans le shader par défaut de Three.js via material.onBeforeCompile.

Pourquoi onBeforeCompile ?

Three.js compile ses shaders à la volée. Ce hook nous donne accès au code source GLSL avant compilation, et on peut y
insérer nos propres lignes avec .replace().

Principe du shader

// 1. Seed par instance → chaque feuille a sa propre phase et fréquence
float seed = float(gl_InstanceID) _ 0.6180339887; // nombre d'or → distribution uniforme
float rPhase = fract(seed) _ 6.2831853;
float rAmp = 0.8 + fract(seed _ 5.1) _ 0.6;
float rFreq = 0.7 + fract(seed _ 3.3) _ 0.8;

// 2. Direction du vent qui oscille lentement
float windAngle = sin(uTime _ 0.06) _ 0.6;
vec2 windDir = vec2(cos(windAngle), sin(windAngle));

// 3. Propagation spatiale → effet de vague dans le feuillage
float spatial = worldPos.x _ 0.30 + worldPos.z _ 0.20;

// 4. Trois couches de mouvement
float sway = sin(uTime _ 0.55 _ rFreq + spatial + rPhase) _ 0.04 _ rAmp; // balancement lent
float flutter = sin(uTime _ 3.5 + rPhase _ 5.1 + spatial _ 2.0) _ 0.008; // frémissement rapide
float gust = pow(max(0.0, sin(uTime _ 0.13 + ...)), 6.0) _ 0.035; // rafale brève (puissance 6 = très ciblée)
float flutY = sin(uTime _ 4.2 + rPhase _ 3.1 + spatial) \* 0.004; // léger mouvement vertical

▎ L'astuce du nombre d'or (0.6180339887) : multiplier gl_InstanceID par le nombre d'or garantit une distribution
▎ quasi-uniforme des phases, sans clustering visible.

▎ L'astuce pow(..., 6) : une sinusoïde à la puissance 6 reste quasiment à zéro sauf pendant un court pic — parfait pour
▎ simuler une rafale de vent éphémère.

Injection dans le shader

leafMat.onBeforeCompile = (shader) => {
shader.uniforms.uTime = { value: 0 }
windUniforms = shader.uniforms // garder la référence pour l'animation

    // Déclarer l'uniform dans le vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      uniform float uTime;`
    )

    // Injecter le mouvement après le calcul de position projetée
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      // ... tout le code GLSL ci-dessus ...
      gl_Position = projectionMatrix * viewMatrix * worldPos;`
    )

}

Et dans la boucle d'animation, on fait avancer le temps :

const clock = new THREE.Clock()
const animate = () => {
if (windUniforms) windUniforms.uTime.value = clock.getElapsedTime()
renderer.render(scene, camera)
requestAnimationFrame(animate)
}

---

7. Récapitulatif des paramètres à ajuster

┌─────────────────────────────┬────────────────────────────┬───────────────────────────────────┐
│ Paramètre │ Emplacement │ Effet │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ LEAVES_PER_TREE │ constante globale │ Densité du feuillage │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ maxDepth dans growBranch │ 4ème appel │ Nombre de niveaux de branches │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ jitter │ tableau [0.22, 0.14, 0.07] │ Courbure des branches par niveau │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ radius _ 0.63 │ growBranch │ Taux d'amincissement des branches │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
"#include <project_vertex>",
`#include <project_vertex>
vec4 worldPos = modelMatrix _ instanceMatrix _ vec4(transformed, 1.0);
// ... tout le code GLSL ci-dessus ...
gl_Position = projectionMatrix _ viewMatrix \* worldPos;`
)
}

Et dans la boucle d'animation, on fait avancer le temps :

const clock = new THREE.Clock()
const animate = () => {
if (windUniforms) windUniforms.uTime.value = clock.getElapsedTime()
renderer.render(scene, camera)
requestAnimationFrame(animate)
}

---

7. Récapitulatif des paramètres à ajuster

┌─────────────────────────────┬────────────────────────────┬───────────────────────────────────┐
│ Paramètre │ Emplacement │ Effet │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ LEAVES_PER_TREE │ constante globale │ Densité du feuillage │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ maxDepth dans growBranch │ 4ème appel │ Nombre de niveaux de branches │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ jitter │ tableau [0.22, 0.14, 0.07] │ Courbure des branches par niveau │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ radius _ 0.63 │ growBranch │ Taux d'amincissement des branches │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ sway _ 0.04 │ shader GLSL │ Amplitude du balancement │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ flutter _ 0.008 │ shader GLSL │ Amplitude du frémissement │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ gust _ 0.035 │ shader GLSL │ Force des rafales │
├─────────────────────────────┼────────────────────────────┼───────────────────────────────────┤
│ colorLit/colorMid/colorDark │ couleurs Three.js │ Palette du feuillage │
└─────────────────────────────┴────────────────────────────┴───────────────────────────────────┘

---

Points clés à retenir

1. mergeGeometries — fusionner tronc + toutes les branches en une seule géométrie réduit les draw calls de ~50 à 1.
2. InstancedMesh — 700 feuilles = 1 draw call au lieu de 700.
3. Billboarding partagé — calculer le quaternion "face caméra" une seule fois et le copier sur toutes les feuilles est bien plus rapide que
   lookAt individuel.
4. onBeforeCompile — le moyen propre d'injecter du GLSL dans Three.js sans réécrire le shader entier.
5. Récursion avec polyligne — retourner les points réels de la courbe (pas seulement from/to) permet d'ancrer les branches enfants exactement
   sur la géométrie visible, sans décalage.
