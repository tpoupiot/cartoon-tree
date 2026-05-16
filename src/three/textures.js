import * as THREE from "three"

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

export function loadLeafTexture(onFallback) {
	const textureLoader = new THREE.TextureLoader()
	return textureLoader.load(
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
			onFallback(makeFallbackTexture())
		},
	)
}
