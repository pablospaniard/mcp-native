import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  readonly label?: string;
  readonly tone?: string;
}

export default codegenNativeComponent<NativeProps>(
  "McpNativeStatusBadge",
) as HostComponent<NativeProps>;
