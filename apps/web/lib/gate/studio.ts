import { locales } from "@/i18n/routing";

/** Hostnames that only resolve to this machine. */
const LOOPBACK: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const STUDIO_PATH = new RegExp(`^/(?:(${locales.join("|")})/)?studio(?:/|$)`);

/**
 * Whether a request's hostname is this machine, so the studio may be opened from it.
 * @param hostname - Such as `localhost` or `echidna.app`.
 * @returns True for loopback addresses and `*.localhost`.
 */
export const isLocalHost = (hostname: string) =>
  LOOPBACK.has(hostname) || hostname.endsWith(".localhost");

/**
 * The hostname in a `Host` header, without its port.
 * @param host - Such as `localhost:3000`, `[::1]:3000` or `echidna.app`.
 * @returns Such as `localhost`, `[::1]` or `echidna.app`.
 */
export const hostnameOf = (host: string) =>
  host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? host);

/**
 * Where a request for the studio from anywhere but this machine is sent instead: the home page in the same locale.
 * The `Host` header is what the visitor asked for; a deployment ignores it, as it could be forged.
 * @param pathname - The request path.
 * @param host - The request's `Host` header, or null when it has none.
 * @param deployed - Whether this is a hosted deployment, where the studio is always closed.
 * @returns The path to redirect to, or null when the request may go through.
 */
export const studioBounce = (
  pathname: string,
  host: string | null,
  deployed = false,
): string | null => {
  const match = STUDIO_PATH.exec(pathname);
  if (!match || (!deployed && host !== null && isLocalHost(hostnameOf(host)))) return null;
  return match[1] ? `/${match[1]}` : "/";
};
