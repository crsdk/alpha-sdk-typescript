type SSEEventType =
  | "connected"
  | "disconnected"
  | "propertyChanged"
  | "warning"
  | "afStatus"
  | "downloadComplete"
  | "transferProgress"
  | "error"
  | "close";

type EventCallback<T = unknown> = (data: T) => void;

export class EventStream {
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<SSEEventType, Set<EventCallback>>();
  private callbackMap = new Map<EventCallback, EventCallback>();
  private nativeListenerMap = new Map<EventCallback, EventListener>();

  constructor(
    private readonly baseUrl: string,
    private readonly cameraId?: string,
  ) {}

  connect(): void {
    if (this.eventSource) return;

    const url = this.cameraId
      ? `${this.baseUrl}/api/cameras/${this.cameraId}/events`
      : `${this.baseUrl}/api/events`;

    this.eventSource = new EventSource(url);

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;
      this.emit("error", undefined);
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    };

    for (const [event, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        this.addNativeListener(event, callback);
      }
    }
  }

  on<T = unknown>(event: SSEEventType, callback: EventCallback<T>): this {
    const wrapped = (data: unknown) => callback(data as T);
    this.callbackMap.set(callback as EventCallback, wrapped);
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(wrapped);
    if (this.eventSource) {
      this.addNativeListener(event, wrapped);
    } else {
      this.connect();
    }
    return this;
  }

  once<T = unknown>(event: SSEEventType, callback: EventCallback<T>): this {
    const wrapper = ((data: T) => {
      this.off(event, wrapper);
      callback(data);
    }) as EventCallback<T>;
    return this.on(event, wrapper);
  }

  off<T = unknown>(event: SSEEventType, callback?: EventCallback<T>): this {
    if (!callback) {
      this.listeners.delete(event);
      return this;
    }

    const wrapped = this.callbackMap.get(callback as EventCallback);
    if (!wrapped) return this;

    this.listeners.get(event)?.delete(wrapped);
    this.callbackMap.delete(callback as EventCallback);

    const native = this.nativeListenerMap.get(wrapped);
    if (native && this.eventSource && event !== "error" && event !== "close") {
      this.eventSource.removeEventListener(event, native);
    }
    if (native) {
      this.nativeListenerMap.delete(wrapped);
    }
    return this;
  }

  close(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.nativeListenerMap.clear();
    this.emit("close", undefined);
    this.listeners.clear();
  }

  get connected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  private emit(event: SSEEventType, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch {}
    }
  }

  private addNativeListener(event: SSEEventType, callback: EventCallback): void {
    if (!this.eventSource || event === "error" || event === "close") return;

    const nativeListener: EventListener = (rawEvent: Event) => {
      const messageEvent = rawEvent as MessageEvent<string>;
      try {
        callback(JSON.parse(messageEvent.data));
      } catch {
        callback(messageEvent.data);
      }
    };

    this.nativeListenerMap.set(callback, nativeListener);
    this.eventSource.addEventListener(event, nativeListener);
  }
}
