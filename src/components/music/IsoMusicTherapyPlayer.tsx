// src/components/music/IsoMusicTherapyPlayer.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Headphones,
  Music,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Waves,
  Youtube,
} from "lucide-react";
import {
  CIRCUMPLEX_ANCHORS,
  EmotionLabel,
  EmotionRecordItem,
} from "@/lib/ai/circumplex";

export type AudioSourceMode = "piano" | "spotify" | "youtube";

export interface IsoTrack {
  id: string;
  stage: string;
  therapeuticStage: 1 | 2 | 3;
  title: string;
  artist: string;
  bpm: number;
  targetValence: string;
  targetArousal: string;
  pianoChordsHz: number[][];
  spotifyTrackId: string;
  youtubeVideoId: string;
  desc: string;
  tags: string[];
}

// Musical note frequencies (Hz) for rich acoustic piano progressions
const NOTE = {
  C3: 130.81,
  D3: 146.83,
  Eb3: 155.56,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  Ab3: 207.65,
  A3: 220.0,
  Bb3: 233.08,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  Ab4: 415.3,
  A4: 440.0,
  Bb4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
};

interface IsoMusicTherapyPlayerProps {
  latestRecord: EmotionRecordItem | undefined;
  onPlayingStateChange?: (playingTitle: string | null) => void;
}

