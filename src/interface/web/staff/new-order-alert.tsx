"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { arrivals } from "./new-orders";

const SOUND_PREFERENCE = "smartmenu:staff:order-sound";
const NOTICE_MS = 8000;

type Props = {
  /** Ids of the orders that are NEW right now, as the server just rendered them. */
  newOrderIds: readonly string[];
};

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Two short rising tones: audible over a kitchen, not a siren. */
function chime(audio: AudioContext) {
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

/**
 * Tells staff that an order has just come in: a short notice on the screen (always) and a sound (when switched on).
 *
 * Browsers only let a page make sound after the person has touched it, so the sound has its own switch: pressing
 * it is that touch (and plays the chime once, so they hear what it sounds like). The choice is remembered on this
 * device. After a reload the sound is still "on", but the browser waits for the first touch of the page before it
 * plays anything; until then the switch says so.
 */
export function NewOrderAlert({ newOrderIds }: Props) {
  const t = useTranslations("StaffOrders.live");
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /** The audio output, created on first need. Null where the browser has none. */
  const output = () => {
    if (!audio.current) {
      const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (Context) audio.current = new Context();
    }
    return audio.current;
  };

  // The remembered choice, and the first touch that lets the browser play.
  useEffect(() => {
    let remembered = false;
    try {
      remembered = window.localStorage.getItem(SOUND_PREFERENCE) === "on";
    } catch {
      // No storage: the sound simply starts off.
    }
    if (!remembered) return;
    setSoundOn(true);
    setBlocked(true);
    const unlock = () => {
      void output()
        ?.resume()
        .then(() => setBlocked(false))
        .catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // New orders since the last look.
  useEffect(() => {
    const result = arrivals(seen.current, newOrderIds);
    seen.current = result.seen;
    if (result.arrived.length === 0) return;
    setNotice(t("newOrders", { count: result.arrived.length }));
    const playing = audio.current;
    if (soundOn && playing && playing.state === "running") chime(playing);
    // `t` and `soundOn` are read as they are at that moment; only a change of the list is news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrderIds]);

  // The notice goes away by itself.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE, next ? "on" : "off");
    } catch {
      // Not remembered: it still works until the page is closed.
    }
    if (!next) return;
    const playing = output();
    // This press is the touch the browser asks for: wake the output and let them hear the chime once.
    void playing
      ?.resume()
      .then(() => {
        setBlocked(false);
        chime(playing);
      })
      .catch(() => {});
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={soundOn}
        className={`rounded-lg border px-4 py-2 text-sm font-semibold ${soundOn ? "border-green-600 bg-green-50 text-green-800 hover:bg-green-100" : "border-gray-300 bg-white hover:bg-gray-100"}`}
      >
        {soundOn ? t("turnSoundOff") : t("turnSoundOn")}
      </button>
      {soundOn && blocked && <p className="text-sm text-gray-600">{t("soundBlocked")}</p>}
      <p role="status" aria-live="assertive" className={notice ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white" : "sr-only"}>
        {notice}
      </p>
    </div>
  );
}
