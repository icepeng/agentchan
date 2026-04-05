const BASE = "/api";

export async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "") {
        if (currentEvent && currentData !== undefined) {
          onEvent(currentEvent, currentData);
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

export { BASE };
