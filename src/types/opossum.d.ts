declare module 'opossum' {
  export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    name?: string;
    group?: string;
    rollingPercentilesEnabled?: boolean;
    capacity?: number;
    errorFilter?: (error: any) => boolean;
    volumeThreshold?: number;
  }

  export default class CircuitBreaker {
    constructor(action: (...args: any[]) => Promise<any>, options?: CircuitBreakerOptions);

    fire(...args: any[]): Promise<any>;
    fallback(func: (...args: any[]) => any): CircuitBreaker;
    on(event: string, handler: (...args: any[]) => void): void;
    open(): void;
    close(): void;
    disable(): void;
    enable(): void;

    readonly name: string;
    readonly group: string;
    readonly pendingClose: boolean;
    readonly closed: boolean;
    readonly opened: boolean;
    readonly halfOpen: boolean;
  }
}