export default function IsoMusicTherapyPlayer({
  latestRecord,
  onPlayingStateChange,
}: IsoMusicTherapyPlayerProps) {
  const [mode, setMode] = useState<"iso" | "compensatory">("iso");
  const [sourceMode, setSourceMode] = useState<AudioSourceMode>("piano");
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Web Audio API refs for realistic Acoustic Grand Piano synthesis
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const arpeggioTimerRef = useRef<number | null>(null);
  const stepIndexRef = useRef<number>(0);

  const emotion: EmotionLabel = latestRecord?.primary_emotion ?? "joy";
  const valence = latestRecord?.valence ?? 0.5;
  const arousal = latestRecord?.arousal ?? 0.2;

  // Dynamic BPM offset computed directly from the user's exact Arousal score [-1, +1]
  const arousalBpmOffset = Math.round(arousal * 6);

  const playlist: IsoTrack[] = useMemo(() => {
    if (mode === "compensatory") {
      return [
        {
          id: `comp-1-${emotion}`,
          stage: "Compensatory Stage 1 (Direct Counter-Balance)",
          therapeuticStage: 1,
          title: "Clair de Lune — Peaceful Piano Sanctuary",
          artist: "Claude Debussy / Kalbu Piano",
          bpm: 60,
          targetValence: "+0.75",
          targetArousal: "-0.45",
          pianoChordsHz: [
            [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
            [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
            [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
            [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.B4],
          ],
          spotifyTrackId: "6kf7ZCJjEbjZXikivKOsvJ",
          youtubeVideoId: "4oStw0r33so",
          desc: `Directly counterbalances ${emotion} state with serene Low-Energy Pleasant piano intervals`,
          tags: ["piano", "compensatory", "serenity"],
        },
        {
          id: `comp-2-${emotion}`,
          stage: "Compensatory Stage 2 (Restorative Equilibrium)",
          therapeuticStage: 2,
          title: "River Flows in You — Acoustic Uplift",
          artist: "Yiruma / Kalbu Piano",
          bpm: 66,
          targetValence: "+0.85",
          targetArousal: "+0.10",
          pianoChordsHz: [
            [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.A4],
            [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.F4],
            [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.E4],
            [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G4],
          ],
          spotifyTrackId: "2agBDIr9MYDUducQPC1sFU",
          youtubeVideoId: "jfKfPfyJRdk",
          desc: "Encourages cognitive reframing and steady parasympathetic recovery",
          tags: ["piano-solo", "uplift", "clarity"],
        },
      ];
    }

    // 6 Distinct Emotion-Specific ISO-Principle 3-Stage Trajectories
    switch (emotion) {
      case "fear":
        return [
          {
            id: "iso-fear-1",
            stage: "ISO Stage 1 (Mirror Anxious Arousal)",
            therapeuticStage: 1,
            title: "Nuvole Bianche — Grounding Arpeggio",
            artist: "Ludovico Einaudi / Kalbu Piano",
            bpm: Math.max(72, 82 + arousalBpmOffset),
            targetValence: "-0.65",
            targetArousal: "+0.70",
            pianoChordsHz: [
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.B4, NOTE.C5, NOTE.E5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.C5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.D5],
            ],
            spotifyTrackId: "3weNRklVDqb4Rr5MhKBR3D",
            youtubeVideoId: "1ZYbU82GVz4",
            desc: "Matches elevated anxious heart rate with predictable, grounding piano patterns",
            tags: ["fear-mirror", "grounding", "anxiolytic"],
          },
          {
            id: "iso-fear-2",
            stage: "ISO Stage 2 (Autonomic De-escalation Bridge)",
            therapeuticStage: 2,
            title: "Saman — Warm Felt Piano Breathwork",
            artist: "Ólafur Arnalds / Kalbu Piano",
            bpm: 66,
            targetValence: "+0.15",
            targetArousal: "+0.10",
            pianoChordsHz: [
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.E4],
            ],
            spotifyTrackId: "5RqKo9P4DLA0bVyY70cWkr",
            youtubeVideoId: "M5QY2_8704o",
            desc: "Gradually slows tempo to 66 BPM to lower cortisol and sympathetic tension",
            tags: ["felt-piano", "de-escalation", "iso-bridge"],
          },
          {
            id: "iso-fear-3",
            stage: "ISO Stage 3 (Target Safe Serenity)",
            therapeuticStage: 3,
            title: "Gymnopédie No. 1 — Safe Harbour Nocturne",
            artist: "Erik Satie / Kalbu Piano",
            bpm: 56,
            targetValence: "+0.70",
            targetArousal: "-0.55",
            pianoChordsHz: [
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.F4, NOTE.B4, NOTE.D5],
              [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.B3, NOTE.E4, NOTE.G4],
              [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
            ],
            spotifyTrackId: "5NGtFXVpXSvwunEIGeviY3",
            youtubeVideoId: "4oStw0r33so",
            desc: "Guides nervous system into Low-Energy Pleasant restorative safety",
            tags: ["nocturne", "serene", "iso-target"],
          },
        ];

      case "anger":
        return [
          {
            id: "iso-anger-1",
            stage: "ISO Stage 1 (Mirror Intense Tension)",
            therapeuticStage: 1,
            title: "Experience — Cathartic Minor Piano",
            artist: "Ludovico Einaudi / Kalbu Piano",
            bpm: Math.max(76, 86 + arousalBpmOffset),
            targetValence: "-0.60",
            targetArousal: "+0.75",
            pianoChordsHz: [
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.Bb3, NOTE.F4, NOTE.Bb4, NOTE.D5, NOTE.F5, NOTE.D5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.Bb4, NOTE.D5, NOTE.Bb4],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.A4],
            ],
            spotifyTrackId: "1BncfTJAWxrsxyT9culBrj", // Experience - Einaudi
            youtubeVideoId: "lTRiuFIWV54",
            desc: "Validates high-arousal frustration through deep resonant D-minor voicings",
            tags: ["anger-catharsis", "minor-piano", "release"],
          },
          {
            id: "iso-anger-2",
            stage: "ISO Stage 2 (Tension Release Bridge)",
            therapeuticStage: 2,
            title: "Deep Cedar — Harmonic Resolution Piano",
            artist: "Ólafur Arnalds / Kalbu Piano",
            bpm: 68,
            targetValence: "+0.10",
            targetArousal: "+0.15",
            pianoChordsHz: [
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.F5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.Bb3, NOTE.F4, NOTE.A4, NOTE.D5, NOTE.F5, NOTE.D5],
            ],
            spotifyTrackId: "5RqKo9P4DLA0bVyY70cWkr",
            youtubeVideoId: "M5QY2_8704o",
            desc: "Softens sharp rhythmic edges and shifts minor tension into open major sevenths",
            tags: ["de-escalation", "warm-bridge", "breath"],
          },
          {
            id: "iso-anger-3",
            stage: "ISO Stage 3 (Grounded Equilibrium)",
            therapeuticStage: 3,
            title: "Clair de Lune — Cool Evening Stillness",
            artist: "Claude Debussy / Kalbu Piano",
            bpm: 58,
            targetValence: "+0.72",
            targetArousal: "-0.45",
            pianoChordsHz: [
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5],
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.C5],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
            ],
            spotifyTrackId: "6kf7ZCJjEbjZXikivKOsvJ",
            youtubeVideoId: "4oStw0r33so",
            desc: "Restores cool emotional clarity and relaxed autonomic baseline",
            tags: ["clarity", "calm-piano", "iso-target"],
          },
        ];

      case "sadness":
        return [
          {
            id: "iso-sadness-1",
            stage: "ISO Stage 1 (Mirror Low-Energy Grief/Fatigue)",
            therapeuticStage: 1,
            title: "Gymnopédie No. 1 — Rain on Quiet Glass",
            artist: "Erik Satie / Kalbu Piano",
            bpm: Math.max(52, 58 + arousalBpmOffset),
            targetValence: "-0.70",
            targetArousal: "-0.55",
            pianoChordsHz: [
              [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E4],
              [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4],
              [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.E4, NOTE.G4, NOTE.B4],
              [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E4],
            ],
            spotifyTrackId: "5NGtFXVpXSvwunEIGeviY3",
            youtubeVideoId: "M5QY2_8704o",
            desc: "Gently companions sadness and burnout without forcing toxic positivity",
            tags: ["sadness-mirror", "rain-piano", "empathy"],
          },
          {
            id: "iso-sadness-2",
            stage: "ISO Stage 2 (Warm Affective Bridge)",
            therapeuticStage: 2,
            title: "Saman — Warm Cello & Piano Horizon",
            artist: "Ólafur Arnalds / Kalbu Piano",
            bpm: 64,
            targetValence: "+0.15",
            targetArousal: "-0.15",
            pianoChordsHz: [
              [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5],
              [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
              [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5],
            ],
            spotifyTrackId: "5RqKo9P4DLA0bVyY70cWkr",
            youtubeVideoId: "lTRiuFIWV54",
            desc: "Introduces comforting major-7th harmonic warmth to lift emotional heaviness",
            tags: ["warm-piano", "comfort", "iso-bridge"],
          },
          {
            id: "iso-sadness-3",
            stage: "ISO Stage 3 (Gentle Hope & Uplift)",
            therapeuticStage: 3,
            title: "One Summer's Day — Gentle Morning Hope",
            artist: "Joe Hisaishi / Kalbu Piano",
            bpm: 72,
            targetValence: "+0.75",
            targetArousal: "+0.20",
            pianoChordsHz: [
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.G5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.E5],
            ],
            spotifyTrackId: "3gFQOMoUwlR6aUZj81gCzu",
            youtubeVideoId: "jfKfPfyJRdk",
            desc: "Guides mood into comforting, grounded optimism and emotional renewal",
            tags: ["ghibli-piano", "uplift", "iso-target"],
          },
        ];

      case "love":
        return [
          {
            id: "iso-love-1",
            stage: "ISO Stage 1 (Mirror Affection & Warmth)",
            therapeuticStage: 1,
            title: "River Flows in You — Tender Acoustic Piano",
            artist: "Yiruma / Kalbu Piano",
            bpm: Math.max(62, 68 + arousalBpmOffset),
            targetValence: "+0.88",
            targetArousal: "+0.18",
            pianoChordsHz: [
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.B4],
            ],
            spotifyTrackId: "2agBDIr9MYDUducQPC1sFU",
            youtubeVideoId: "lTRiuFIWV54",
            desc: "Resonates with feelings of connection, gratitude, and interpersonal warmth",
            tags: ["love-resonance", "warm-piano", "connection"],
          },
          {
            id: "iso-love-2",
            stage: "ISO Stage 2 (Deep Heart Presence)",
            therapeuticStage: 2,
            title: "Clair de Lune — Romantic Harmonic Flow",
            artist: "Claude Debussy / Kalbu Piano",
            bpm: 62,
            targetValence: "+0.90",
            targetArousal: "-0.10",
            pianoChordsHz: [
              [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
            ],
            spotifyTrackId: "6kf7ZCJjEbjZXikivKOsvJ",
            youtubeVideoId: "4oStw0r33so",
            desc: "Deepens emotional appreciation and serene belonging",
            tags: ["gratitude", "belonging", "harmony"],
          },
          {
            id: "iso-love-3",
            stage: "ISO Stage 3 (Serene Fulfilment)",
            therapeuticStage: 3,
            title: "Saman — Peaceful Evening Sanctuary",
            artist: "Ólafur Arnalds / Kalbu Piano",
            bpm: 58,
            targetValence: "+0.85",
            targetArousal: "-0.35",
            pianoChordsHz: [
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G4],
            ],
            spotifyTrackId: "5RqKo9P4DLA0bVyY70cWkr",
            youtubeVideoId: "M5QY2_8704o",
            desc: "Anchors lasting emotional security and restful peace",
            tags: ["serene", "restorative", "peace"],
          },
        ];

      case "surprise":
        return [
          {
            id: "iso-surprise-1",
            stage: "ISO Stage 1 (Mirror High-Alert Wonder)",
            therapeuticStage: 1,
            title: "Merry-Go-Round of Life — Sparkling Piano Waltz",
            artist: "Joe Hisaishi / Kalbu Piano",
            bpm: Math.max(76, 84 + arousalBpmOffset),
            targetValence: "+0.35",
            targetArousal: "+0.80",
            pianoChordsHz: [
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.Bb4, NOTE.D5, NOTE.G5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.F5],
            ],
            spotifyTrackId: "3gFQOMoUwlR6aUZj81gCzu",
            youtubeVideoId: "jfKfPfyJRdk",
            desc: "Matches heightened alertness and unexpected novelty with bright piano cadences",
            tags: ["surprise-wonder", "bright-piano", "alert"],
          },
          {
            id: "iso-surprise-2",
            stage: "ISO Stage 2 (Cognitive Integration Bridge)",
            therapeuticStage: 2,
            title: "Nuvole Bianche — Grounding Reflection",
            artist: "Ludovico Einaudi / Kalbu Piano",
            bpm: 68,
            targetValence: "+0.65",
            targetArousal: "+0.25",
            pianoChordsHz: [
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.E5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
            ],
            spotifyTrackId: "3weNRklVDqb4Rr5MhKBR3D",
            youtubeVideoId: "1ZYbU82GVz4",
            desc: "Helps process unexpected events into steady, grounded focus",
            tags: ["integration", "focus", "iso-bridge"],
          },
          {
            id: "iso-surprise-3",
            stage: "ISO Stage 3 (Balanced Clarity)",
            therapeuticStage: 3,
            title: "River Flows in You — Centered Flow",
            artist: "Yiruma / Kalbu Piano",
            bpm: 62,
            targetValence: "+0.80",
            targetArousal: "-0.10",
            pianoChordsHz: [
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
            ],
            spotifyTrackId: "2agBDIr9MYDUducQPC1sFU",
            youtubeVideoId: "4oStw0r33so",
            desc: "Stabilizes high arousal into clear, joyful composure",
            tags: ["composure", "clarity", "iso-target"],
          },
        ];

      case "joy":
      default:
        return [
          {
            id: "iso-joy-1",
            stage: "ISO Stage 1 (Mirror Radiant Joy & Flow)",
            therapeuticStage: 1,
            title: "One Summer's Day — Bright Piano Study",
            artist: "Joe Hisaishi / Kalbu Piano",
            bpm: Math.max(70, 76 + arousalBpmOffset),
            targetValence: "+0.85",
            targetArousal: "+0.50",
            pianoChordsHz: [
              [NOTE.C3, NOTE.G3, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G5],
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.F4],
            ],
            spotifyTrackId: "3gFQOMoUwlR6aUZj81gCzu",
            youtubeVideoId: "jfKfPfyJRdk",
            desc: "Sustains joyful momentum and creative cognitive clarity",
            tags: ["joy-flow", "bright-piano", "optimism"],
          },
          {
            id: "iso-joy-2",
            stage: "ISO Stage 2 (Mindful Gratitude Bridge)",
            therapeuticStage: 2,
            title: "River Flows in You — Warm Acoustic Presence",
            artist: "Yiruma / Kalbu Piano",
            bpm: 68,
            targetValence: "+0.88",
            targetArousal: "+0.15",
            pianoChordsHz: [
              [NOTE.A3, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5],
              [NOTE.F3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.G3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5, NOTE.B4],
            ],
            spotifyTrackId: "2agBDIr9MYDUducQPC1sFU",
            youtubeVideoId: "lTRiuFIWV54",
            desc: "Channels elevated happiness into grounded gratitude and focus",
            tags: ["acoustic-piano", "gratitude", "harmony"],
          },
          {
            id: "iso-joy-3",
            stage: "ISO Stage 3 (Restorative Positive Baseline)",
            therapeuticStage: 3,
            title: "Clair de Lune — Evening Serenity Piano",
            artist: "Claude Debussy / Kalbu Piano",
            bpm: 60,
            targetValence: "+0.82",
            targetArousal: "-0.30",
            pianoChordsHz: [
              [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5],
              [NOTE.C3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5],
              [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5],
              [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5],
            ],
            spotifyTrackId: "6kf7ZCJjEbjZXikivKOsvJ",
            youtubeVideoId: "4oStw0r33so",
            desc: "Consolidates a calm, resilient positive baseline",
            tags: ["classical-piano", "restorative", "calm"],
          },
        ];
    }
  }, [emotion, arousalBpmOffset, mode]);

  function stopPianoSynth() {
    if (arpeggioTimerRef.current) {
      window.clearInterval(arpeggioTimerRef.current);
      arpeggioTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    masterGainRef.current = null;
  }

  function triggerPianoKey(
    ctx: AudioContext,
    destination: AudioNode,
    freqHz: number,
    velocity = 0.22,
    durationSec = 2.4
  ) {
    const now = ctx.currentTime;
    const noteGain = ctx.createGain();

    // Piano ADSR envelope: crisp hammer strike (12ms) -> natural string decay
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(velocity, now + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(velocity * 0.35, now + 0.45);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freqHz * 5.5, now);
    filter.frequency.exponentialRampToValueAtTime(
      freqHz * 1.8,
      now + durationSec * 0.8
    );

    noteGain.connect(filter);
    filter.connect(destination);

    const partials = [
      { mult: 1.0, amp: 1.0, type: "triangle" as OscillatorType },
      { mult: 2.0, amp: 0.35, type: "sine" as OscillatorType },
      { mult: 3.001, amp: 0.12, type: "sine" as OscillatorType },
      { mult: 4.003, amp: 0.04, type: "sine" as OscillatorType },
    ];

    partials.forEach(({ mult, amp, type }) => {
      const osc = ctx.createOscillator();
      const partialGain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqHz * mult, now);
      partialGain.gain.setValueAtTime(amp, now);

      osc.connect(partialGain);
      partialGain.connect(noteGain);

      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    });
  }

  function startPianoArpeggio(track: IsoTrack) {
    stopPianoSynth();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.75, ctx.currentTime);
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    stepIndexRef.current = 0;
    const stepMs = Math.round((60 / track.bpm / 2) * 1000);

    const playNextStep = () => {
      if (!audioCtxRef.current || !masterGainRef.current) return;
      const s = stepIndexRef.current;
      const chordIdx = Math.floor(s / 6) % track.pianoChordsHz.length;
      const noteIdx = s % 6;
      const chord = track.pianoChordsHz[chordIdx];
      const freq = chord[noteIdx];

      if (noteIdx === 0) {
        triggerPianoKey(
          audioCtxRef.current,
          masterGainRef.current,
          freq,
          0.26,
          3.4
        );
      } else {
        triggerPianoKey(
          audioCtxRef.current,
          masterGainRef.current,
          freq,
          0.18,
          2.2
        );
      }

      stepIndexRef.current += 1;
    };

    playNextStep();
    arpeggioTimerRef.current = window.setInterval(playNextStep, stepMs);
  }

  function handleSelectTrack(track: IsoTrack) {
    if (activeTrackId === track.id) {
      stopPianoSynth();
      setActiveTrackId(null);
      onPlayingStateChange?.(null);
      return;
    }

    setActiveTrackId(track.id);
    onPlayingStateChange?.(track.title);
    if (sourceMode === "piano") {
      startPianoArpeggio(track);
    } else {
      stopPianoSynth();
    }
  }

  function handleSwitchSourceMode(nextSource: AudioSourceMode) {
    setSourceMode(nextSource);
    if (nextSource !== "piano") {
      stopPianoSynth();
    } else if (activeTrackId) {
      const found = playlist.find((t) => t.id === activeTrackId);
      if (found) startPianoArpeggio(found);
    }
  }

  function handleToggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setValueAtTime(
        nextMuted ? 0 : 0.75,
        audioCtxRef.current.currentTime
      );
    }
  }

  useEffect(() => {
    return () => {
      stopPianoSynth();
    };
  }, []);

  const emotionColor = CIRCUMPLEX_ANCHORS[emotion].color;

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Mood-Based Music Matcher
            </h3>
            <p className="text-[11px] text-slate-400">
              Dynamic Emotion &amp; Circumplex (V/A) Piano + Spotify/YouTube
              Matcher
            </p>
          </div>
        </div>

        {/* ISO vs Compensatory Principle Selector */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => {
                stopPianoSynth();
                setActiveTrackId(null);
                setMode("iso");
              }}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                mode === "iso"
                  ? "bg-emerald-500/20 text-emerald-300 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ISO Principle
            </button>
            <button
              type="button"
              onClick={() => {
                stopPianoSynth();
                setActiveTrackId(null);
                setMode("compensatory");
              }}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                mode === "compensatory"
                  ? "bg-indigo-500/20 text-indigo-300 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Compensatory
            </button>
          </div>

          {activeTrackId && sourceMode === "piano" && (
            <button
              type="button"
              onClick={handleToggleMute}
              title={isMuted ? "Unmute Piano" : "Mute Piano"}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Audio Source Mode Selector */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
        <button
          type="button"
          onClick={() => handleSwitchSourceMode("piano")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer ${
            sourceMode === "piano"
              ? "bg-indigo-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          Piano Melodies
        </button>

        <button
          type="button"
          onClick={() => handleSwitchSourceMode("spotify")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer ${
            sourceMode === "spotify"
              ? "bg-emerald-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Waves className="w-3.5 h-3.5" />
          Spotify Player
        </button>

        <button
          type="button"
          onClick={() => handleSwitchSourceMode("youtube")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer ${
            sourceMode === "youtube"
              ? "bg-rose-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Youtube className="w-3.5 h-3.5" />
          YouTube Stream
        </button>
      </div>

      {/* Active Mood Calibration Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
        <span className="text-slate-300">
          Matched to Mood:{" "}
          <strong className="capitalize" style={{ color: emotionColor }}>
            {emotion}
          </strong>{" "}
          <span className="text-slate-400">({latestRecord?.quadrant})</span>
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          V: {valence > 0 ? `+${valence}` : valence} | A:{" "}
          {arousal > 0 ? `+${arousal}` : arousal}
        </span>
      </div>

      {/* Track List */}
      <div className="space-y-2.5">
        {playlist.map((item, idx) => {
          const isActive = activeTrackId === item.id;
          return (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border transition space-y-3 ${
                isActive
                  ? "bg-slate-950 border-emerald-500/50 shadow-lg shadow-emerald-950/20"
                  : "bg-slate-950 border-slate-800/90"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectTrack(item)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition cursor-pointer ${
                      isActive
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25"
                    }`}
                    title={isActive ? "Stop Track" : "Play Track"}
                  >
                    {isActive ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-medium">
                        {idx + 1}. {item.stage}
                      </p>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                        {item.bpm} BPM
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-800/80 text-slate-400">
                        Target V:{item.targetValence} A:{item.targetArousal}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
                      {item.title}
                      {isActive && sourceMode === "piano" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                          <Waves className="w-3 h-3 animate-pulse" /> Piano
                          Playing
                        </span>
                      )}
                    </p>

                    <p className="text-[11px] text-slate-400">
                      {item.artist} — {item.desc}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800/80"
                        >
                          #{tag}
                        </span>
                      ))}

                      <a
                        href={`https://open.spotify.com/track/${item.spotifyTrackId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition"
                      >
                        Spotify <ExternalLink className="w-2.5 h-2.5" />
                      </a>

                      <a
                        href={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 transition"
                      >
                        YouTube <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Embedded Spotify Player */}
              {isActive && sourceMode === "spotify" && (
                <div className="pt-1">
                  <iframe
                    title={`Spotify - ${item.title}`}
                    src={`https://open.spotify.com/embed/track/${item.spotifyTrackId}?utm_source=generator&theme=0`}
                    width="100%"
                    height="80"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-xl border border-slate-800"
                  />
                </div>
              )}

              {/* Embedded YouTube Player */}
              {isActive && sourceMode === "youtube" && (
                <div className="pt-1">
                  <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 aspect-video">
                    <iframe
                      title={`YouTube - ${item.title}`}
                      src={`https://www.youtube.com/embed/${item.youtubeVideoId}?autoplay=1`}
                      width="100%"
                      height="100%"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
