const CDN_HOSTS = ["eu", "eu1", "eu2", "us", "us1", "us2", "us3"];

export function rotateHost(url: string): string {
  const parsed = new URL(url);
  const parts = parsed.hostname.split(".");
  if (parts.length >= 3) {
    const idx = CDN_HOSTS.indexOf(parts[0]);
    if (idx !== -1) {
      parts[0] = CDN_HOSTS[(idx + 1) % CDN_HOSTS.length];
      parsed.hostname = parts.join(".");
    }
  }
  return parsed.href;
}
