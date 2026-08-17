type QueueTask = () => Promise<any>;

class MediaQueue {
  private queue: Array<{ task: QueueTask; resolve: (val: any) => void; reject: (err: any) => void }> = [];
  private activeCount = 0;
  private maxConcurrency = 2; // At most 2 concurrent downloads to prevent API server spamming

  enqueue<T>(task: QueueTask): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  private next() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    item.task()
      .then((val) => {
        this.activeCount--;
        item.resolve(val);
        this.next();
      })
      .catch((err) => {
        this.activeCount--;
        item.reject(err);
        this.next();
      });
  }
}

export const globalMediaQueue = new MediaQueue();
