// Holds the live R3F WebGLRenderer + scene/camera so UI (screenshots) can force
// a present without Canvas `preserveDrawingBuffer: true` — which triggers
// ANGLE "read and write depth stencil ... same image" with the effect stack.

let api = null

export function setRendererApi(next) {
  api = next
}

export function getRendererApi() {
  return api
}

/** Force one render and return the canvas for immediate readback (toBlob/drawImage). */
export function captureCanvas() {
  if (!api?.gl || !api?.scene || !api?.camera) {
    return document.querySelector('canvas')
  }
  const { gl, scene, camera } = api
  gl.render(scene, camera)
  return gl.domElement
}
