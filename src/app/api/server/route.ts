import { NextResponse } from "next/server";
import { ServerManager } from "@/lib/server-manager";
import net from "node:net";

const DEFAULT_PORT = 8080;
const MAX_PORT = 8180;

let server: ServerManager | null = null;
let cleanupRegistered = false;
let startPromise: Promise<number> | null = null;
let stopPromise: Promise<void> | null = null;
let adoptedPort: number | null = null;

async function isHealthyServer(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/server/status`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function isPortOpen(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    socket.setTimeout(750);
    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });
    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });
    socket.once("error", () => {
      cleanup();
      resolve(false);
    });
  });
}

async function findHealthyServerPort(): Promise<number | null> {
  for (let port = DEFAULT_PORT; port <= MAX_PORT; port += 1) {
    if (await isHealthyServer(port)) {
      return port;
    }
  }
  return null;
}

async function shutdownPort(port: number): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/server/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
}

export async function POST() {
  if (stopPromise) {
    await stopPromise;
  }

  if (startPromise) {
    const port = await startPromise;
    return NextResponse.json({ status: "already_running", port });
  }

  if (server) {
    return NextResponse.json({ status: "already_running", port: server.getPort() });
  }

  if (await isPortOpen(DEFAULT_PORT)) {
    adoptedPort = DEFAULT_PORT;
    return NextResponse.json({ status: "already_running", port: DEFAULT_PORT });
  }

  if (adoptedPort && await isHealthyServer(adoptedPort)) {
    return NextResponse.json({ status: "already_running", port: adoptedPort });
  }

  const discoveredPort = await findHealthyServerPort();
  if (discoveredPort !== null) {
    adoptedPort = discoveredPort;
    return NextResponse.json({ status: "already_running", port: discoveredPort });
  }

  try {
    const instance = new ServerManager({ port: DEFAULT_PORT, autoPort: true });
    startPromise = (async () => {
      await instance.start();
      adoptedPort = null;
      server = instance;
      return instance.getPort();
    })();
    const port = await startPromise;
    startPromise = null;

    if (!cleanupRegistered) {
      const cleanup = () => {
        server?.kill();
        server = null;
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      process.on("beforeExit", cleanup);
      cleanupRegistered = true;
    }

    return NextResponse.json({ status: "started", port });
  } catch (e: any) {
    startPromise = null;
    server = null;

    const recoveredPort = await findHealthyServerPort();
    if (recoveredPort !== null) {
      adoptedPort = recoveredPort;
      return NextResponse.json({ status: "already_running", port: recoveredPort });
    }

    if (await isPortOpen(DEFAULT_PORT)) {
      adoptedPort = DEFAULT_PORT;
      return NextResponse.json({ status: "already_running", port: DEFAULT_PORT });
    }

    return NextResponse.json({ status: "error", message: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  if (startPromise) {
    await startPromise.catch(() => {});
    startPromise = null;
  }

  if (!server) {
    if (adoptedPort) {
      const port = adoptedPort;
      adoptedPort = null;
      await shutdownPort(port);
      return NextResponse.json({ status: "stopped" });
    }
    return NextResponse.json({ status: "not_running" });
  }

  const instance = server;
  server = null;
  adoptedPort = null;
  stopPromise = instance.stop().finally(() => {
    stopPromise = null;
  });
  await stopPromise;

  server = null;
  return NextResponse.json({ status: "stopped" });
}

export async function GET() {
  return NextResponse.json({
    status: server || adoptedPort ? "running" : "stopped",
    port: server?.getPort() ?? adoptedPort ?? null,
  });
}
