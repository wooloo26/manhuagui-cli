export class CancelledError extends Error {
  constructor() {
    super("User cancelled");
    this.name = "CancelledError";
  }
}
