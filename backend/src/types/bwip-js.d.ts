declare module 'bwip-js' {
  export interface BwipRenderOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: 'left' | 'center' | 'right';
    textsize?: number;
  }

  export function toBuffer(options: BwipRenderOptions): Promise<Buffer>;
}
