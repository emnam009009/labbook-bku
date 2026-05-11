/**
 * Voice TypeScript types — Round 114
 *
 * Browser SpeechRecognition API types (không có sẵn trong TS lib.dom).
 */

export interface VoiceTranscribeResult {
  transcript: string;
  confidence: number;
  languageCode: string;
}

export type RecorderState = "idle" | "recording" | "processing";

export interface SpeechRecorderOptions {
  /** Timeout dài nhất khi recording (ms). Default 30000 (30s). */
  maxDurationMs?: number;
  /** Callback khi state thay đổi */
  onStateChange?: (state: RecorderState) => void;
  /** Callback khi có error */
  onError?: (error: Error) => void;
}

// ── speechSynthesis types — đã có trong lib.dom ──
// Chỉ helper types ở đây

export type TtsState = "idle" | "speaking" | "paused";

export interface TtsOptions {
  /** Ngôn ngữ ưu tiên (vd: "vi-VN", "en-US"). Default tự detect từ text. */
  languageCode?: string;
  /** Tốc độ đọc 0.5-2. Default 1. */
  rate?: number;
  /** Pitch 0-2. Default 1. */
  pitch?: number;
  /** Volume 0-1. Default 1. */
  volume?: number;
  /** Callback khi state thay đổi */
  onStateChange?: (state: TtsState) => void;
}
