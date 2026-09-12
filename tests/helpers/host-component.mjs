import { createElement } from "react";

export function hostComponent(type) {
  return function HostComponent(props) {
    return createElement(type, props, props.children);
  };
}
