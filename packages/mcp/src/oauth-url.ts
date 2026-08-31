import { McpNativeOAuthError } from "./oauth-error.js";

export const MAX_AUTHORIZATION_URL_CODE_UNITS = 8_192;
export const MAX_CALLBACK_CODE_UNITS = 8_192;
export const MAX_CALLBACK_PARAMETERS = 16;
export const MAX_CALLBACK_PARAMETER_NAME_CODE_UNITS = 128;
export const MAX_CALLBACK_PARAMETER_VALUE_CODE_UNITS = 4_096;
export const MAX_OAUTH_ISSUER_CODE_UNITS = 2_048;

const MAX_CALLBACK_CODE_VALUE_CODE_UNITS = 4_096;
const MAX_CALLBACK_STATE_VALUE_CODE_UNITS = 512;
const RESERVED_CALLBACK_PARAMETERS = 2;

export function assertOAuthRedirectParameterBudget(url: URL): void {
  const parameters = [...url.searchParams];
  if (parameters.length > MAX_CALLBACK_PARAMETERS - RESERVED_CALLBACK_PARAMETERS) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth redirect URL leaves insufficient callback parameter capacity",
    );
  }
  for (const [name, value] of parameters) {
    if (
      name.length > MAX_CALLBACK_PARAMETER_NAME_CODE_UNITS ||
      value.length > MAX_CALLBACK_PARAMETER_VALUE_CODE_UNITS
    ) {
      throw new McpNativeOAuthError(
        "invalid-configuration",
        "OAuth redirect URL contains a parameter that exceeds the callback budget",
      );
    }
  }

  const maximumSuccessCallback = new URL(url.href);
  maximumSuccessCallback.searchParams.append(
    "code",
    "c".repeat(MAX_CALLBACK_CODE_VALUE_CODE_UNITS),
  );
  maximumSuccessCallback.searchParams.append(
    "state",
    "s".repeat(MAX_CALLBACK_STATE_VALUE_CODE_UNITS),
  );
  if (maximumSuccessCallback.href.length > MAX_CALLBACK_CODE_UNITS) {
    throw new McpNativeOAuthError(
      "invalid-configuration",
      "OAuth redirect URL leaves insufficient callback URL capacity",
    );
  }
}

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
