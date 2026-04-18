'use strict';

/**
 * In-memory priority queue using a sorted array.
 * Lower priority number = higher priority (Gmail=1, Outlook=2, default=5).
 *
 * For small-to-medium volumes and development use.
 * Items are inserted in priority order and dequeued from the front.
 */
class MemoryQueue {
  constructor() {
    this._items = [];    // Sorted by priority (ascending)
    this._delayed = [];  // Items waiting for their retry time
  }

  /**
   * Add an item to the queue with a priority.
   * @param {Object} item - The email job
   * @param {number} [priority=5] - Lower = higher priority
   * @param {number} [notBefore=0] - Timestamp — don't dequeue before this time
   */
  enqueue(item, priority = 5, notBefore = 0) {
    const entry = { item, priority, notBefore, enqueuedAt: Date.now() };

    if (notBefore > Date.now()) {
      this._delayed.push(entry);
      return;
    }

    // Binary search for insertion point to maintain sort order
    let lo = 0, hi = this._items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._items[mid].priority <= priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this._items.splice(lo, 0, entry);
  }

  /**
   * Remove and return the highest-priority item.
   * Also promotes any delayed items whose time has come.
   * @returns {Object|null}
   */
  dequeue() {
    this._promoteDelayed();
    if (this._items.length === 0) return null;
    return this._items.shift().item;
  }

  /**
   * Look at the next item without removing it.
   * @returns {Object|null}
   */
  peek() {
    this._promoteDelayed();
    if (this._items.length === 0) return null;
    return this._items[0].item;
  }

  /**
   * Move delayed items to the main queue if their time has come.
   */
  _promoteDelayed() {
    const now = Date.now();
    const ready = [];
    const stillDelayed = [];

    for (const entry of this._delayed) {
      if (entry.notBefore <= now) {
        ready.push(entry);
      } else {
        stillDelayed.push(entry);
      }
    }

    this._delayed = stillDelayed;

    for (const entry of ready) {
      entry.notBefore = 0;
      this.enqueue(entry.item, entry.priority, 0);
    }
  }

  /**
   * Total items (ready + delayed).
   * @returns {number}
   */
  size() {
    return this._items.length + this._delayed.length;
  }

  /**
   * Items ready to process.
   * @returns {number}
   */
  readyCount() {
    this._promoteDelayed();
    return this._items.length;
  }

  /**
   * Clear all items.
   */
  clear() {
    this._items = [];
    this._delayed = [];
  }

  /**
   * Drain all items and return them.
   * @returns {Object[]}
   */
  drain() {
    this._promoteDelayed();
    const items = this._items.map(e => e.item);
    this._items = [];
    return items;
  }
}

module.exports = { MemoryQueue };
