// Stub declarations for 'qrcode' npm package.
// We only use QRCode.toDataURL() in services/qr-labels.ts.
// Add more methods here if needed.

declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    type?: string;
    quality?: number;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;

  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<HTMLCanvasElement>;

  export function toString(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;

  const QRCode: {
    toDataURL: typeof toDataURL;
    toCanvas: typeof toCanvas;
    toString: typeof toString;
  };

  export default QRCode;
}
