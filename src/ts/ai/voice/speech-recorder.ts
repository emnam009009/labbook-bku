/**
 * Speech Recorder — Round 114
 *
 * Wraps MediaRecorder API to capture mic audio.
 * Sends recorded audio to speechProxy Cloud Function for transcription.
 *
 * Flow:
 *   start() → request mic permission → MediaRecorder begins
 *   stop() → finalize blob → POST to speechProxy → return transcript
 *
 * Auto-stops after maxDurationMs to prevent runaway recording.
 */

// @ts-nocheck

import {
  RecorderState,
  SpeechRecorderOptions,
  VoiceTranscribeResult,
} from "./types";

const SPEECH_PROXY_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/speechProxy";

const DEFAULT_MAX_DURATION = 30000; // 30s

export class SpeechRecorder {
  private state: RecorderState = "idle";
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private autoStopTimer: number | null = null;
  private opts: SpeechRecorderOptions;

  constructor(opts: SpeechRecorderOptions = {}) {
    this.opts = {
      maxDurationMs: DEFAULT_MAX_DURATION,
      ...opts,
    };
  }

  getState(): RecorderState {
    return this.state;
  }

  /**
   * Start recording. Resolves when MediaRecorder.start() is called.
   * Throws if permission denied or recorder already active.
   */
  async start(): Promise<void> {
    if (this.state !== "idle") {
      throw new Error("Recorder is busy");
    }

    // Request mic permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      });
    } catch (e: any) {
      const errMsg =
        e.name === "NotAllowedError"
          ? "Bạn cần cho phép truy cập microphone"
          : "Không thể truy cập microphone: " + (e.message || e.name);
      this.opts.onError?.(new Error(errMsg));
      throw new Error(errMsg);
    }

    this.stream = stream;
    this.audioChunks = [];

    // Pick best supported codec
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    recorder.onerror = (e: any) => {
      console.error("[SpeechRecorder] error:", e);
      this.opts.onError?.(new Error("Recording error"));
      this.cleanup();
    };

    this.mediaRecorder = recorder;
    recorder.start(); // Start
    this.setState("recording");

    // Auto-stop after max duration
    this.autoStopTimer = window.setTimeout(() => {
      console.warn("[SpeechRecorder] Auto-stop after max duration");
      this.stop();
    }, this.opts.maxDurationMs!);
  }

  /**
   * Stop recording, send to speechProxy, return transcript.
   * Returns null if no audio was captured.
   */
  async stop(languageCodes?: string[]): Promise<VoiceTranscribeResult | null> {
    if (this.state !== "recording" || !this.mediaRecorder) {
      return null;
    }

    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    this.setState("processing");

    // Wait for stop event to capture final chunks
    const blob = await new Promise<Blob>((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const mimeType =
          this.mediaRecorder!.mimeType || "audio/webm";
        const finalBlob = new Blob(this.audioChunks, { type: mimeType });
        resolve(finalBlob);
      };
      this.mediaRecorder!.stop();
    });

    this.cleanup();

    if (blob.size === 0) {
      this.setState("idle");
      return null;
    }

    // Send to speechProxy
    try {
      const result = await this.transcribe(blob, languageCodes);
      this.setState("idle");
      return result;
    } catch (e: any) {
      this.setState("idle");
      this.opts.onError?.(e);
      throw e;
    }
  }

  /**
   * Cancel recording without transcribing.
   */
  cancel(): void {
    if (this.state !== "recording") return;
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null; // Don't trigger transcribe
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.cleanup();
    this.setState("idle");
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private setState(s: RecorderState): void {
    this.state = s;
    this.opts.onStateChange?.(s);
  }

  private async transcribe(
    blob: Blob,
    languageCodes?: string[]
  ): Promise<VoiceTranscribeResult> {
    // Convert Blob → base64
    const audioBase64 = await blobToBase64(blob);

    // Get Firebase Auth token
    const auth = (window as any).currentAuth;
    if (!auth?.user?.getIdToken) {
      throw new Error("Not authenticated");
    }
    const idToken = await auth.user.getIdToken();

    const response = await fetch(SPEECH_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type,
        languageCodes: languageCodes || ["vi-VN", "en-US"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${errText.slice(0, 200)}`
      );
    }

    const data = await response.json();
    return {
      transcript: data.transcript || "",
      confidence: data.confidence || 0,
      languageCode: data.languageCode || "vi-VN",
    };
  }
}

// ── Helpers ──

function pickSupportedMimeType(): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip "data:audio/webm;base64," prefix
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if browser supports voice recording.
 */
export function isVoiceRecordingSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}
