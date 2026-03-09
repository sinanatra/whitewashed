/**
 * Marks an image as ready even when it is already complete before hydration finishes.
 *
 * @param {HTMLImageElement} node
 * @param {() => void} onReady
 */
export function imageReady(node, onReady) {
  let readyHandler = typeof onReady === 'function' ? onReady : () => {};
  let frameId = 0;

  function notifyReady() {
    if (node.complete && node.naturalWidth > 0) {
      readyHandler();
    }
  }

  function scheduleReadyCheck() {
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(notifyReady);
  }

  node.addEventListener('load', notifyReady);
  scheduleReadyCheck();

  return {
    /**
     * @param {() => void} nextHandler
     */
    update(nextHandler) {
      readyHandler = typeof nextHandler === 'function' ? nextHandler : () => {};
      scheduleReadyCheck();
    },
    destroy() {
      cancelAnimationFrame(frameId);
      node.removeEventListener('load', notifyReady);
    }
  };
}
