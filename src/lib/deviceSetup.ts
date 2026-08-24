export type PublicWorker = {
  id: string;
  full_name: string | null;
};

export type DeviceContext = {
  device_id: string;
  device_identifier: string;
  school_id: string;
  school_name: string | null;
  workers: PublicWorker[];
};

const deviceIdentifierKey = "device_identifier";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceContextKey = "device_context";

export function assertDeviceStorageAvailable(): void {
  try {
    localStorage.setItem("__device_setup_probe__", "1");
    localStorage.removeItem("__device_setup_probe__");
  } catch {
    throw new Error("localStorage unavailable");
  }
}

export function getDeviceIdentifier(): string {
  try {
    const storedContext = localStorage.getItem(deviceContextKey);
    if (storedContext) {
      let parsedContext: { device_identifier?: unknown } | null = null;
      try {
        parsedContext = JSON.parse(storedContext) as {
          device_identifier?: unknown;
        };
      } catch {
        parsedContext = null;
      }
      if (
        typeof parsedContext?.device_identifier === "string" &&
        uuidPattern.test(parsedContext.device_identifier)
      ) {
        return parsedContext.device_identifier;
      }
    }

    const storedIdentifier = localStorage.getItem(deviceIdentifierKey);
    if (storedIdentifier && uuidPattern.test(storedIdentifier)) {
      return storedIdentifier;
    }

    const identifier = crypto.randomUUID();
    localStorage.setItem(deviceIdentifierKey, identifier);
    return identifier;
  } catch {
    throw new Error("localStorage unavailable");
  }
}

export function saveDeviceContext(context: DeviceContext): void {
  const safeContext: DeviceContext = {
    device_id: context.device_id,
    device_identifier: context.device_identifier,
    school_id: context.school_id,
    school_name: context.school_name,
    workers: context.workers.map(({ id, full_name }) => ({ id, full_name })),
  };

  try {
    localStorage.setItem("device_context", JSON.stringify(safeContext));
  } catch {
    throw new Error("localStorage unavailable");
  }
}
