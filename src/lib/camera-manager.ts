import { AlphaSDKClient } from "@alpha-sdk/client";
import type { AlphaSDK } from "@alpha-sdk/client";
import { EventStream } from "./event-stream";

type SSEEventMap = {
  connected: { cameraId?: string; id?: string };
  disconnected: { cameraId?: string; id?: string; error?: string };
  propertyChanged: unknown;
  warning: unknown;
  afStatus: unknown;
  downloadComplete: unknown;
  transferProgress: { percent?: number };
  error: undefined;
  close: undefined;
};

type SSEEventType = keyof SSEEventMap;
type CameraState = "detected" | "connecting" | "connected" | "disconnected";

export interface ManagedCamera {
  info: CameraInfo;
  state: CameraState;
  reconnectAttempts: number;
}

export interface CameraManagerOptions {
  baseUrl?: string;
  pollInterval?: number;
  autoConnect?: boolean;
  connectionMode?: AlphaSDK.ConnectionMode;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface CameraManagerEventMap {
  "camera-found": { camera: CameraInfo };
  "camera-lost": { camera: CameraInfo };
  "camera-connecting": { cameraId: string };
  "camera-ready": { cameraId: string; camera: CameraInfo };
  "camera-disconnected": { cameraId: string; error?: string };
  "connection-failed": { cameraId: string; error: string; attempt: number };
  error: { message: string };
}

export interface PropertyResponse {
  success: boolean;
  message?: string;
  data?: {
    property: string;
    value: string;
    formatted: string;
    writable: string;
    available_values?: Array<{ value: string; formatted: string }>;
  };
}

export interface SaveInfoResponse {
  success: boolean;
  message?: string;
  data?: {
    path?: string;
    prefix?: string;
    startNo?: number;
  };
}

export interface SDCardFilesResponse {
  success: boolean;
  file_count: number;
  files: AlphaSDK.SdCardFile[];
}

export interface CameraEventStream {
  on<T extends SSEEventType>(event: T, callback: (data: SSEEventMap[T]) => void): this;
  off<T extends SSEEventType>(event: T, callback?: (data: SSEEventMap[T]) => void): this;
  once<T extends SSEEventType>(event: T, callback: (data: SSEEventMap[T]) => void): this;
  close(): void;
  readonly connected: boolean;
}

export interface BoundCamera {
  readonly id: string;
  readonly events: CameraEventStream;
  connect(req?: { mode?: AlphaSDK.ConnectionMode; reconnecting?: "on" | "off" }): Promise<AlphaSDK.CameraResponse>;
  disconnect(): Promise<AlphaSDK.CameraResponse>;
  getConnectionStatus(): Promise<AlphaSDK.ConnectionStatusResponse>;
  getProperty(name: string): Promise<PropertyResponse>;
  setProperty(name: string, req: { value: string } | string): Promise<AlphaSDK.CameraResponse>;
  getAllProperties(): Promise<AlphaSDK.GetAllPropertiesResponse>;
  triggerShutter(req?: { action?: AlphaSDK.ShutterRequestAction }): Promise<AlphaSDK.CameraResponse>;
  halfPress(): Promise<AlphaSDK.CameraResponse>;
  afShutter(): Promise<AlphaSDK.CameraResponse>;
  controlZoom(req: { direction: AlphaSDK.ZoomDirectionalRequestDirection; speed: AlphaSDK.ZoomDirectionalRequestSpeed }): Promise<AlphaSDK.CameraResponse>;
  stopZoom(): Promise<AlphaSDK.CameraResponse>;
  focusNearFar(req: { step: number }): Promise<AlphaSDK.CameraResponse>;
  toggleMovieRecording(): Promise<AlphaSDK.CameraResponse>;
  enableLiveView(): Promise<AlphaSDK.CameraResponse>;
  getLiveViewStatus(): Promise<AlphaSDK.GetLiveViewStatusResponse>;
  startLiveViewStream(): Promise<AlphaSDK.CameraResponse>;
  stopLiveViewStream(): Promise<AlphaSDK.CameraResponse>;
  getLiveViewFrame(): Promise<ArrayBuffer>;
  enableOSD(): Promise<AlphaSDK.CameraResponse>;
  disableOSD(): Promise<AlphaSDK.CameraResponse>;
  getOSDStatus(): Promise<AlphaSDK.GetOsdStatusResponse>;
  getOSDFrame(): Promise<ArrayBuffer>;
  listSDCardFiles(slot: 1 | 2): Promise<SDCardFilesResponse>;
  downloadSDCardFile(slot: 1 | 2, contentId: number, fileId: number): Promise<AlphaSDK.AsyncOperationResponse>;
  getSaveInfo(): Promise<SaveInfoResponse>;
  setSaveInfo(req: Omit<AlphaSDK.SaveInfoRequest, "cameraId">): Promise<AlphaSDK.CameraResponse>;
  listSettingsFiles(): Promise<AlphaSDK.SettingsFileListResponse>;
}

interface CameraEntry {
  info: AlphaSDK.CameraInfo;
  state: CameraState;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectPromise: Promise<void> | null;
}

type EventCallback<T extends keyof CameraManagerEventMap> = (data: CameraManagerEventMap[T]) => void;

export class CameraManager {
  private readonly client: AlphaSDKClient;
  private readonly cameraStreams = new Map<string, EventStream>();
  private readonly boundCameras = new Map<string, BoundCamera>();
  private readonly cameras = new Map<string, CameraEntry>();
  private readonly listeners = new Map<keyof CameraManagerEventMap, Set<(data: unknown) => void>>();
  private readonly callbackMap = new Map<Function, (data: unknown) => void>();
  private readonly connectResolvers = new Map<string, () => void>();
  private readonly baseUrl: string;
  private readonly pollInterval: number;
  private readonly autoConnect: boolean;
  private readonly connectionMode: AlphaSDK.ConnectionMode;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;

