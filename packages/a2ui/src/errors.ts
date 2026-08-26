export class A2uiParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "A2uiParseError";
  }
}

export class A2uiResourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "A2uiResourceError";
  }
}
