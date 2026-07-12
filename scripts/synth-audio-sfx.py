#!/usr/bin/env python3
"""Procedural (license-free) SFX synthesis for Happy Farm.

Generates the short mechanical SFX that don't warrant a Stable Audio API call
(see assets/audio/sound-manifest.json for the generated BGM/stingers):

  assets/audio/sfx_plant.wav       - soft dirt "pop" when planting a crop
  assets/audio/sfx_wheel_spin.wav  - ratchet ticks matching WheelSheet's spin

The wheel tick timing mirrors packages/farm-ui/src/components/WheelSheet.tsx:
SPIN_TOTAL_MS=2000 with an ease-out cubic delay curve. stepCount varies with
the winning slot (17..24 for 8 slots); we bake the average (21) so the audio
decelerates in sync with the highlight animation for every outcome.

Pure stdlib (wave/math/random) - rerunning reproduces the same files.
"""
import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

# WheelSheet.tsx contract: total spin duration and easing of step delays.
SPIN_TOTAL_MS = 2000
SPIN_TICK_COUNT = 21  # average of stepCount range 2*8+winner+1 (17..24)


def write_wav(path, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.89 / peak if peak > 0.89 else 1.0
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767))
                for s in samples
            )
        )
    print(f"[ok] {os.path.relpath(path)} ({len(samples) / SAMPLE_RATE:.2f}s)")


def silence(seconds):
    return [0.0] * int(SAMPLE_RATE * seconds)


def mix_at(base, overlay, at_seconds):
    start = int(SAMPLE_RATE * at_seconds)
    end = start + len(overlay)
    if end > len(base):
        base.extend([0.0] * (end - len(base)))
    for i, s in enumerate(overlay):
        base[start + i] += s
    return base


def plant_pop():
    """Soft dirt pop: downward pitch thump + tiny filtered-noise soil scatter."""
    rng = random.Random(20260713)
    out = []
    thump_len = int(SAMPLE_RATE * 0.09)
    phase = 0.0
    for i in range(thump_len):
        t = i / thump_len
        freq = 180.0 * (70.0 / 180.0) ** t  # 180Hz -> 70Hz sweep
        phase += 2 * math.pi * freq / SAMPLE_RATE
        env = (1.0 - t) ** 2.2
        out.append(math.sin(phase) * env * 0.9)

    scatter_len = int(SAMPLE_RATE * 0.11)
    lp = 0.0
    prev = 0.0
    scatter = []
    for i in range(scatter_len):
        t = i / scatter_len
        n = rng.uniform(-1.0, 1.0)
        lp += 0.35 * (n - lp)      # one-pole lowpass keeps it soft
        bp = lp - prev             # crude highpass removes rumble
        prev = lp
        env = math.sin(math.pi * min(1.0, t / 0.25)) if t < 0.25 else (1.0 - t) ** 1.8
        scatter.append(bp * env * 0.5)
    mix_at(out, scatter, 0.03)
    out.extend(silence(0.03))
    return out


def wheel_tick(strength=1.0):
    """Single ratchet tick: damped 2.2kHz ping + 2ms noise transient."""
    rng = random.Random(int(strength * 1000) + 7)
    tick_len = int(SAMPLE_RATE * 0.014)
    out = []
    for i in range(tick_len):
        t = i / tick_len
        env = (1.0 - t) ** 3.5
        ping = math.sin(2 * math.pi * 2200 * i / SAMPLE_RATE)
        noise = rng.uniform(-1.0, 1.0) * (1.0 if i < SAMPLE_RATE * 0.002 else 0.0)
        out.append((ping * 0.7 + noise * 0.5) * env * strength)
    return out


def wheel_spin():
    """Tick sequence decelerating on WheelSheet's ease-out cubic curve."""
    ease_out = lambda t: 1.0 - (1.0 - t) ** 3
    out = silence(SPIN_TOTAL_MS / 1000.0 + 0.06)
    for step in range(SPIN_TICK_COUNT):
        at = SPIN_TOTAL_MS / 1000.0 * ease_out(step / SPIN_TICK_COUNT)
        is_last = step == SPIN_TICK_COUNT - 1
        mix_at(out, wheel_tick(1.0 if is_last else 0.55 + 0.25 * (step / SPIN_TICK_COUNT)), at)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    write_wav(os.path.join(OUT_DIR, "sfx_plant.wav"), plant_pop())
    write_wav(os.path.join(OUT_DIR, "sfx_wheel_spin.wav"), wheel_spin())


if __name__ == "__main__":
    main()
