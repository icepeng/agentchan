export function isHonoDevPath(url: string): boolean {
  const pathname = parsePathname(url);
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/renderer-shell.html" ||
    pathname === "/renderer-bootstrap.js" ||
    pathname === "/host-theme.css"
  );
}

function parsePathname(url: string): string {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split("?")[0] ?? "";
  }
}
