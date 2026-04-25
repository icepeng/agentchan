const EXTERNAL_STYLESHEET_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://cdn.jsdelivr.net",
] as const;

const EXTERNAL_FONT_ORIGINS = [
  "https://fonts.gstatic.com",
  "https://cdn.jsdelivr.net",
] as const;

const EXTERNAL_PRECONNECT_ORIGINS = Array.from(new Set([
  ...EXTERNAL_STYLESHEET_ORIGINS,
  ...EXTERNAL_FONT_ORIGINS,
]));

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' blob:",
  `style-src 'self' 'unsafe-inline' ${EXTERNAL_STYLESHEET_ORIGINS.join(" ")}`,
  `font-src 'self' data: ${EXTERNAL_FONT_ORIGINS.join(" ")}`,
  `connect-src 'self' ${EXTERNAL_PRECONNECT_ORIGINS.join(" ")}`,
].join("; ");
