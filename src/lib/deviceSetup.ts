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

export function getDeviceIdentifier(): string {
  try {
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
    localStorage.setItem("device_id", safeContext.device_id);
    localStorage.setItem("device_context", JSON.stringify(safeContext));
  } catch {
    throw new Error("localStorage unavailable");
  }
}