  private started = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private globalStream: EventStream | null = null;
  private isPolling = false;

  constructor(options: CameraManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:8080").replace(/\/$/, "");
    this.pollInterval = options.pollInterval ?? 5000;
    this.autoConnect = options.autoConnect ?? true;
    this.connectionMode = options.connectionMode ?? "remote";
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.client = new AlphaSDKClient({ baseUrl: this.baseUrl });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.globalStream = new EventStream(this.baseUrl);
    this.globalStream.on("connected", (data) => this.onSSEConnected(data));
    this.globalStream.on("disconnected", (data) => this.onSSEDisconnected(data));
    this.globalStream.on("error", () => this.emit("error", { message: "SSE connection error" }));
    this.globalStream.connect();

    await this.poll();
    if (this.pollInterval > 0) {
      this.pollTimer = setInterval(() => {
        void this.poll();
      }, this.pollInterval);
    }
  }

  close(): void {
    this.started = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.globalStream?.close();
    this.globalStream = null;
    for (const stream of this.cameraStreams.values()) {
      stream.close();
    }
    this.cameraStreams.clear();
    this.boundCameras.clear();
    for (const entry of this.cameras.values()) {
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
      }
    }
    this.cameras.clear();
    this.connectResolvers.clear();
    this.listeners.clear();
    this.callbackMap.clear();
  }

  getCameras(): ManagedCamera[] {
    return Array.from(this.cameras.values()).map((entry) => ({
      info: entry.info,
      state: entry.state,
      reconnectAttempts: entry.reconnectAttempts,
    }));
  }

