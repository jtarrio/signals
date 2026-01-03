/**
 * A class that lets you execute multiple async functions in a single 'thread'.
 *
 * Functions passed to the `run()` function will be executed in strict sequence.
 */
export class SingleThread {
  constructor() {
    this.promise = Promise.resolve();
  }

  private promise: Promise<any>;

  /**
   * Executes the provided async function.
   *
   * Functions passed to `run()` are executed in strict sequence: each function only starts after the previous one ends.
   *
   * Make sure your function doesn't throw, because then the behavior is undefined.
   */
  async run<T>(fn: () => Promise<T>) {
    this.promise = this.promise.then(() => fn());
    return this.promise;
  }
}
