"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  CameraManager,
  type CameraInfo,
  type ManagedCamera,
  type PropertyResponse,
  type SDCardFile,
  type BoundCamera,
} from "@/lib/camera-manager";

let manager: CameraManager | null = null;

/** Get the bound camera accessor for the given ID. Throws if manager is null. */
function cam(id: string): BoundCamera {
  return manager!.camera(id);
}

// ---------------------------------------------------------------------------
// Property config
// ---------------------------------------------------------------------------

// UI type: "select" (dropdown), "toggle" (on/off), "range" (slider), "readonly" (display only)
type PropUI = "select" | "toggle" | "range" | "readonly";
type PropCategory = "exposure" | "capture" | "color" | "video" | "system";

const PROPERTIES: { name: string; label: string; ui?: PropUI; category: PropCategory }[] = [
  // Core
  { name: "exposure-program-mode", label: "Exposure Mode", category: "exposure" },
  { name: "iso", label: "ISO", category: "exposure" },
  { name: "aperture", label: "Aperture", category: "exposure" },
  { name: "shutter-speed", label: "Shutter Speed", category: "exposure" },
  { name: "white-balance", label: "White Balance", category: "color" },
  { name: "focus-mode", label: "Focus Mode", category: "capture" },
  { name: "focus-area", label: "Focus Area", category: "capture" },
  { name: "drive-mode", label: "Drive Mode", category: "capture" },
  { name: "file-format", label: "File Format", category: "capture" },
  { name: "image-quality", label: "Image Quality", category: "capture" },
  { name: "raw-compression", label: "RAW Compression", category: "capture" },
  { name: "still-image-store-destination", label: "Save Destination", category: "capture" },
  // Exposure
  { name: "exposure-compensation", label: "Exposure Comp", category: "exposure" },
  { name: "metering-mode", label: "Metering Mode", category: "exposure" },
  { name: "ae-lock", label: "AE Lock", ui: "toggle", category: "exposure" },
  // Flash
  { name: "flash-mode", label: "Flash Mode", category: "capture" },
  { name: "flash-compensation", label: "Flash Comp", category: "capture" },
  { name: "wireless-flash", label: "Wireless Flash", ui: "toggle", category: "capture" },
  // Shutter & Silent
  { name: "shutter-type", label: "Shutter Type", category: "capture" },
  { name: "shutter-mode", label: "Shutter Mode", category: "capture" },
  { name: "shutter-angle", label: "Shutter Angle", category: "capture" },
  { name: "silent-mode", label: "Silent Mode", ui: "toggle", category: "capture" },
  // Image
  { name: "image-size", label: "Image Size", category: "capture" },
  { name: "aspect-ratio", label: "Aspect Ratio", category: "capture" },
  { name: "color-space", label: "Color Space", category: "color" },
  { name: "dro", label: "DRO", category: "color" },
  { name: "high-iso-nr", label: "High ISO NR", category: "capture" },
  { name: "long-exposure-nr", label: "Long Exposure NR", ui: "toggle", category: "capture" },
  // White Balance
  { name: "awb-lock", label: "AWB Lock", ui: "toggle", category: "color" },
  { name: "white-balance-color-temp", label: "Color Temp (K)", ui: "range", category: "color" },
  // Creative & Video
  { name: "creative-look", label: "Creative Look", category: "color" },
  { name: "picture-profile", label: "Picture Profile", category: "video" },
  { name: "flicker-less-shooting", label: "Flicker-less", ui: "toggle", category: "capture" },
  { name: "image-stabilization", label: "Stabilization (Still)", ui: "toggle", category: "capture" },
  { name: "movie-stabilization", label: "Stabilization (Movie)", category: "video" },
  { name: "zoom-setting", label: "Zoom Setting", category: "capture" },
  { name: "aps-c-s35", label: "APS-C / S35 Crop", category: "video" },
  // Video
  { name: "movie-file-format", label: "Movie Format", category: "video" },
  { name: "movie-recording-setting", label: "Movie Quality", category: "video" },
  { name: "movie-recording-frame-rate", label: "Movie Frame Rate", category: "video" },
  // Audio
  { name: "audio-recording", label: "Audio Recording", ui: "toggle", category: "video" },
  { name: "audio-input-master-level", label: "Audio Level", ui: "range", category: "video" },
  // Timecode
  { name: "timecode-format", label: "TC Format", category: "video" },
  { name: "timecode-run", label: "TC Run", category: "video" },
  { name: "timecode-make", label: "TC Make", category: "video" },
  // CineEI
  { name: "exposure-index", label: "Exposure Index", category: "video" },
  { name: "base-iso", label: "Base ISO", category: "video" },
  { name: "movie-shooting-mode", label: "Movie Shooting Mode", category: "video" },
  { name: "movie-shooting-mode-color-gamut", label: "Color Gamut", category: "video" },
  { name: "embed-lut-file", label: "Embed LUT", ui: "toggle", category: "video" },
  { name: "base-look-value", label: "Base Look", category: "video" },
  { name: "shooting-enable", label: "Shooting Enable", ui: "toggle", category: "system" },
  { name: "image-id-num-setting", label: "Image ID Num", ui: "toggle", category: "system" },
];

// Human-readable labels for SDK enum values that the server returns as raw numbers
const VALUE_LABELS: Record<string, Record<string, string>> = {
  "metering-mode": { "0x5": "Multi", "0x6": "Center", "0x7": "Spot (Standard)", "0x8": "Spot (Large)", "0x9": "Highlight Weighted", "0xa": "Average" },
  "ae-lock": { "0x1": "Off", "0x2": "On" },
  "awb-lock": { "0x1": "Off", "0x2": "On" },
  "wireless-flash": { "0x0": "Off", "0x1": "On" },
  "silent-mode": { "0x1": "Off", "0x2": "On" },
  "flicker-less-shooting": { "0x1": "Off", "0x2": "On" },
  "long-exposure-nr": { "0x1": "Off", "0x2": "On" },
  "audio-recording": { "0x0": "Off", "0x1": "On" },
  "embed-lut-file": { "0x1": "Off", "0x2": "On" },
  "image-stabilization": { "0x1": "Off", "0x2": "On" },
  "shutter-type": { "0x1": "Auto", "0x2": "Mechanical", "0x3": "Electronic" },
  "shutter-mode": { "0x1": "Speed", "0x2": "Angle" },
  "image-size": { "0x1": "L", "0x2": "M", "0x3": "S" },
  "aspect-ratio": { "0x1": "3:2", "0x2": "16:9", "0x3": "4:3", "0x4": "1:1" },
  "color-space": { "0x1": "sRGB", "0x201": "AdobeRGB" },
  "high-iso-nr": { "0x1": "Off", "0x2": "Low", "0x3": "Normal", "0x4": "High" },
  "flash-mode": { "0x1": "Auto", "0x2": "Off", "0x3": "Fill", "0x4": "Ext Sync", "0x5": "Slow Sync", "0x6": "Rear Sync" },
  "zoom-setting": { "0x1": "Optical Only", "0x2": "Smart Zoom", "0x3": "Clear Image Zoom", "0x4": "Digital Zoom" },
  "aps-c-s35": { "0x1": "Off", "0x2": "On", "0x3": "Auto" },
  "creative-look": { "0x1": "ST", "0x3": "NT", "0x5": "VV", "0x7": "FL", "0x9": "IN", "0xb": "SH" },
  "picture-profile": { "0x0": "Off", "0x1": "PP1", "0x2": "PP2", "0x3": "PP3", "0x4": "PP4", "0x5": "PP5", "0x6": "PP6", "0x7": "PP7", "0x8": "PP8", "0x9": "PP9", "0xa": "PP10", "0xb": "PP11" },
  "movie-stabilization": { "0x1": "Off", "0x2": "Standard", "0x3": "Active", "0x4": "Dynamic Active" },
  "timecode-format": { "0x1": "DF", "0x2": "NDF" },
  "timecode-run": { "0x1": "Rec Run", "0x2": "Free Run" },
  "timecode-make": { "0x1": "Preset", "0x2": "Regenerate" },
  "movie-shooting-mode": { "0x1": "Off", "0x301": "CineEI", "0x302": "CineEI Quick", "0x401": "Custom", "0x501": "Flexible ISO" },
  "movie-shooting-mode-color-gamut": { "0x1": "S-Gamut3.Cine", "0x2": "S-Gamut3" },
};