  camera(cameraId: string): BoundCamera {
    const existing = this.boundCameras.get(cameraId);
    if (existing) return existing;

    const bound: BoundCamera = {
      id: cameraId,
      get events() {
        return thisManager.events(cameraId);
      },
      connect: async (req) =>
        this.client.cameras.connect({
          cameraId,
          mode: req?.mode ?? this.connectionMode,
          reconnecting: req?.reconnecting ?? "off",
        }),
      disconnect: async () => this.client.cameras.disconnect({ cameraId }),
      getConnectionStatus: async () => this.client.cameras.getConnectionStatus({ cameraId }),
      getProperty: async (name) =>
        this.mapPropertyResponse(
          await this.client.properties.get({ cameraId, propertyName: name as AlphaSDK.PropertyName }),
        ),
      setProperty: async (name, req) =>
        this.client.properties.set({
          cameraId,
          propertyName: name as AlphaSDK.PropertyName,
          value: typeof req === "string" ? req : req.value,
        }),
      getAllProperties: async () => this.client.properties.getAll({ cameraId }),
      triggerShutter: async (req) => this.client.actions.shutter({ cameraId, action: req?.action }),
      halfPress: async () => this.client.actions.halfPress({ cameraId }),
      afShutter: async () => this.client.actions.afShutter({ cameraId }),
      controlZoom: async (req) => this.client.actions.zoom({ cameraId, body: req }),
      stopZoom: async () =>
        this.client.fetch(`/api/cameras/${cameraId}/actions/zoom`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speed: 0 }),
        }).then(async (response) => response.json() as Promise<AlphaSDK.CameraResponse>),
      focusNearFar: async (req) => this.client.actions.focusNearFar({ cameraId, step: req.step }),
      toggleMovieRecording: async () => this.client.actions.movieRec({ cameraId }),
      enableLiveView: async () => this.client.liveView.enable({ cameraId }),
      getLiveViewStatus: async () => this.client.liveView.getStatus({ cameraId }),
      startLiveViewStream: async () => this.client.liveView.start({ cameraId }),
      stopLiveViewStream: async () => this.client.liveView.stop({ cameraId }),
      getLiveViewFrame: async () => {
        const frame = await this.client.liveView.getFrame({ cameraId });
        return frame.arrayBuffer();
      },
      enableOSD: async () => this.client.liveView.enableOsd({ cameraId }),
      disableOSD: async () => this.client.liveView.disableOsd({ cameraId }),
      getOSDStatus: async () => this.client.liveView.getOsdStatus({ cameraId }),
      getOSDFrame: async () => {
        const frame = await this.client.liveView.getOsdFrame({ cameraId });
        return frame.arrayBuffer();
      },
      listSDCardFiles: async (slot) => this.mapSdCardListResponse(await this.client.sdCard.list({ cameraId, slotNumber: slot })),
      downloadSDCardFile: async (slot, contentId, fileId) =>
        this.client.sdCard.download({ cameraId, slotNumber: slot, contentId, fileId, body: {} }),
      getSaveInfo: async () => this.mapSaveInfoResponse(await this.client.settings.getSaveInfo({ cameraId })),
      setSaveInfo: async (req) => this.client.settings.setSaveInfo({ cameraId, ...req }),
      listSettingsFiles: async () => this.client.settings.listFiles({ cameraId }),
    };

    const thisManager = this;
    this.boundCameras.set(cameraId, bound);
    return bound;
  }

  events(cameraId: string): CameraEventStream {
    let stream = this.cameraStreams.get(cameraId);
    if (!stream) {
      stream = new EventStream(this.baseUrl, cameraId);
      this.cameraStreams.set(cameraId, stream);
      stream.connect();
    }
    return stream;
  }

  async connect(id: string, opts?: { mode?: AlphaSDK.ConnectionMode; reconnecting?: "on" | "off" }): Promise<void> {
    const entry = this.cameras.get(id);
    if (!entry) throw new Error(`Camera ${id} not found`);
    if (entry.state === "connected") return;
    if (entry.connectPromise) return entry.connectPromise;

    entry.connectPromise = this.doConnect(entry, opts);
    try {
      await entry.connectPromise;
    } finally {
      entry.connectPromise = null;
    }
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.cameras.get(id);
    if (!entry) throw new Error(`Camera ${id} not found`);
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    entry.reconnectAttempts = 0;
    if (entry.state !== "connected" && entry.state !== "connecting") return;
    entry.state = "disconnected";
    this.emit("camera-disconnected", { cameraId: id });
    await this.client.cameras.disconnect({ cameraId: id });
  }

  on<T extends keyof CameraManagerEventMap>(event: T, callback: EventCallback<T>): this {
    const wrapped = (data: unknown) => callback(data as CameraManagerEventMap[T]);
    this.callbackMap.set(callback, wrapped);
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(wrapped);
    return this;
  }

  off<T extends keyof CameraManagerEventMap>(event: T, callback?: EventCallback<T>): this {
    if (!callback) {
      this.listeners.delete(event);
      return this;
    }
    const wrapped = this.callbackMap.get(callback);
    if (!wrapped) return this;
    this.listeners.get(event)?.delete(wrapped);
    this.callbackMap.delete(callback);
    return this;
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      await this.doPoll();
    } finally {
      this.isPolling = false;
    }
  }

  private async doPoll(): Promise<void> {
    try {
      const resp = await this.client.cameras.list();
      const currentIds = new Set<string>();

      for (const camera of resp.cameras) {
        currentIds.add(camera.id);
        const existing = this.cameras.get(camera.id);

        if (!existing) {
          const entry: CameraEntry = {
            info: camera,
            state: camera.connected ? "connected" : "detected",
            reconnectAttempts: 0,
            reconnectTimer: null,
            connectPromise: null,
          };
          this.cameras.set(camera.id, entry);
          this.emit("camera-found", { camera });
          if (camera.connected) {
            void this.ensureReady(camera.id, camera);
          } else if (this.autoConnect) {
            void this.connect(camera.id).catch(() => {});
          }
          continue;
        }

        existing.info = camera;
        if (camera.connected && existing.state === "detected") {
          existing.state = "connected";
          void this.ensureReady(camera.id, camera);
        }
      }

      for (const [id, entry] of this.cameras) {
        if (currentIds.has(id)) continue;
        if (entry.reconnectTimer) {
          clearTimeout(entry.reconnectTimer);
        }
        const stream = this.cameraStreams.get(id);
        if (stream) {
          stream.close();
          this.cameraStreams.delete(id);
        }
        this.boundCameras.delete(id);
        this.cameras.delete(id);
        this.emit("camera-lost", { camera: entry.info });
      }
    } catch (error) {
      this.emit("error", {
        message: `Poll failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private onSSEConnected(data: unknown): void {
    const payload = data as SSEEventMap["connected"];
    const cameraId = payload?.cameraId ?? payload?.id;
    if (!cameraId) return;
    const entry = this.cameras.get(cameraId);
    if (!entry) return;

    entry.state = "connected";
    entry.reconnectAttempts = 0;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }

    const resolver = this.connectResolvers.get(cameraId);
    if (resolver) {
      this.connectResolvers.delete(cameraId);
      resolver();
    } else {
      void this.ensureReady(cameraId, entry.info);
    }
  }

  private onSSEDisconnected(data: unknown): void {
    const payload = data as SSEEventMap["disconnected"];
    const cameraId = payload?.id ?? payload?.cameraId;
    if (!cameraId) return;
    const entry = this.cameras.get(cameraId);
    if (!entry) return;

    const wasConnected = entry.state === "connected";
    entry.state = "disconnected";
    const error = payload.error && payload.error !== "0x0" ? payload.error : undefined;
    this.emit("camera-disconnected", { cameraId, error });

    if (wasConnected && this.autoReconnect && this.started) {
      this.scheduleReconnect(entry, cameraId);
    }
  }

  private async ensureReady(cameraId: string, camera: AlphaSDK.CameraInfo): Promise<void> {
    if (this.connectionMode === "contents") {
      this.emit("camera-ready", { cameraId, camera });
      return;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await this.client.properties.setPriorityKey({ cameraId, setting: "pc-remote" });
        this.emit("camera-ready", { cameraId, camera });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    this.emit("camera-ready", { cameraId, camera });
  }

  private async doConnect(entry: CameraEntry, opts?: { mode?: AlphaSDK.ConnectionMode; reconnecting?: "on" | "off" }): Promise<void> {
    const cameraId = entry.info.id;
    entry.state = "connecting";
    entry.reconnectAttempts += 1;
    this.emit("camera-connecting", { cameraId });

    try {
      await this.client.cameras.connect({
        cameraId,
        mode: opts?.mode ?? this.connectionMode,
        reconnecting: opts?.reconnecting ?? "off",
      });
      await this.waitForSSEConnected(cameraId, 30000);
      entry.state = "connected";
      entry.reconnectAttempts = 0;
      void this.ensureReady(cameraId, entry.info);
    } catch (error) {
      this.connectResolvers.delete(cameraId);
      entry.state = "detected";
      this.emit("connection-failed", {
        cameraId,
        error: error instanceof Error ? error.message : String(error),
        attempt: entry.reconnectAttempts,
      });
      throw error;
    }
  }

  private waitForSSEConnected(cameraId: string, timeoutMs: number): Promise<void> {
    const entry = this.cameras.get(cameraId);
    if (entry?.state === "connected") return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.connectResolvers.delete(cameraId);
        reject(new Error(`Camera ${cameraId} connection timed out waiting for SSE confirmation (${timeoutMs}ms)`));
      }, timeoutMs);

      this.connectResolvers.set(cameraId, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private scheduleReconnect(entry: CameraEntry, cameraId: string): void {
    if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("connection-failed", {
        cameraId,
        error: "Max reconnect attempts reached",
        attempt: entry.reconnectAttempts,
      });
      return;
    }

    const delay = Math.min((entry.reconnectAttempts + 1) * 2000, 30000);
    entry.reconnectTimer = setTimeout(async () => {
      entry.reconnectTimer = null;
      if (!this.started || entry.state === "connected") return;
      try {
        await this.client.cameras.disconnect({ cameraId });
      } catch {}
      entry.state = "detected";
      void this.connect(cameraId).catch(() => {});
    }, delay);
  }

  private emit<T extends keyof CameraManagerEventMap>(event: T, data: CameraManagerEventMap[T]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch {}
    }
  }

  private mapPropertyResponse(response: AlphaSDK.GetPropertyResponse): PropertyResponse {
    return {
      success: response.success,
      message: response.message,
      data: response.data
        ? {
            property: response.data.property,
            value: response.data.value,
            formatted: response.data.formatted,
            writable: response.data.writable ? "true" : "false",
            available_values: response.data.available_values?.map((value: AlphaSDK.AvailableValue) => ({
              value: value.value,
              formatted: value.formatted,
            })),
          }
        : undefined,
    };
  }

  private mapSaveInfoResponse(response: AlphaSDK.GetSaveInfoResponse): SaveInfoResponse {
    return {
      success: response.success,
      message: response.message,
      data: response.data
        ? {
            path: response.data.path,
            prefix: response.data.prefix,
            startNo: response.data.startNo,
          }
        : undefined,
    };
  }

  private mapSdCardListResponse(response: AlphaSDK.SdCardFileListResponse): SDCardFilesResponse {
    return {
      success: response.success,
      file_count: response.file_count,
      files: response.files,
    };
  }
}

export type CameraInfo = AlphaSDK.CameraInfo;
export type SDCardFile = AlphaSDK.SdCardFile;
