// The short sound the app makes when something needs attention (a new order for staff, "your order is ready" for
// guests). Made with the Web Audio API, so there is no sound file to ship. Browser-only: call from client components.

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** A new audio output, or null where the browser has none. It starts silent until the person has touched the page. */
export function createAudioOutput(): AudioContext | null {
  const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  return Context ? new Context() : null;
}

/** Two short rising tones: audible over a kitchen or a busy table, not a siren. */
export function chime(audio: AudioContext): void {
  const start = audio.currentTime;
  for (const [frequency, at] of [[880, 0], [1175, 0.18]] as const) {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start + at);
    volume.gain.exponentialRampToValueAtTime(0.3, start + at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.16);
    tone.connect(volume).connect(audio.destination);
    tone.start(start + at);
    tone.stop(start + at + 0.18);
  }
}
