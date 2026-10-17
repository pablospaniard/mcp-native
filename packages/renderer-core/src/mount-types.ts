import type { NativeSurfaceParentLayout } from "./component-shapes.js";
import type { NativeComponentName } from "./index.js";

export type A2uiV1NativeMountDiagnosticCode =
  | "component-not-allowed"
  | "layout-incompatible"
  | "missing-component"
  | "missing-extension-registration"
  | "render-plan-rejected"
  | "surface-invalid";

export interface A2uiV1NativeMountDiagnostic {
  readonly code: A2uiV1NativeMountDiagnosticCode;
  readonly message: string;
  readonly componentName?: string;
  readonly nativeElementKey?: string;
  readonly parentLayout?: NativeSurfaceParentLayout;
  readonly sourceComponentId?: string;
}

export interface A2uiV1NativeMountReport {
  readonly ok: boolean;
  readonly diagnostics: readonly A2uiV1NativeMountDiagnostic[];
  readonly requiredNativeComponentNames: readonly NativeComponentName[];
}

export interface InspectA2uiV1NativeMountOptions {
  /** External parent supplied by the application shell. Defaults to `unbounded`. */
  readonly parentLayout?: NativeSurfaceParentLayout;
}

/** Stable mount failure with no raw server, transport, or adapter exception in its message. */
export class A2uiV1NativeMountError extends Error {
  readonly code: A2uiV1NativeMountDiagnosticCode;
  readonly diagnostic: A2uiV1NativeMountDiagnostic;
  readonly report: A2uiV1NativeMountReport;

  constructor(report: A2uiV1NativeMountReport, options?: ErrorOptions) {
    const diagnostic = report.diagnostics[0];
    if (diagnostic === undefined) {
      throw new TypeError("A native mount error requires at least one diagnostic");
    }
    super(diagnostic.message, options);
    this.name = "A2uiV1NativeMountError";
    this.code = diagnostic.code;
    this.diagnostic = diagnostic;
    this.report = report;
  }
}
