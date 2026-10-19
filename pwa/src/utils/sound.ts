export function successFeedback() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 1200
    gain.gain.value = 0.15
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {
    /* звук недоступен — не критично */
  }
  if (navigator.vibrate) navigator.vibrate(120)
}