/** Get human-readable label for a property value */
function formatValue(propName: string, hexValue: string, serverFormatted: string): string {
  const map = VALUE_LABELS[propName];
  if (map) {
    // Try exact match first, then lowercase
    const label = map[hexValue] || map[hexValue.toLowerCase()];
    if (label) return label;
  }
  // For known formatted values from the server (ISO, aperture, shutter speed, etc.) use as-is
  if (serverFormatted && serverFormatted !== hexValue) return serverFormatted;
  return hexValue;
}

/** Check if a property looks like a range (3 values: min, max, step) */
function isRangeProperty(propName: string): boolean {
  return propName === "white-balance-color-temp" || propName === "audio-input-master-level";
}

/** Check if a toggle property is currently "on" */
function isToggleOn(hexValue: string, propName: string): boolean {
  const offValues = ["0x0", "0x1"];
  // Some toggles use 0x0=off, others use 0x1=off
  if (propName === "audio-recording" || propName === "wireless-flash") return hexValue !== "0x0";
  if (propName === "shooting-enable") return hexValue === "0x1";
  return !offValues.includes(hexValue);
}

const CONNECTION_MODE = "remote-transfer" as const;
const AF_SHUTTER_HOLD_MS = 450;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  time: string;
  type: string;
  message: string;
}

const SETTINGS_CATEGORIES: { key: PropCategory; label: string }[] = [
  { key: "exposure", label: "Exposure" },
  { key: "capture", label: "Capture" },
  { key: "color", label: "Color" },
  { key: "video", label: "Video" },
  { key: "system", label: "System" },
];

type LeftRailTab = "cameras" | "events";
type EventFilter = "all" | "activity" | "transfer" | "errors";

