export type McpNativeOAuthErrorCode =
  | "authorization-denied"
  | "callback-mismatch"
  | "invalid-callback"
  | "invalid-configuration"
  | "invalid-storage"
  | "resource-mismatch"
  | "reauthorization-denied"
  | "state-mismatch";

export class McpNativeOAuthError extends Error {
  readonly code: McpNativeOAuthErrorCode;

  constructor(code: McpNativeOAuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpNativeOAuthError";
    this.code = code;
  }
}
