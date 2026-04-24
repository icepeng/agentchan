export interface DevPorts {
  serverPort: number;
  clientPort: number;
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;

  return port;
}

export function resolveDevPorts(env: Record<string, string | undefined> = process.env): DevPorts {
  const portlessPort = parsePort(env.PORT);
  const hasPortlessPort = Boolean(env.PORTLESS_URL) && portlessPort !== undefined;

  return {
    serverPort: parsePort(env.SERVER_PORT) ?? (hasPortlessPort ? portlessPort + 1 : 3000),
    clientPort: parsePort(env.CLIENT_PORT) ?? (hasPortlessPort ? portlessPort : 4100),
  };
}
