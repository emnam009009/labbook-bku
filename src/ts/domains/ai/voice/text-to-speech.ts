/**
 * Text-to-Speech — Round 114
 *
 * Wraps browser native speechSynthesis API.
 * Uses vi-VN voice if available, falls back to en-US.
 *
 * Singleton pattern — only one TTS playing at a time.
 */

// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

import { TtsState, TtsOptions } from "./types";

// Cleanup any markdown/HTML before TTS
function cleanTextForSpeech(text: string): string {
  return (
    text
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, " (code block) ")
      .replace(/`([^`]+)`/g, "$1")
      // Remove markdown formatting
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      // Remove links - keep text only
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove images
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      // Math: $...$ và $$...$$
      .replace(/\$\$[\s\S]*?\$\$/g, " (công thức) ")
      .replace(/\$([^$]+)\$/g, "$1")
      // Tables: just remove pipes
      .replace(/\|/g, " ")
      // Multiple spaces
      .replace(/\s+/g, " ")
      .trim()
  );
}

class TextToSpeechService {
  private state: TtsState = "idle";
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private listeners: Set<(s: TtsState) => void> = new Set();
  private viVoice: SpeechSynthesisVoice | null = null;
  private enVoice: SpeechSynthesisVoice | null = null;
  private voicesReady = false;

  constructor() {
    if (this.isSupported()) {
      this.loadVoices();
      // Voices may load async on some browsers
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  getState(): TtsState {
    return this.state;
  }

  onStateChange(cb: (s: TtsState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setState(s: TtsState): void {
    this.state = s;
    this.listeners.forEach((cb) => {
      try {
        cb(s);
      } catch (e) {
        console.warn("[TTS] listener error:", e);
      }
    });
  }

  private loadVoices(): void {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;

    // Prefer vi-VN voices
    this.viVoice =
      voices.find((v) => v.lang === "vi-VN") ||
      voices.find((v) => v.lang.startsWith("vi")) ||
      null;

    this.enVoice =
      voices.find((v) => v.lang === "en-US") ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null;

    this.voicesReady = true;
  }

  /**
   * Speak text. Stops any current utterance.
   */
  speak(text: string, opts: TtsOptions = {}): void {
    if (!this.isSupported()) {
      console.warn("[TTS] Not supported");
      return;
    }

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    // Stop any current utterance
    this.stop();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = opts.rate ?? 1;
    utterance.pitch = opts.pitch ?? 1;
    utterance.volume = opts.volume ?? 1;

    // Auto-detect language from text or use option
    const lang = opts.languageCode || detectLanguage(cleanText);
    utterance.lang = lang;

    if (lang.startsWith("vi") && this.viVoice) {
      utterance.voice = this.viVoice;
    } else if (lang.startsWith("en") && this.enVoice) {
      utterance.voice = this.enVoice;
    }

    utterance.onstart = () => this.setState("speaking");
    utterance.onend = () => {
      this.currentUtterance = null;
      this.setState("idle");
      opts.onStateChange?.("idle");
    };
    utterance.onerror = (e) => {
      console.warn("[TTS] error:", e);
      this.currentUtterance = null;
      this.setState("idle");
      opts.onStateChange?.("idle");
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Stop current utterance.
   */
  stop(): void {
    if (!this.isSupported()) return;
    if (this.currentUtterance || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.setState("idle");
  }

  isSpeaking(): boolean {
    return this.state === "speaking";
  }
}

// Singleton instance
let _instance: TextToSpeechService | null = null;

export function getTts(): TextToSpeechService {
  if (!_instance) {
    _instance = new TextToSpeechService();
  }
  return _instance;
}

/**
 * Quick helper: detect Vietnamese vs English from text.
 * Returns "vi-VN" if Vietnamese characters detected, else "en-US".
 */
function detectLanguage(text: string): string {
  // Vietnamese diacritics
  if (/[ăâđêôơưĂÂĐÊÔƠƯàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i.test(text)) {
    return "vi-VN";
  }
  // Default to en-US
  return "en-US";
}

/**
 * Convenience: speak text with default settings.
 */
export function speakText(text: string, opts?: TtsOptions): void {
  getTts().speak(text, opts);
}

/**
 * Convenience: stop current TTS.
 */
export function stopTts(): void {
  getTts().stop();
}

/**
 * Check if any TTS is currently speaking.
 */
export function isTtsSpeaking(): boolean {
  return getTts().isSpeaking();
}
