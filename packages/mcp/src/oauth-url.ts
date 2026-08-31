export const MAX_AUTHORIZATION_URL_CODE_UNITS = 8_192;

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.slice(1).every((octet) => /^(?:0|[1-9][0-9]{0,2})$/u.test(octet) && Number(octet) <= 255)
  );
}
