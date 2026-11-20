import { hostnameOf, isLocalHost } from "@/lib/gate/studio";

/**
 * Whether the assistant API may be used: like the studio, only from this machine and never on a hosted deployment,
 * where anyone could spend the API key's credit. Opening it up waits on the accounts decision.
 * @param host - The request's `Host` header, or null when it has none.
 * @param deployed - Whether this is a hosted deployment.
 * @returns True when the request may go through.
 */
export const assistantOpen = (host: string | null, deployed: boolean): boolean =>
  !deployed && host !== null && isLocalHost(hostnameOf(host));
