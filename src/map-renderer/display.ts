// The X display MapLibre Native needs on Linux, started by the renderer itself.
//
// The Linux binary draws through GLX, so it needs an X server even with nothing
// on screen; Xvfb is one in memory, drawing through Mesa's software rasteriser.
// Started here rather than by `xvfb-run` as the container's first process, which
// hangs with no output when it is PID 1 - and so the renderer knows whether its
// display is up, which `/healthz` reports. macOS and Windows need none.

import { spawn, type ChildProcess } from "node:child_process";

export interface Display {
  /** The `DISPLAY` value, such as `:0`. */
  name: string;
  /** Whether the server is still running. */
  isUp(): boolean;
  /** Called once if it exits while the renderer still needs it. */
  onExit(listener: (reason: string) => void): void;
  stop(): void;
}

const STARTUP_TIMEOUT_MS = 10_000;
// Kept for the moment it dies, and printed then rather than as it goes: a
// healthy Xvfb's stderr is a page of keymap warnings nobody needs.
const KEPT_LINES = 20;

export function startDisplay(): Promise<Display> {
  return new Promise((resolve, reject) => {
    // `-displayfd` picks a free display and writes its number to fd 3 once the
    // server accepts connections - the readiness signal `xvfb-run` polls for.
    // The screen is tiny because nothing is drawn to it: MapLibre renders to an
    // offscreen buffer of its own size.
    const server: ChildProcess = spawn(
      "Xvfb",
      ["-displayfd", "3", "-screen", "0", "64x64x24", "-nolisten", "tcp"],
      { stdio: ["ignore", "ignore", "pipe", "pipe"] },
    );

    const stderr: string[] = [];
    server.stderr!.setEncoding("utf8").on("data", (chunk: string) => {
      stderr.push(...chunk.split("\n").filter(Boolean));
      stderr.splice(0, Math.max(0, stderr.length - KEPT_LINES));
    });

    let name: string | undefined;
    let running = true;
    let stopping = false;
    const exitListeners: ((reason: string) => void)[] = [];

    const timer = setTimeout(() => {
      server.kill();
      reject(new Error("Xvfb did not start within 10 s"));
    }, STARTUP_TIMEOUT_MS);

    let written = "";
    server.stdio[3]!.on("data", (chunk: Buffer) => {
      written += chunk.toString();
      if (name || !written.includes("\n")) return;
      clearTimeout(timer);
      name = `:${written.trim()}`;
      resolve({
        name,
        isUp: () => running,
        onExit: (listener) => exitListeners.push(listener),
        stop() {
          stopping = true;
          server.kill();
        },
      });
    });

    server.on("error", (error) => {
      clearTimeout(timer);
      running = false;
      reject(new Error(`Could not start Xvfb: ${error.message}`));
    });
    server.on("exit", (code, signal) => {
      running = false;
      clearTimeout(timer);
      const reason =
        `Xvfb exited (${signal ?? `code ${code}`})` +
        (stderr.length ? `:\n${stderr.join("\n")}` : "");
      if (!name) {
        reject(new Error(reason));
      } else if (!stopping) {
        exitListeners.forEach((listener) => listener(reason));
      }
    });
  });
}
