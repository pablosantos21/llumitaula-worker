export type PublicMonitor = {
  id: string;
  first_name: string;
  last_name: string;
  login_email: string;
};

export type DeviceContext = {
  device_id: string;
  device_identifier: string;
  school_id: string;
  school_name: string | null;
  monitors: PublicMonitor[];
};

const deviceIdentifierKey = "device_identifier";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceContextKey = "device_context";
const setupCodeKey = "device_setup_code";

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

export function getDeviceContext(): DeviceContext | null {
  try {
    const raw = localStorage.getItem(deviceContextKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceContext;
    if (
      parsed &&
      typeof parsed.device_id === "string" &&
      typeof parsed.device_identifier === "string" &&
      typeof parsed.school_id === "string" &&
      Array.isArray(parsed.monitors)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDeviceContext(context: DeviceContext): void {
  const monitors = normalizeMonitors(context.monitors) ?? [];
  const safeContext: DeviceContext = {
    device_id: context.device_id,
    device_identifier: context.device_identifier,
    school_id: context.school_id,
    school_name: context.school_name,
    monitors,
  };

  try {
    localStorage.setItem("device_context", JSON.stringify(safeContext));
  } catch {
    throw new Error("localStorage unavailable");
  }
}

export function saveSetupCode(code: string): void {
  try {
    localStorage.setItem(setupCodeKey, code.trim());
  } catch {
    throw new Error("localStorage unavailable");
  }
}

export function getSetupCode(): string | null {
  try {
    return localStorage.getItem(setupCodeKey);
  } catch {
    return null;
  }
}

function fallbackLoginEmail(
  firstName: string,
  lastName: string,
): string {
  return `${firstName.trim().toLowerCase()}.${lastName.trim().toLowerCase()}@llumitaula.local`;
}

export function normalizeMonitors(value: unknown): PublicMonitor[] | null {
  if (!Array.isArray(value)) return null;
  const monitors: PublicMonitor[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return null;
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.first_name !== "string" ||
      typeof candidate.last_name !== "string"
    ) {
      return null;
    }
    const loginEmail =
      typeof candidate.login_email === "string" && candidate.login_email.length > 0
        ? candidate.login_email
        : fallbackLoginEmail(candidate.first_name, candidate.last_name);
    monitors.push({
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      login_email: loginEmail,
    });
  }
  return monitors;
}

export type LinkedDeviceContext = DeviceContext & { ok: true };

export function normalizeDeviceContext(value: unknown): LinkedDeviceContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.ok !== true) return null;
  if (
    typeof candidate.device_id !== "string" ||
    typeof candidate.device_identifier !== "string" ||
    typeof candidate.school_id !== "string"
  ) {
    return null;
  }
  const schoolName =
    typeof candidate.school_name === "string" || candidate.school_name === null
      ? candidate.school_name
      : null;
  if (candidate.school_name !== undefined && schoolName === null && candidate.school_name !== null) {
    return null;
  }
  const monitors = normalizeMonitors(candidate.monitors);
  if (!monitors) return null;
  return {
    ok: true,
    device_id: candidate.device_id,
    device_identifier: candidate.device_identifier,
    school_id: candidate.school_id,
    school_name: (candidate.school_name as string | null) ?? null,
    monitors,
  };
}

export function hasLinkedDevice(): boolean {
  return getDeviceContext() !== null && getSetupCode() !== null;
}

export function clearDeviceLink(): void {
  try {
    localStorage.removeItem(deviceContextKey);
    localStorage.removeItem(setupCodeKey);
  } catch {
    throw new Error("localStorage unavailable");
  }
}
