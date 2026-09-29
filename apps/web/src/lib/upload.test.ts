import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * Pins the `Attachment` state machine and that this module stays client-safe —
 * hence the import at the bottom, which fails loudly under jsdom if a server
 * dependency creeps back in.
 */
const rpc = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  createUpload: vi.fn(),
}));

vi.mock("@/utils/client", () => ({ client: { files: rpc } }));

const { uploadFile } = await import("./upload");

/** Minimal XMLHttpRequest good enough for the PUT: records what it was given. */
class FakeXhr {
  static last: FakeXhr | undefined;
  static failWith: number | undefined;

  headers: Record<string, string> = {};
  method = "";
  url = "";
  body: unknown;
  status = 200;
  aborted = false;
  upload = {
    addEventListener: (type: string, fn: (e: unknown) => void) =>
      this.on(type, fn),
  };
  private listeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor() {
    FakeXhr.last = this;
  }
  private on(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.on(type, fn);
  }
  private emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners[type] ?? []) {
      fn(event);
    }
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  abort() {
    this.aborted = true;
    this.emit("abort");
  }
  send(body: unknown) {
    this.body = body;
    queueMicrotask(() => {
      if (this.aborted) {
        return;
      }
      this.emit("progress", { lengthComputable: true, loaded: 5, total: 10 });
      this.status = FakeXhr.failWith ?? 200;
      this.emit("load");
    });
  }
}

const pngFile = (name = "photo.png", size = 10) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  FakeXhr.last = undefined;
  FakeXhr.failWith = undefined;
  rpc.createUpload.mockReset().mockResolvedValue({
    fileId: "file-1",
    key: "org/o1/obj/photo.png",
    uploadUrl: "https://bucket.test/org/o1/obj/photo.png?sig",
  });
  rpc.confirmUpload
    .mockReset()
    .mockResolvedValue({ id: "file-1", size: 10, status: "ready" });
});

describe("uploadFile", () => {
  it("walks idle -> uploading -> processing -> done and returns the confirmed row", async () => {
    const states: string[] = [];

    const result = await uploadFile(pngFile(), {
      onStateChange: (s) => states.push(s),
    });

    expect(states).toEqual(["uploading", "processing", "done"]);
    expect(result).toMatchObject({ status: "ready" });
    expect(rpc.confirmUpload).toHaveBeenCalledWith(
      { fileId: "file-1" },
      expect.anything()
    );
  });

  it("PUTs the bytes to the presigned URL with the declared content type", async () => {
    await uploadFile(pngFile());

    expect(FakeXhr.last?.method).toBe("PUT");
    expect(FakeXhr.last?.url).toBe(
      "https://bucket.test/org/o1/obj/photo.png?sig"
    );
    expect(FakeXhr.last?.headers["Content-Type"]).toBe("image/png");
  });

  it("reports progress and always finishes at 1", async () => {
    const progress: number[] = [];

    await uploadFile(pngFile(), { onProgress: (p) => progress.push(p) });

    expect(progress[0]).toBe(0.5);
    expect(progress.at(-1)).toBe(1);
  });

  it("rejects a disallowed content type before any request is made", async () => {
    const states: string[] = [];
    const bad = new File([new Uint8Array(4)], "x.exe", {
      type: "application/x-msdownload",
    });

    await expect(
      uploadFile(bad, { onStateChange: (s) => states.push(s) })
    ).rejects.toThrow(/Unsupported file type/u);

    expect(rpc.createUpload).not.toHaveBeenCalled();
    expect(states).toEqual(["uploading", "error"]);
  });

  it("surfaces a non-2xx from the bucket and never confirms", async () => {
    FakeXhr.failWith = 403;

    await expect(uploadFile(pngFile())).rejects.toThrow(/status 403/u);
    expect(rpc.confirmUpload).not.toHaveBeenCalled();
  });

  it("aborts in flight and ends in the error state", async () => {
    const controller = new AbortController();
    const states: string[] = [];

    const pending = uploadFile(pngFile(), {
      onStateChange: (s) => states.push(s),
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow();
    expect(states.at(-1)).toBe("error");
    expect(rpc.confirmUpload).not.toHaveBeenCalled();
  });
});
