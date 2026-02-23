
export class CommandFailedError extends Error {
  constructor(message: string) {
    super(message);
  }
}