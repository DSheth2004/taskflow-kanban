// A promise chain that runs jobs one at a time, in the order they were enqueued, so the
// server sees writes in the same order the user made them.
//
// Jobs with a key are coalesced: if a job with the same key is already waiting (enqueued
// but not started), the new one is dropped. Jobs read the latest store state when they
// start, so the waiting job will send the newest value anyway.
export function createMutationQueue() {
  let tail = Promise.resolve();
  const waiting = new Set();

  return {
    enqueue(key, job) {
      if (key != null && waiting.has(key)) return null;
      if (key != null) waiting.add(key);
      const run = tail.then(() => {
        if (key != null) waiting.delete(key);
        return job();
      });
      tail = run.catch(() => {}); // one failed job must not block the rest
      return run;
    },
    // Resolves once nothing is queued, including jobs enqueued by jobs (e.g. a refresh
    // queued after a 409).
    async whenIdle() {
      let current;
      do {
        current = tail;
        await current;
      } while (current !== tail);
    },
  };
}
