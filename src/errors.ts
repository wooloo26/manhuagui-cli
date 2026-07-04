export class CanceledError extends Error {
  constructor() {
    super("User canceled");
    this.name = "CanceledError";
  }
}
