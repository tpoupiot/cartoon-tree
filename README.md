# Cartoon Tree

Petit projet Three.js + React + Vite : un arbre cartoon avec tronc 3D et feuillage en particules billboard.

## Lancer

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (par défaut http://localhost:5173).

## Utiliser ta propre texture de feuille

Pose ton image (PNG transparent recommandé) dans `public/Vector_1.png`.
Si le fichier est absent, une texture est générée automatiquement en fallback.

Pour utiliser un autre nom de fichier, modifie la ligne dans `src/CartoonTree.jsx` :

```js
const leafTex = textureLoader.load("/Vector_1.png", ...);
```

## Build

```bash
npm run build
npm run preview
```

## Techniques utilisées

- **Tronc** : `CylinderGeometry` faible résolution + `flatShading` + déformation des sommets pour le look cartoon.
- **Feuillage** : `InstancedMesh` de 600 quads. Distribution dans un volume ellipsoïdal autour de la cime.
- **Billboard GPU** : shader patché via `onBeforeCompile` pour orienter chaque quad face caméra sans coût CPU.
- **Couleurs** : calculées par feuille selon le produit scalaire entre sa position et la direction de lumière (gradient bordeaux → orange → jaune doré).
- **Tailles** : feuilles centrales plus grandes que les feuilles en périphérie (effet de densité).
- **Z-fighting évité** : alpha cutout pur (`transparent: false` + `alphaTest`), donc rendu opaque dans le depth buffer, pas besoin de tri.
