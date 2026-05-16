import * as THREE from "three"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
	Fn,
	uniform,
	instanceIndex,
	positionLocal,
	positionWorld,
	vec3,
	float,
	sin,
	cos,
	fract,
	pow,
	max,
} from "three/tsl"

export function createLeafMaterial(texture) {
	const uTime = uniform(0)

	const material = new MeshBasicNodeMaterial({
		map: texture,
		transparent: true,
		alphaTest: 0.9,
		side: THREE.DoubleSide,
	})

	material.positionNode = Fn(() => {
		const seed = float(instanceIndex).mul(0.6180339887)
		const rPhase = fract(seed).mul(6.2831853)
		const rAmp = fract(seed.mul(5.1)).mul(0.6).add(0.8)
		const rFreq = fract(seed.mul(3.3)).mul(0.8).add(0.7)

		const windAngle = sin(uTime.mul(0.06)).mul(0.6)
		const windDirX = cos(windAngle)
		const windDirZ = sin(windAngle)

		const spatial = positionWorld.x.mul(0.3).add(positionWorld.z.mul(0.2))

		const sway = sin(uTime.mul(0.55).mul(rFreq).add(spatial).add(rPhase)).mul(0.04).mul(rAmp)
		const flutter = sin(uTime.mul(3.5).add(rPhase.mul(5.1)).add(spatial.mul(2.0))).mul(0.008)
		const gust = pow(
			max(float(0), sin(uTime.mul(0.13).add(spatial.mul(0.4)).add(rPhase.mul(0.2)))),
			float(6.0),
		).mul(0.035)

		const horizMove = sway.add(flutter).add(gust)
		const flutY = sin(uTime.mul(4.2).add(rPhase.mul(3.1)).add(spatial)).mul(0.004)

		const offset = vec3(windDirX.mul(horizMove), flutY, windDirZ.mul(horizMove))

		return positionLocal.add(offset)
	})()

	return { material, uTime }
}
