declare module 'amqplib' {
  export interface Connection {
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): void;
    on(event: 'close', listener: () => void): void;
  }

  export interface Channel {
    prefetch(count: number): Promise<void>;
    assertExchange(exchange: string, type: string, options?: any): Promise<any>;
    assertQueue(queue: string, options?: any): Promise<any>;
    bindQueue(queue: string, source: string, pattern: string): Promise<any>;
    publish(exchange: string, routingKey: string, content: Buffer, options?: any): boolean;
    sendToQueue(queue: string, content: Buffer, options?: any): boolean;
    consume(queue: string, onMessage: (msg: ConsumeMessage | null) => void, options?: any): Promise<{ consumerTag: string }>;
    ack(message: ConsumeMessage): void;
    reject(message: ConsumeMessage, requeue?: boolean): void;
    cancel(consumerTag: string): Promise<void>;
    close(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): void;
    on(event: 'close', listener: () => void): void;
    on(event: 'drain', listener: () => void): void;
    once(event: 'drain', listener: () => void): void;
  }

  export interface ConsumeMessage {
    content: Buffer;
    properties: {
      messageId?: string;
      headers?: Record<string, any>;
      [key: string]: any;
    };
  }

  export function connect(url: string): Promise<Connection>;
}