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
      tail = run.catch(() => {});
      return run;
    },

    async whenIdle() {
      let current;
      do {
        current = tail;
        await current;
      } while (current !== tail);
    },
  };
}
