// =============================================================================
// Vendored camera-server lifecycle.
//
// The clone-and-build model keeps `ServerManager` private to the `crsdk` CLI, so
// an app that wants to spawn the native REST server carries its own small copy
// instead of depending on the retired `@alpha-sdk/api` package. This is that
// copy — spawn the built `CameraWebApp`, adopt one that's already running, and
// shut it down cleanly.
//
// The binary is built from source (it needs Sony's SDK). Point the app at it via
// the `CRSDK_BINARY` env var, e.g.
//   CRSDK_BINARY=/path/to/alpha-sdk-api/api/server/build/CameraWebApp npm run dev
// or just run `./crsdk start` yourself and this manager will adopt it.
// =============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import net from "node:net";

export interface ServerManagerOptions {
  /** Preferred port (default 8080). */
  port?: number;
  /** If the preferred port is taken by something that isn't our server, try the next one. */
  autoPort?: boolean;
  /** Path to the built CameraWebApp. Defaults to $CRSDK_BINARY / $CAMERA_SERVER_BINARY. */
  binaryPath?: string;
  /** How long to wait for a spawned server to answer /api/server/status. */
  readyTimeoutMs?: number;
}

const READY_MARKER = "started on";
const MAX_PORT_PROBES = 100;

export class ServerManager {
  private child: ChildProcess | null = null;
  private port: number;
  private output: string[] = [];
  private readonly autoPort: boolean;
  private readonly binaryPath?: string;
  private readonly readyTimeoutMs: number;

  constructor(opts: ServerManagerOptions = {}) {
    this.port = opts.port ?? 8080;
    this.autoPort = opts.autoPort ?? false;
    this.binaryPath =
      opts.binaryPath ?? process.env.CRSDK_BINARY ?? process.env.CAMERA_SERVER_BINARY;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 30_000;
  }

  /** The port the server is (or will be) reachable on. */
  getPort(): number {
    return this.port;
  }

  /** True if this process owns the running server (spawned it, vs adopted one). */
  get owned(): boolean {
    return this.child !== null;
  }

  /** True if a healthy camera server is answering on `port`. */
  async isHealthy(port = this.port): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/server/status`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Adopt a healthy server on the preferred port, otherwise spawn one. */
  async start(): Promise<void> {
    if (await this.isHealthy(this.port)) return; // adopt

    const binary = this.binaryPath;
    if (!binary) {
      throw new Error(
        "No camera server is running and CRSDK_BINARY is not set. Either run " +
          "`./crsdk start` in your alpha-sdk-api clone, or set CRSDK_BINARY to the " +
          "built binary (api/server/build/CameraWebApp) so this app can spawn it.",
      );
    }

    if (this.autoPort) this.port = await this.pickPort(this.port);

    this.output = [];
    // Run from the binary's own directory so it resolves its SDK / OpenCV dylibs
    // and working files relative to where it sits.
    const child = spawn(binary, ["--port", String(this.port)], {
      cwd: dirname(binary),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    const record = (chunk: Buffer) => {
      this.output.push(chunk.toString());
      if (this.output.length > 40) this.output.shift();
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
    child.on("exit", () => {
      this.child = null;
    });

    const spawnFailed = new Promise<never>((_, reject) => {
      child.once("error", (err) => reject(new Error(`Could not run ${binary}: ${err.message}`)));
    });
    await Promise.race([this.awaitReady(), spawnFailed]);
  }

  /** Ask the server to shut down cleanly, then make sure our child is gone. */
  async stop(): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${this.port}/api/server/shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* already down, or too busy to answer — fall through to kill */
    }
    const child = this.child;
    if (!child) return;

    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const deadline = Date.now() + 5000;
    while (this.child !== null && Date.now() < deadline) {
      await Promise.race([exited, sleep(250)]);
    }
    if (this.child) {
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(2000)]);
    }
    if (this.child) child.kill("SIGKILL");
    this.child = null;
  }

  /** Synchronous kill, for process-exit handlers that cannot await. */
  kill(): void {
    this.child?.kill("SIGKILL");
    this.child = null;
  }

  private async awaitReady(): Promise<void> {
    const deadline = Date.now() + this.readyTimeoutMs;
    while (Date.now() < deadline) {
      if (this.child === null) {
        throw new Error(`camera server exited during startup. ${this.tail()}`);
      }
      if (this.output.join("").includes(READY_MARKER)) return;
      await sleep(250);
    }
    // Some builds print no marker — fall back to one HTTP probe before giving up.
    if (this.child !== null && (await this.isHealthy())) return;
    this.kill();
    throw new Error(
      `camera server did not become ready within ${this.readyTimeoutMs / 1000}s. ${this.tail()}`,
    );
  }

  /** First port at or after `start` that nothing is listening on. */
  private async pickPort(start: number): Promise<number> {
    for (let port = start; port < start + MAX_PORT_PROBES; port += 1) {
      if (!(await isPortOpen(port))) return port;
    }
    return start;
  }

  private tail(): string {
    const text = this.output.join("").trim();
    return text ? `Last output: ${text.slice(-500)}` : "";
  }
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(750);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
