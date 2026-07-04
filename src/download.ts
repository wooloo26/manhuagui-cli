const DEFAULT_CDN_HOSTS = Object.freeze(["eu", "eu1", "eu2", "us", "us1", "us2", "us3"]);

const CDN_HOSTS: readonly string[] = (() => {
  const env = process.env.CDN_HOSTS;
  if (env) {
    const hosts = env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hosts.length > 0) return Object.freeze(hosts);
  }
  return DEFAULT_CDN_HOSTS;
})();

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