function matchesEventFilter(type: string, filter: EventFilter): boolean {
  switch (filter) {
    case "errors":
      return type === "error" || type === "warning";
    case "transfer":
      return type === "download";
    case "activity":
      return type === "info" || type === "action" || type === "set";
    case "all":
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// PropertySelect
// ---------------------------------------------------------------------------

function PropertySelect({
  property,
  propName,
  disabled,
  onValueChange,
}: {
  property: PropertyResponse | null;
  propName: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  const data = property?.data;
  const isReadOnly = data?.writable === "false";
  const hasOptions = (data?.available_values?.length ?? 0) > 0;
  return (
    <Select
      key={data?.value || "empty"}
      defaultValue={data?.value}
      onValueChange={onValueChange}
      disabled={disabled || isReadOnly || !hasOptions}
    >
      <SelectTrigger>
        <SelectValue placeholder={data ? formatValue(propName, data.value, data.formatted) : "\u2014"} />
      </SelectTrigger>
      <SelectContent>
        {data?.available_values
          ?.filter((v, i, arr) => arr.findIndex((x) => x.value === v.value) === i)
          .map((v, i) => (
          <SelectItem key={`${v.value}-${i}`} value={v.value}>
            {formatValue(propName, v.value, v.formatted)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PropertyToggle({
  property,
  propName,
  disabled,
  onToggle,
}: {
  property: PropertyResponse | null;
  propName: string;
  disabled: boolean;
  onToggle: (newValue: string) => void;
}) {
  const data = property?.data;
  const isReadOnly = data?.writable === "false";
  const on = data ? isToggleOn(data.value, propName) : false;
  const vals = data?.available_values || [];

  const toggle = () => {
    if (!data || vals.length === 0) return;
    const offVal = vals.find((v) => !isToggleOn(v.value, propName))?.value;
    const onVal = vals.find((v) => isToggleOn(v.value, propName))?.value;
    onToggle(on ? (offVal || data.value) : (onVal || data.value));
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        {data ? formatValue(propName, data.value, data.formatted) : "\u2014"}
      </span>
      <Switch
        checked={on}
        onCheckedChange={toggle}
        disabled={disabled || isReadOnly || vals.length === 0}
      />
    </div>
  );
}

function PropertyRange({
  property,
  propName,
  disabled,
  onCommit,
}: {
  property: PropertyResponse | null;
  propName: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const data = property?.data;
  const isReadOnly = data?.writable === "false";
  const vals = data?.available_values || [];

  // Range: 3 values = [min, max, step]
  const isRange = vals.length === 3;
  const min = isRange ? parseInt(vals[0].formatted) : 0;
  const max = isRange ? parseInt(vals[1].formatted) : 100;
  const step = isRange ? parseInt(vals[2].formatted) : 1;
  const current = data ? parseInt(data.formatted) : min;

  const [localValue, setLocalValue] = useState(current);

  // Sync when property changes externally
  useEffect(() => {
    if (data) setLocalValue(parseInt(data.formatted));
  }, [data?.value]);

  const suffix = propName === "white-balance-color-temp" ? "K" : "";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium tabular-nums">{localValue}{suffix}</span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={disabled || isReadOnly || !isRange || localValue <= min}
            onClick={() => {
              const v = Math.max(min, localValue - step);
              setLocalValue(v);
              onCommit(`0x${v.toString(16)}`);
            }}
          >
            −
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={disabled || isReadOnly || !isRange || localValue >= max}
            onClick={() => {
              const v = Math.min(max, localValue + step);
              setLocalValue(v);
              onCommit(`0x${v.toString(16)}`);
            }}
          >
            +
          </Button>
        </div>
      </div>
      {isRange && (
        <Slider
          min={min}
          max={max}
          step={step}
          value={[localValue]}
          onValueChange={(v) => setLocalValue(v[0])}
          onValueCommit={(v) => onCommit(`0x${v[0].toString(16)}`)}
          disabled={disabled || isReadOnly}
        />
      )}
      {isRange && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{min}{suffix}</span>
          <span>{max}{suffix}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HoldButton — fires onPressStart on pointerdown, onPressEnd on pointerup/leave
// ---------------------------------------------------------------------------

function HoldButton({
  onPressStart,
  onPressEnd,
  disabled,
  children,
  className,
  variant = "outline",
  size = "sm",
}: {
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: "outline" | "default" | "destructive" | "secondary" | "ghost" | "link";
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const pressing = useRef(false);
  const start = () => {
    if (disabled || pressing.current) return;
    pressing.current = true;
    onPressStart();
  };
  const end = () => {
    if (!pressing.current) return;
    pressing.current = false;
    onPressEnd();
  };
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      className={className}
    >
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Home() {
  // --- State ---
  const [serverStatus, setServerStatus] = useState<"starting" | "running" | "error">("starting");
  const [serverError, setServerError] = useState<string>("");
  const [managedCameras, setManagedCameras] = useState<ManagedCamera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [properties, setProperties] = useState<Record<string, PropertyResponse | null>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [osdEnabled, setOsdEnabled] = useState(false);
  const [savePath, setSavePath] = useState<string>("");
  const [savePathInput, setSavePathInput] = useState<string>("");
  const [imageIdStringInput, setImageIdStringInput] = useState<string>("");
  const [imageIdStringCurrent, setImageIdStringCurrent] = useState<string>("");
  const [imageIdNumInput, setImageIdNumInput] = useState<string>("");
  const [imageIdNumCurrent, setImageIdNumCurrent] = useState<string>("");
  const [imageIdMaxLength, setImageIdMaxLength] = useState<number>(64);

  // Derived state
  const selectedMC = managedCameras.find((c) => c.info.id === selectedCamera);
  const connected = selectedMC?.state === "connected";

  // --- Start camera server on mount, create CameraManager ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/server", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "started" || data.status === "already_running") {
          manager = new CameraManager({
            baseUrl: `http://localhost:${data.port}`,
            autoConnect: true,
            connectionMode: CONNECTION_MODE,
            pollInterval: 3000,
            autoReconnect: true,
          });
          manager.start();
          setServerStatus("running");
        } else {
          setServerStatus("error");
          setServerError(data.message || "Unknown error");
        }
      } catch (e: any) {
        if (!cancelled) {
          setServerStatus("error");
          setServerError(e.message);
        }
      }
    })();
    return () => {
      cancelled = true;
      manager?.close();
      manager = null;
    };
  }, []);

  // SD Card state
  const [sdSlot, setSdSlot] = useState<1 | 2>(1);
  const [sdFiles, setSdFiles] = useState<SDCardFile[]>([]);
  const [sdSelected, setSdSelected] = useState<Set<string>>(new Set());
  const [sdLoading, setSdLoading] = useState(false);

  // Focus position slider
  const [focusPosition, setFocusPosition] = useState<number>(0);

  // Battery, recording state, media
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaSlots, setMediaSlots] = useState<{ slot1Photos: string; slot1Time: string; slot2Photos: string; slot2Time: string }>({ slot1Photos: "-", slot1Time: "-", slot2Photos: "-", slot2Time: "-" });
  const [inspectorTab, setInspectorTab] = useState<"settings" | "transfer">("settings");
  const [settingsCategory, setSettingsCategory] = useState<PropCategory>("exposure");
  const [leftRailTab, setLeftRailTab] = useState<LeftRailTab>("cameras");
  const [eventFilter, setEventFilter] = useState<EventFilter>("activity");

  // --- Refs ---
  const imgRef = useRef<HTMLImageElement>(null);
  const frameInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameActive = useRef(false);
  const logAreaRef = useRef<HTMLDivElement>(null);
  const propRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseErrorLoggedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const lastTransferPercentRef = useRef<number | null>(null);

  // LUT state
  const [lutFiles, setLutFiles] = useState<string[]>([]);
  const [lutSlot, setLutSlot] = useState(1);
  const [lutUploading, setLutUploading] = useState(false);
  const lutInputRef = useRef<HTMLInputElement>(null);
  const [ppLutProperty, setPpLutProperty] = useState<PropertyResponse | null>(null);

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  const addLog = useCallback((type: string, message: string) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev.slice(-119), { time, type, message }]);
  }, []);

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesEventFilter(log.type, eventFilter)),
    [logs, eventFilter]
  );

  // ---------------------------------------------------------------------------
  // Sync cameras from manager
  // ---------------------------------------------------------------------------

  const syncCameras = useCallback(() => {
    if (!manager) return;
    setManagedCameras([...manager.getCameras()]);
  }, []);

  // ---------------------------------------------------------------------------
  // Refresh Properties
  // ---------------------------------------------------------------------------

  const refreshProperties = useCallback(async () => {
    if (!selectedCamera || !manager) return;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const res = await cam(selectedCamera).getAllProperties();
      if (!res.success || !res.data?.properties) return;
      // getAllProperties returns a JSON string for .properties (server serializes it)
      const raw: Record<string, any> =
        typeof res.data.properties === "string"
          ? JSON.parse(res.data.properties)
          : (res.data.properties as Record<string, any>);
      const map: Record<string, PropertyResponse | null> = {};
      for (const p of PROPERTIES) {
        const entry = raw[p.name];
        map[p.name] = entry
          ? {
              success: true,
              data: {
                property: p.name,
                value: entry.currentHexValue ?? entry.current_hex_value ?? "",
                formatted:
                  entry.currentFormatted ?? entry.current_formatted ?? "",
                writable: String(entry.writable) as "true" | "false",
                available_values: (
                  entry.availableValues ??
                  entry.available_values ??
                  []
                ).map((v: any) => ({
                  value: v.hexValue ?? v.hex_value ?? String(v.value),
                  formatted: v.formatted,
                })),
              },
            }
          : null;
      }
      setProperties(map);
    } catch {
      // ignore
    } finally {
      isRefreshingRef.current = false;
    }
  }, [selectedCamera]);

  // ---------------------------------------------------------------------------
  // Set Property
  // ---------------------------------------------------------------------------

  const setProperty = async (name: string, value: string) => {
    if (!selectedCamera || !manager) return;
    try {
      const res = await cam(selectedCamera).setProperty(name, { value });
      if (res.success) {
        addLog("set", `${name} = ${value}`);
        setTimeout(refreshProperties, 500);
      } else {
        addLog("error", `Set ${name} failed: ${res.message}`);
      }
    } catch {
      addLog("error", `Set ${name} failed`);
    }
  };

  // ---------------------------------------------------------------------------
  // Connect / Disconnect (manual — used for mode switching only)
  // ---------------------------------------------------------------------------

  const disconnectCamera = async () => {
    if (!selectedCamera || !manager) return;
    stopStream();
    try {
      await manager.disconnect(selectedCamera);
      setProperties({});
      setSdFiles([]);
      setSdSelected(new Set());
      addLog("info", "Disconnected");
    } catch {
      addLog("error", "Disconnect failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Shutter — AF shutter for single shot, press/release for continuous drive
  // ---------------------------------------------------------------------------

  const isContinuousDrive = () => {
    const dm = properties["drive-mode"]?.data?.formatted?.toLowerCase() || "";
    return dm.includes("continuous") || dm.includes("cont");
  };

  const isMF = () => {
    const fm = properties["focus-mode"]?.data?.formatted?.toLowerCase() || "";
    return fm.includes("manual") || fm === "mf";
  };

  const handleShutterDown = async () => {
    if (!selectedCamera || !manager) return;
    const c = cam(selectedCamera);
    if (isContinuousDrive()) {
      try {
        const res = await c.triggerShutter({ action: "down" });
        if (res.success) addLog("action", "Shutter pressed (continuous)");
        else addLog("error", `Shutter down failed: ${res.message}`);
      } catch { addLog("error", "Shutter down failed"); }
    } else if (isMF()) {
      try {
        const res = await c.triggerShutter();
        if (res.success) addLog("action", "Shutter triggered (MF)");
        else addLog("error", `Shutter failed: ${res.message}`);
      } catch { addLog("error", "Shutter failed"); }
    } else {
      try {
        const halfPress = await c.halfPress();
        if (!halfPress.success) {
          addLog("error", `AF half-press failed: ${halfPress.message}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, AF_SHUTTER_HOLD_MS));
        const res = await c.triggerShutter();
        if (res.success) addLog("action", "AF Shutter triggered");
        else addLog("error", `AF Shutter failed: ${res.message}`);
      } catch { addLog("error", "AF Shutter failed"); }
    }
  };

  const handleShutterUp = async () => {
    if (!selectedCamera || !isContinuousDrive()) return;
    try {
      await cam(selectedCamera).triggerShutter({ action: "up" });
      addLog("action", "Shutter released (continuous)");
    } catch { addLog("error", "Shutter release failed"); }
  };

  // ---------------------------------------------------------------------------
  // Zoom — hold to zoom in/out, release to stop
  // ---------------------------------------------------------------------------

  const startZoom = (direction: "in" | "out") => {
    if (!selectedCamera) return;
    cam(selectedCamera).controlZoom({ direction, speed: "normal" })
      .then(res => {
        if (res.success) addLog("action", `Zoom ${direction}`);
        else addLog("error", `Zoom failed: ${res.message}`);
      })
      .catch(() => addLog("error", "Zoom failed"));
  };

  const stopZoom = () => {
    if (!selectedCamera) return;
    cam(selectedCamera).stopZoom().catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Focus Near/Far — hold buttons, step-based
  // ---------------------------------------------------------------------------

  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startFocus = (direction: "near" | "far") => {
    if (!selectedCamera) return;
    const c = cam(selectedCamera);
    const step = direction === "near" ? -3 : 3;
    c.focusNearFar({ step }).catch(() => {});
    addLog("action", `Focus ${direction}`);
    focusIntervalRef.current = setInterval(() => {
      c.focusNearFar({ step }).catch(() => {});
    }, 200);
  };

  const stopFocus = () => {
    if (focusIntervalRef.current) {
      clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Focus Position Slider
  // ---------------------------------------------------------------------------

  const handleFocusSliderChange = async (value: number[]) => {
    setFocusPosition(value[0]);
  };

  const handleFocusSliderCommit = async (value: number[]) => {
    if (!selectedCamera) return;
    const pos = value[0];
    try {
      const res = await cam(selectedCamera).setProperty("focus-position", {
        value: `0x${pos.toString(16)}`,
      });
      if (res.success) addLog("set", `focus-position = ${pos}`);
      else addLog("error", `Set focus-position failed: ${res.message}`);
    } catch {
      addLog("error", "Set focus-position failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Movie Record
  // ---------------------------------------------------------------------------

  const toggleMovieRec = async () => {
    if (!selectedCamera || !manager) return;
    try {
      const res = await cam(selectedCamera).toggleMovieRecording();
      if (res.success) {
        addLog("action", "Movie recording toggled");
        // Poll recording state after a short delay
        setTimeout(refreshStatus, 1500);
      } else {
        addLog("error", `Movie rec failed: ${res.message}`);
      }
    } catch {
      addLog("error", "Movie rec failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Status Refresh (battery, recording, media)
  // ---------------------------------------------------------------------------

  const refreshStatus = useCallback(async () => {
    if (!selectedCamera || !manager) return;
    const c = cam(selectedCamera);
    try {
      const [bat, rec, s1p, s1t, s2p, s2t] = await Promise.all([
        c.getProperty("battery-remain"),
        c.getProperty("recording-state"),
        c.getProperty("media-slot1-remaining-photos"),
        c.getProperty("media-slot1-remaining-time"),
        c.getProperty("media-slot2-remaining-photos"),
        c.getProperty("media-slot2-remaining-time"),
      ]);
      if (bat.data?.formatted) setBatteryPercent(parseInt(bat.data.formatted));
      if (rec.data?.value) setRecording(rec.data.value !== "0x0");
      setMediaSlots({
        slot1Photos: s1p.data?.formatted || "-",
        slot1Time: s1t.data?.formatted ? `${Math.floor(parseInt(s1t.data.formatted) / 60)}m` : "-",
        slot2Photos: s2p.data?.formatted || "-",
        slot2Time: s2t.data?.formatted ? `${Math.floor(parseInt(s2t.data.formatted) / 60)}m` : "-",
      });
    } catch { /* ignore */ }
  }, [selectedCamera]);

  // Refresh status on connect and periodically
  useEffect(() => {
    if (!connected || !selectedCamera) return;
    refreshStatus();
    const timer = setInterval(refreshStatus, 10000);
    return () => clearInterval(timer);
  }, [connected, selectedCamera, refreshStatus]);

  // ---------------------------------------------------------------------------
  // LUT Management
  // ---------------------------------------------------------------------------

  const refreshLutFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/lut");
      const data = await res.json();
      setLutFiles(data.files || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshLutFiles(); }, [refreshLutFiles]);

  const refreshPpLut = useCallback(async () => {
    if (!selectedCamera || !manager) return;
    try {
      const res = await cam(selectedCamera).getProperty("pp-lut-base-look");
      if (res.success && res.data) {
        setPpLutProperty(res);
      }
    } catch { /* ignore */ }
  }, [selectedCamera]);

  useEffect(() => {
    if (connected) refreshPpLut();
  }, [connected, refreshPpLut]);

  const handleLutUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCamera) return;
    setLutUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("cameraId", selectedCamera);
      formData.append("slot", String(lutSlot));
      const res = await fetch("/api/lut", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        addLog("action", `LUT uploaded & imported: ${file.name} → slot ${lutSlot}`);
        refreshLutFiles();
      } else {
        addLog("error", `LUT upload failed: ${data.message}`);
      }
    } catch (err: any) {
      addLog("error", `LUT upload failed: ${err.message}`);
    }
    setLutUploading(false);
    if (lutInputRef.current) lutInputRef.current.value = "";
  };

  const applyExistingLut = async (fileName: string) => {
    if (!selectedCamera) return;
    try {
      // Re-import an already-uploaded file from the .luts directory
      const formData = new FormData();
      formData.append("cameraId", selectedCamera);
      formData.append("slot", String(lutSlot));
      formData.append("fileName", fileName);
      const res = await fetch("/api/lut?reapply=true", { method: "PUT", body: formData });
      const data = await res.json();
      if (data.success) {
        addLog("action", `LUT applied: ${fileName} → slot ${lutSlot}`);
      } else {
        addLog("error", `LUT apply failed: ${data.message}`);
      }
    } catch (err: any) {
      addLog("error", `LUT apply failed: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Live View
  // ---------------------------------------------------------------------------

  const startStream = async () => {
    if (!selectedCamera || streaming) return;
    const c = cam(selectedCamera);
    try {
      await c.enableLiveView();
      // In remote-transfer mode, the camera needs extra time to enable live view
      await new Promise((r) => setTimeout(r, 1500));
      await c.startLiveViewStream();
      setStreaming(true);
      addLog("info", "Live view started");

      // Brief delay to let the camera start producing frames
      await new Promise((r) => setTimeout(r, 500));

      // Sequential loop — never overlaps requests, so no backlog builds up
      frameActive.current = true;
      const fetchLoop = async () => {
        while (frameActive.current) {
          try {
            const frame = osdEnabledRef.current
              ? await c.getOSDFrame()
              : await c.getLiveViewFrame();
            if (imgRef.current && frame.byteLength > 0) {
              const blob = new Blob([frame], { type: "image/jpeg" });
              const url = URL.createObjectURL(blob);
              const prev = imgRef.current.src;
              imgRef.current.src = url;
              if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            }
          } catch {
            if (frameActive.current) await new Promise((r) => setTimeout(r, 100));
          }
        }
      };
      fetchLoop();
    } catch {
      addLog("error", "Failed to start live view");
    }
  };

  const stopStream = () => {
    frameActive.current = false;
    if (frameInterval.current) {
      clearInterval(frameInterval.current);
      frameInterval.current = null;
    }
    if (!selectedCamera) {
      setStreaming(false);
      return;
    }
    cam(selectedCamera).stopLiveViewStream().catch(() => {});
    setStreaming(false);
    addLog("info", "Live view stopped");
  };

  // ---------------------------------------------------------------------------
  // OSD Toggle
  // ---------------------------------------------------------------------------

  const osdEnabledRef = useRef(osdEnabled);
  osdEnabledRef.current = osdEnabled;

  const toggleOSD = async () => {
    if (!selectedCamera) return;
    const c = cam(selectedCamera);
    try {
      if (osdEnabled) {
        await c.disableOSD();
        setOsdEnabled(false);
        addLog("info", "OSD disabled");
      } else {
        await c.enableOSD();
        setOsdEnabled(true);
        addLog("info", "OSD enabled");
      }
    } catch {
      addLog("error", "OSD toggle failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Save Info
  // ---------------------------------------------------------------------------

  const refreshSaveInfo = useCallback(async () => {
    if (!selectedCamera) return;
    try {
      const res = await cam(selectedCamera).getSaveInfo();
      if (res.success && res.data) {
        setSavePath(res.data.path || "");
        setSavePathInput(res.data.path || "");
      }
    } catch { /* ignore */ }
  }, [selectedCamera]);

  const updateSavePath = async () => {
    if (!selectedCamera) return;
    try {
      const res = await cam(selectedCamera).setSaveInfo({ path: savePathInput });
      if (res.success) {
        setSavePath(savePathInput);
        addLog("set", `Save path = ${savePathInput}`);
      } else {
        addLog("error", `Set save path failed: ${res.message}`);
      }
    } catch {
      addLog("error", "Set save path failed");
    }
  };

  // ---------------------------------------------------------------------------
  // Image ID
  // ---------------------------------------------------------------------------

  const refreshImageId = async () => {
    if (!selectedCamera) return;
    try {
      const [strRes, numRes, maxRes] = await Promise.all([
        cam(selectedCamera).getProperty("image-id-string"),
        cam(selectedCamera).getProperty("image-id-num"),
        cam(selectedCamera).getProperty("image-id-string-max-length"),
      ]);
      if (strRes.success) {
        const val = strRes.data?.value ?? "";
        setImageIdStringCurrent(val);
        setImageIdStringInput(val);
      }
      if (numRes.success) {
        const val = numRes.data?.value ?? "0";
        setImageIdNumCurrent(val);
        setImageIdNumInput(val);
      }
      if (maxRes.success && maxRes.data?.value) {
        setImageIdMaxLength(parseInt(maxRes.data.value, 16) || 64);
      }
    } catch { /* ignore */ }
  };

  const setImageIdString = async () => {
    if (!selectedCamera) return;
    try {
      const res = await cam(selectedCamera).setProperty("image-id-string", imageIdStringInput);
      if (res.success) {
        setImageIdStringCurrent(imageIdStringInput);
        addLog("set", `Image ID string = "${imageIdStringInput}"`);
      } else {
        addLog("error", `Set image ID string failed: ${res.message}`);
      }
    } catch {
      addLog("error", "Set image ID string failed");
    }
  };

  const setImageIdNum = async () => {
    if (!selectedCamera) return;
    try {
      const res = await cam(selectedCamera).setProperty("image-id-num", imageIdNumInput);
      if (res.success) {
        setImageIdNumCurrent(imageIdNumInput);
        addLog("set", `Image ID num = ${imageIdNumInput}`);
      } else {
        addLog("error", `Set image ID num failed: ${res.message}`);
      }
    } catch {
      addLog("error", "Set image ID num failed");
    }
  };

  // ---------------------------------------------------------------------------
  // SD Card
  // ---------------------------------------------------------------------------

  const loadSDFiles = async () => {
    if (!selectedCamera) return;
    setSdLoading(true);
    setSdSelected(new Set());
    try {
      const res = await cam(selectedCamera).listSDCardFiles(sdSlot);
      if (res.success) {
        setSdFiles(res.files || []);
        addLog("info", `SD slot ${sdSlot}: ${res.file_count} files`);
      } else {
        addLog("error", `SD files failed: ${(res as any).message || "unknown error"}`);
        setSdFiles([]);
      }
    } catch (e: any) {
      addLog("error", `SD files failed: ${e?.message || "unknown error"}`);
      setSdFiles([]);
    }
    setSdLoading(false);
  };

  const toggleFileSelect = (key: string) => {
    setSdSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const waitForTransferComplete = (timeoutMs = 120000): Promise<void> => {
    return new Promise((resolve) => {
      const stream = cam(selectedCamera).events;
      const timer = setTimeout(() => { resolve(); }, timeoutMs);
      const onProgress = (data: any) => {
        if (data.percent === 100) {
          clearTimeout(timer);
          stream.off("transferProgress", onProgress);
          stream.off("error", onError);
          resolve();
        }
      };
      const onError = () => {
        clearTimeout(timer);
        stream.off("transferProgress", onProgress);
        stream.off("error", onError);
        resolve();
      };
      stream.on("transferProgress", onProgress);
      stream.on("error", onError);
    });
  };

  const downloadSelectedFiles = async () => {
    if (!selectedCamera || sdSelected.size === 0) return;
    const c = cam(selectedCamera);
    const keys = [...sdSelected];
    const isRemoteTransfer = true; // always remote-transfer mode
    for (let i = 0; i < keys.length; i++) {
      const [contentId, fileId] = keys[i].split(":").map(Number);
      try {
        const res = await c.downloadSDCardFile(sdSlot, contentId, fileId);
        if (res.success) {
          addLog("download", `Download ${i + 1}/${keys.length}: ${contentId}/${fileId}`);
          if (isRemoteTransfer) {
            await waitForTransferComplete();
            await new Promise((r) => setTimeout(r, 2000));
          }
        } else {
          addLog("error", `Download failed: ${res.message}`);
        }
      } catch {
        addLog("error", `Download failed: ${contentId}/${fileId}`);
      }
    }
    addLog("info", `All ${keys.length} downloads complete`);
  };

  // ---------------------------------------------------------------------------
  // SSE
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedCamera || !connected || !manager) return;

    const stream = cam(selectedCamera).events;

    const onPropertyChanged = (data: unknown) => {
      sseErrorLoggedRef.current = false;
      // Debounce: rapid property events collapse into one refresh
      if (propRefreshTimerRef.current) clearTimeout(propRefreshTimerRef.current);
      propRefreshTimerRef.current = setTimeout(refreshProperties, 300);
    };
    const onDownloadComplete = () => addLog("download", "Download completed");
    const onWarning = (data: unknown) =>
      addLog("warning", `Camera warning: ${JSON.stringify(data).slice(0, 100)}`);
    const onAfStatus = () => {};
    const onTransferProgress = (data: unknown) => {
      const percent = (data as { percent?: number } | null)?.percent;
      if (typeof percent !== "number") return;
      if (percent === lastTransferPercentRef.current) return;
      if (percent !== 100 && percent % 25 !== 0) return;
      lastTransferPercentRef.current = percent;
      addLog("download", `Transfer ${percent}%`);
    };
    const onLutImport = () => addLog("info", "LUT import completed");
    const onConnected = () => {
      sseErrorLoggedRef.current = false;
      addLog("info", "Camera connected");
    };
    const onDisconnected = () => addLog("info", "Camera disconnected");
    const onError = () => {
      if (!sseErrorLoggedRef.current) {
        sseErrorLoggedRef.current = true;
        addLog("error", "SSE connection lost — reconnecting...");
      }
    };

    stream.on("propertyChanged", onPropertyChanged);
    stream.on("downloadComplete", onDownloadComplete);
    stream.on("warning", onWarning);
    stream.on("afStatus", onAfStatus);
    stream.on("transferProgress", onTransferProgress);
    (stream as any).on("lutImportResult", onLutImport);
    stream.on("connected", onConnected);
    stream.on("disconnected", onDisconnected);
    stream.on("error", onError);

    return () => {
      stream.off("propertyChanged", onPropertyChanged);
      stream.off("downloadComplete", onDownloadComplete);
      stream.off("warning", onWarning);
      stream.off("afStatus", onAfStatus);
      stream.off("transferProgress", onTransferProgress);
      (stream as any).off("lutImportResult", onLutImport);
      stream.off("connected", onConnected);
      stream.off("disconnected", onDisconnected);
      stream.off("error", onError);
    };
  }, [selectedCamera, connected, addLog, refreshProperties]);

  // Auto-scroll logs
  useEffect(() => {
    const viewport = logAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs]);

  // ---------------------------------------------------------------------------
  // CameraManager events — sync state + post-connect setup
  // ---------------------------------------------------------------------------

  // Ref to track which camera we've already run post-connect setup for
  const postConnectDoneRef = useRef<string>("");

  // Ref for callbacks that need current selectedCamera without triggering effect re-runs
  const selectedCameraRef = useRef(selectedCamera);
  selectedCameraRef.current = selectedCamera;

  useEffect(() => {
    if (serverStatus !== "running" || !manager) return;

    const onFound = ({ camera }: { camera: CameraInfo }) => {
      syncCameras();
      // Auto-select first camera
      if (!selectedCameraRef.current) {
        selectedCameraRef.current = camera.id;
        setSelectedCamera(camera.id);
      }
      addLog("info", `camera found: ${camera.model}`);
    };
    const onLost = ({ camera }: { camera: CameraInfo }) => {
      syncCameras();
      addLog("info", `camera lost: ${camera.model}`);
    };
    const onConnecting = ({ cameraId }: { cameraId: string }) => {
      syncCameras();
      addLog("info", `camera connecting: ${cameraId.slice(-6)}`);
    };
    const onReady = ({ cameraId, camera }: { cameraId: string; camera: CameraInfo }) => {
      syncCameras();
      addLog("info", `camera ready: ${camera.model}`);

      // Post-connect setup: refresh properties, priority key, save info
      // Auto-select if nothing selected
      if (!selectedCameraRef.current) {
        selectedCameraRef.current = cameraId;
        setSelectedCamera(cameraId);
      }
      if (postConnectDoneRef.current === cameraId) return;
      postConnectDoneRef.current = cameraId;
      setTimeout(async () => {
        // Only load UI state if this camera is currently selected
        if (selectedCameraRef.current !== cameraId) return;
        const c = cam(cameraId);
        try {
          const res = await c.getAllProperties();
          if (res.success && res.data?.properties) {
            const raw: Record<string, any> =
              typeof res.data.properties === "string"
                ? JSON.parse(res.data.properties)
                : (res.data.properties as Record<string, any>);
            const map: Record<string, PropertyResponse | null> = {};
            for (const p of PROPERTIES) {
              const entry = raw[p.name];
              map[p.name] = entry
                ? {
                    success: true,
                    data: {
                      property: p.name,
                      value:
                        entry.currentHexValue ?? entry.current_hex_value ?? "",
                      formatted:
                        entry.currentFormatted ??
                        entry.current_formatted ??
                        "",
                      writable: String(entry.writable) as "true" | "false",
                      available_values: (
                        entry.availableValues ??
                        entry.available_values ??
                        []
                      ).map((v: any) => ({
                        value: v.hexValue ?? v.hex_value ?? String(v.value),
                        formatted: v.formatted,
                      })),
                    },
                  }
                : null;
            }
            setProperties(map);
          }
        } catch { /* ignore */ }
        try {
          const siRes = await c.getSaveInfo();
          if (siRes.success && siRes.data) {
            setSavePath(siRes.data.path || "");
            setSavePathInput(siRes.data.path || "");
          }
        } catch { /* ignore */ }
      }, 2000);
    };
    const onDisconnected = ({ cameraId, error }: { cameraId: string; error?: string }) => {
      syncCameras();
      if (postConnectDoneRef.current === cameraId) postConnectDoneRef.current = "";
      addLog("info", `camera disconnected${error ? `: ${error}` : ""}`);
    };
    const onFailed = ({ cameraId, error, attempt }: { cameraId: string; error: string; attempt: number }) => {
      syncCameras();
      addLog("error", `connection failed (attempt ${attempt}): ${error}`);
    };

    manager.on("camera-found", onFound);
    manager.on("camera-lost", onLost);
    manager.on("camera-connecting", onConnecting);
    manager.on("camera-ready", onReady);
    manager.on("camera-disconnected", onDisconnected);
    manager.on("connection-failed", onFailed);

    // Initial sync
    syncCameras();

    return () => {
      manager?.off("camera-found", onFound);
      manager?.off("camera-lost", onLost);
      manager?.off("camera-connecting", onConnecting);
      manager?.off("camera-ready", onReady);
      manager?.off("camera-disconnected", onDisconnected);
      manager?.off("connection-failed", onFailed);
    };
  }, [serverStatus, addLog, syncCameras]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (serverStatus === "starting") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Starting camera server...</p>
      </div>
    );
  }

  if (serverStatus === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-6 max-w-md space-y-2">
          <p className="font-semibold text-red-500">Failed to start camera server</p>
          <p className="text-sm text-muted-foreground">{serverError}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </Card>
      </div>
    );
  }

  // State badge for selected camera
  const stateBadge = (() => {
    if (!selectedMC) return null;
    switch (selectedMC.state) {
      case "detected":
        return (
          <Badge variant="outline" className="text-amber-500 border-amber-500 gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            Detected
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="outline" className="text-blue-500 border-blue-500 gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            Connecting...
          </Badge>
        );
      case "connected":
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600 border-green-600 gap-1.5">
              <span className="inline-flex rounded-full h-2 w-2 bg-green-500" />
              {CONNECTION_MODE}
            </Badge>
            <Button variant="destructive" size="icon" onClick={disconnectCamera} title="Disconnect" className="h-7 w-7">
              ✕
            </Button>
          </div>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1.5">
            <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
            Disconnected
          </Badge>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Camera Remote</h1>
          <Button variant="outline" size="sm" onClick={syncCameras}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          {/* Left rail — cameras + events */}
          <div>
            <Card className="p-3">
              <div className="-mx-1 mb-3 overflow-x-auto">
                <div className="flex min-w-max gap-2 px-1">
                <Button
                  variant={leftRailTab === "cameras" ? "default" : "outline"}
                  className="shrink-0 px-6"
                  onClick={() => setLeftRailTab("cameras")}
                >
                  Cameras
                </Button>
                <Button
                  variant={leftRailTab === "events" ? "default" : "outline"}
                  className="shrink-0 px-6"
                  onClick={() => setLeftRailTab("events")}
                >
                  Events
                </Button>
                </div>
              </div>

              {leftRailTab === "cameras" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Detected Cameras</p>
                    <span className="text-xs text-muted-foreground">{managedCameras.length}</span>
                  </div>
                  {managedCameras.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No cameras detected</p>
                  ) : (
                    <div className="space-y-2">
                      {managedCameras.map((mc) => {
                        const selected = selectedCamera === mc.info.id;
                        const stateLabel =
                          mc.state === "connected"
                            ? "Connected"
                            : mc.state === "connecting"
                              ? "Connecting"
                              : mc.state === "detected"
                                ? "Detected"
                                : "Disconnected";
                        return (
                          <button
                            key={mc.info.id}
                            type="button"
                            onClick={() => setSelectedCamera(mc.info.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                              selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{mc.info.model}</p>
                                <p className="truncate text-xs text-muted-foreground">{mc.info.id}</p>
                              </div>
                              <span
                                className={`shrink-0 text-xs ${
                                  mc.state === "connected"
                                    ? "text-green-600"
                                    : mc.state === "connecting"
                                      ? "text-blue-500"
                                      : mc.state === "detected"
                                        ? "text-amber-500"
                                        : "text-muted-foreground"
                                }`}
                              >
                                {stateLabel}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedCamera && stateBadge && <div className="pt-1">{stateBadge}</div>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Event Log</p>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setLogs([])}>
                      Clear
                    </Button>
                  </div>
                  <div className="-mx-1 overflow-x-auto">
                    <div className="flex min-w-max gap-2 px-1">
                    <Button
                      size="sm"
                      variant={eventFilter === "activity" ? "default" : "outline"}
                      onClick={() => setEventFilter("activity")}
                      className="shrink-0 px-4"
                    >
                      Activity
                    </Button>
                    <Button
                      size="sm"
                      variant={eventFilter === "transfer" ? "default" : "outline"}
                      onClick={() => setEventFilter("transfer")}
                      className="shrink-0 px-4"
                    >
                      Transfer
                    </Button>
                    <Button
                      size="sm"
                      variant={eventFilter === "errors" ? "default" : "outline"}
                      onClick={() => setEventFilter("errors")}
                      className="shrink-0 px-4"
                    >
                      Errors
                    </Button>
                    <Button
                      size="sm"
                      variant={eventFilter === "all" ? "default" : "outline"}
                      onClick={() => setEventFilter("all")}
                      className="shrink-0 px-4"
                    >
                      All
                    </Button>
                    </div>
                  </div>
                  <ScrollArea
                    ref={logAreaRef}
                    className="h-[calc(100vh-260px)] rounded border bg-muted/30 p-2 font-mono text-xs"
                  >
                    {filteredLogs.length === 0 ? (
                      <p className="text-muted-foreground">No events in this category</p>
                    ) : (
                      filteredLogs.map((log, i) => (
                        <div key={i} className="py-0.5 break-words whitespace-pre-wrap leading-5">
                          <span className="text-muted-foreground">{log.time}</span>{" "}
                          <span
                            className={
                              log.type === "error"
                                ? "text-red-500"
                                : log.type === "warning"
                                  ? "text-yellow-500"
                                  : log.type === "download"
                                    ? "text-green-500"
                                    : "text-foreground"
                            }
                          >
                            [{log.type}]
                          </span>{" "}
                          {log.message}
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </div>
              )}
            </Card>
          </div>

          {/* Center column — live view + camera controls */}
          <div className="space-y-4">
            {connected && (
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {batteryPercent !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className={batteryPercent < 20 ? "text-red-500" : batteryPercent < 50 ? "text-yellow-500" : "text-green-500"}>
                        {batteryPercent < 20 ? "🪫" : "🔋"}
                      </span>
                      <span className="tabular-nums font-medium">{batteryPercent}%</span>
                    </div>
                  )}
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    {recording ? (
                      <Badge variant="destructive" className="gap-1">
                        <span className="inline-flex h-2 w-2 rounded-full bg-white animate-pulse" />
                        REC
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">STBY</Badge>
                    )}
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Slot 1: {mediaSlots.slot1Photos} photos / {mediaSlots.slot1Time}</span>
                    <span>Slot 2: {mediaSlots.slot2Photos} photos / {mediaSlots.slot2Time}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Live View */}
            <Card className="p-2 bg-black flex items-center justify-center min-h-[400px] relative">
              {streaming ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imgRef}
                  alt="Live View"
                  className="max-w-full max-h-[500px] object-contain"
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {connected ? "Click Start to begin live view" : "Connect a camera to start"}
                </p>
              )}
            </Card>

            {/* Live View Controls */}
            <Card className="p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" onClick={startStream} disabled={!connected || streaming}>
                  Start LV
                </Button>
                <Button size="sm" variant="outline" onClick={stopStream} disabled={!streaming}>
                  Stop LV
                </Button>
                <Button
                  size="sm"
                  variant={osdEnabled ? "default" : "outline"}
                  onClick={toggleOSD}
                  disabled={!connected}
                >
                  OSD {osdEnabled ? "On" : "Off"}
                </Button>

                <div className="h-6 w-px bg-border" />

                {/* Zoom */}
                <HoldButton
                  onPressStart={() => startZoom("out")}
                  onPressEnd={stopZoom}
                  disabled={!connected}
                >
                  W-
                </HoldButton>
                <HoldButton
                  onPressStart={() => startZoom("in")}
                  onPressEnd={stopZoom}
                  disabled={!connected}
                >
                  T+
                </HoldButton>

                <div className="h-6 w-px bg-border" />

                {/* Focus Near/Far */}
                <HoldButton
                  onPressStart={() => startFocus("near")}
                  onPressEnd={stopFocus}
                  disabled={!connected}
                >
                  Near
                </HoldButton>
                <HoldButton
                  onPressStart={() => startFocus("far")}
                  onPressEnd={stopFocus}
                  disabled={!connected}
                >
                  Far
                </HoldButton>
              </div>

              {/* Focus Position Slider */}
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8">INF</span>
                <Slider
                  min={0}
                  max={65535}
                  step={100}
                  value={[focusPosition]}
                  onValueChange={handleFocusSliderChange}
                  onValueCommit={handleFocusSliderCommit}
                  disabled={!connected}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10">Near</span>
                <span className="text-xs tabular-nums w-12 text-right">{focusPosition}</span>
              </div>
            </Card>

            {/* Shutter */}
            <Card className="p-3">
              <div className="flex items-center gap-3">
                <HoldButton
                  onPressStart={handleShutterDown}
                  onPressEnd={handleShutterUp}
                  disabled={!connected}
                  variant="default"
                  size="lg"
                  className="flex-1"
                >
                  {isContinuousDrive()
                    ? "Hold to Shoot (Cont.)"
                    : isMF()
                      ? "Shutter (MF)"
                      : "AF Shutter"}
                </HoldButton>
                <div className="text-xs text-muted-foreground">
                  {isContinuousDrive() && "Hold = continuous"}
                  {isMF() && "Manual focus (no AF)"}
                </div>
                <Button
                  size="lg"
                  variant={recording ? "destructive" : "outline"}
                  onClick={toggleMovieRec}
                  disabled={!connected}
                  className="min-w-[120px]"
                >
                  {recording ? "⏹ Stop Rec" : "⏺ Record"}
                </Button>
              </div>
            </Card>
          </div>

          {/* Right sidebar — settings / transfer */}
          <div className="min-h-0">
            <Card className="flex h-[calc(100vh-140px)] min-h-0 flex-col overflow-hidden p-3">
              <div className="-mx-1 overflow-x-auto">
                <div className="flex min-w-max gap-2 px-1">
                <Button
                  variant={inspectorTab === "settings" ? "default" : "outline"}
                  className="shrink-0 px-8"
                  onClick={() => setInspectorTab("settings")}
                >
                  Settings
                </Button>
                <Button
                  variant={inspectorTab === "transfer" ? "default" : "outline"}
                  className="shrink-0 px-8"
                  onClick={() => setInspectorTab("transfer")}
                >
                  Transfer
                </Button>
                </div>
              </div>

              {inspectorTab === "settings" ? (
                <>
                  <div className="-mx-1 mt-3 overflow-x-auto">
                    <div className="flex min-w-max gap-2 px-1">
                    {SETTINGS_CATEGORIES.map((category) => (
                      <Button
                        key={category.key}
                        size="sm"
                        variant={settingsCategory === category.key ? "default" : "outline"}
                        onClick={() => setSettingsCategory(category.key)}
                        className="shrink-0 px-4 text-xs"
                      >
                        {category.label}
                      </Button>
                    ))}
                    </div>
                  </div>
                  <ScrollArea className="mt-3 min-h-0 flex-1">
                    <div className="pr-3">
                      <div>
                      {settingsCategory === "system" && (
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Image ID (MakerNote)</p>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={refreshImageId} disabled={!connected}>
                              Refresh
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">String (max {imageIdMaxLength} chars)</p>
                            <div className="flex gap-2">
                              <Input
                                value={imageIdStringInput}
                                onChange={(e) => setImageIdStringInput(e.target.value)}
                                placeholder="e.g. PROJECT-ALPHA-001"
                                disabled={!connected}
                                className="flex-1 text-xs"
                                maxLength={imageIdMaxLength}
                              />
                              <Button
                                size="sm"
                                onClick={setImageIdString}
                                disabled={!connected || imageIdStringInput === imageIdStringCurrent}
                              >
                                Set
                              </Button>
                            </div>
                            {imageIdStringCurrent && (
                              <p className="text-xs text-muted-foreground">Current: {imageIdStringCurrent}</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">Numeric ID (requires Image ID Num toggle = On)</p>
                            <div className="flex gap-2">
                              <Input
                                value={imageIdNumInput}
                                onChange={(e) => setImageIdNumInput(e.target.value.replace(/\D/g, ""))}
                                placeholder="e.g. 12345"
                                disabled={!connected}
                                className="flex-1 text-xs"
                              />
                              <Button
                                size="sm"
                                onClick={setImageIdNum}
                                disabled={!connected || imageIdNumInput === imageIdNumCurrent}
                              >
                                Set
                              </Button>
                            </div>
                            {imageIdNumCurrent && imageIdNumCurrent !== "0" && (
                              <p className="text-xs text-muted-foreground">Current: {imageIdNumCurrent}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {settingsCategory === "video" && (
                        <div className="space-y-2 p-3">
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-medium">LUT Manager</p>
                            <Select value={String(lutSlot)} onValueChange={(v) => setLutSlot(parseInt(v))}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 16 }, (_, i) => (
                                  <SelectItem key={i + 1} value={String(i + 1)}>
                                    Slot {i + 1}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input
                              ref={lutInputRef}
                              type="file"
                              accept=".cube"
                              onChange={handleLutUpload}
                              className="hidden"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => lutInputRef.current?.click()}
                              disabled={!connected || lutUploading}
                            >
                              {lutUploading ? "Uploading..." : "Upload .cube"}
                            </Button>
                          </div>
                          {lutFiles.length > 0 ? (
                            <div className="space-y-1">
                              {lutFiles.map((f) => (
                                <div key={f} className="flex items-center gap-2 text-xs font-mono">
                                  <span className="flex-1 truncate">{f}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    disabled={!connected}
                                    onClick={() => applyExistingLut(f)}
                                  >
                                    Apply → Slot {lutSlot}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No LUT files uploaded yet</p>
                          )}
                          <div className="space-y-1 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground">Active Base Look</p>
                            <PropertySelect
                              property={ppLutProperty}
                              propName="pp-lut-base-look"
                              disabled={!connected || !ppLutProperty}
                              onValueChange={async (v) => {
                                await setProperty("pp-lut-base-look", v);
                                setTimeout(refreshPpLut, 500);
                              }}
                            />
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={refreshPpLut} disabled={!connected}>
                              Refresh
                            </Button>
                          </div>
                        </div>
                      )}

                      {PROPERTIES.filter((p) => p.category === settingsCategory).map((p) => {
                    const prop = properties[p.name] ?? null;
                    const isReadOnly = prop?.data?.writable === "false";
                    const hasNoData = !prop?.data?.value;
                    if (hasNoData) return null;
                    const uiType = p.ui || (isRangeProperty(p.name) ? "range" : "select");
                    return (
                      <div key={p.name} className="space-y-2 border-t p-3 first:border-t-0">
                        <p className="text-sm font-medium">
                          {p.label}
                          {isReadOnly && (
                            <span className="ml-2 text-xs text-muted-foreground">(read-only)</span>
                          )}
                        </p>
                        {uiType === "toggle" ? (
                          <PropertyToggle
                            property={prop}
                            propName={p.name}
                            disabled={!connected || !prop}
                            onToggle={(v) => setProperty(p.name, v)}
                          />
                        ) : uiType === "range" ? (
                          <PropertyRange
                            property={prop}
                            propName={p.name}
                            disabled={!connected || !prop}
                            onCommit={(v) => setProperty(p.name, v)}
                          />
                        ) : (
                          <PropertySelect
                            property={prop}
                            propName={p.name}
                            disabled={!connected || !prop}
                            onValueChange={(v) => setProperty(p.name, v)}
                          />
                        )}
                      </div>
                      );
                    })}
                      </div>
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <ScrollArea className="mt-3 min-h-0 flex-1">
                  <div className="space-y-4 pr-3">
                  <Card className="p-3 space-y-2">
                    <p className="text-sm font-medium">Save Destination</p>
                    <div className="space-y-2">
                      <Input
                        value={savePathInput}
                        onChange={(e) => setSavePathInput(e.target.value)}
                        placeholder="/path/to/save/photos"
                        disabled={!connected}
                        className="w-full"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!connected}
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/browse", { method: "POST" });
                              const data = await res.json();
                              if (data.success && data.path) {
                                setSavePathInput(data.path);
                              }
                            } catch {}
                          }}
                        >
                          Browse
                        </Button>
                        <Button
                          size="sm"
                          onClick={updateSavePath}
                          disabled={!connected || savePathInput === savePath}
                        >
                          Set
                        </Button>
                      </div>
                    </div>
                    {savePath && (
                      <p className="text-xs text-muted-foreground">Current: {savePath}</p>
                    )}
                  </Card>

                  <Card className="p-3 space-y-2">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">SD Card</p>
                        <div className="flex gap-1 rounded bg-muted p-0.5">
                          <button
                            onClick={() => setSdSlot(1)}
                            className={`rounded px-2 py-0.5 text-xs ${
                              sdSlot === 1 ? "bg-background font-medium shadow" : "text-muted-foreground"
                            }`}
                          >
                            Slot 1
                          </button>
                          <button
                            onClick={() => setSdSlot(2)}
                            className={`rounded px-2 py-0.5 text-xs ${
                              sdSlot === 2 ? "bg-background font-medium shadow" : "text-muted-foreground"
                            }`}
                          >
                            Slot 2
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <Button size="sm" variant="outline" onClick={loadSDFiles} disabled={!connected || sdLoading}>
                          {sdLoading ? "Loading..." : "List Files"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={downloadSelectedFiles}
                          disabled={!connected || sdSelected.size === 0}
                        >
                          Download ({sdSelected.size})
                        </Button>
                      </div>
                    </div>
                    {sdFiles.length > 0 && (
                      <ScrollArea className="h-40 w-full max-w-full overflow-hidden rounded border bg-muted/30 p-2">
                        <div className="w-full min-w-0 space-y-1">
                          {sdFiles.map((f) => {
                            const key = `${f.contentId}:${f.fileId}`;
                            return (
                              <label
                                key={key}
                                className="grid min-w-0 max-w-full grid-cols-[auto,minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded px-1 py-0.5 font-mono text-xs hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={sdSelected.has(key)}
                                  onCheckedChange={() => toggleFileSelect(key)}
                                />
                                <span className="min-w-0 truncate">{f.filePath}</span>
                                <span className="col-start-2 min-w-0 text-[11px] text-muted-foreground">
                                  {(f.fileSize / 1024 / 1024).toFixed(1)}MB
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </Card>
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
