'use strict';

const bus = require('../events');

/**
 * Queue processor — the consumer loop.
 * Pulls emails from the queue, runs them through the send pipeline,
 * and manages concurrency.
 *
 * Uses setImmediate() to avoid blocking the event loop.
 * Respects pause/resume signals.
 */
class Processor {
  /**
   * @param {Object} options
   * @param {Object} options.queue - Queue adapter instance (MemoryQueue)
   * @param {Function} options.sendFn - Async function that sends a single email job
   * @param {number} [options.concurrency=10] - Max parallel sends
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    this._queue = options.queue;
    this._sendFn = options.sendFn;
    this._concurrency = options.concurrency || 10;
    this._logger = options.logger || null;
    this._active = 0;      // Currently sending
    this._running = false;  // Processing loop active
    this._paused = false;
    this._stats = { sent: 0, failed: 0, retried: 0 };
    this._drainResolvers = [];  // Promises waiting for queue to empty
  }

  /**
   * Start the processing loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._tick();
  }

  /**
   * Stop the processing loop. Active sends finish.
   */
  stop() {
    this._running = false;
  }

  /**
   * Pause processing. Active sends finish but no new ones start.
   */
  pause() {
    this._paused = true;
    bus.emit('queue:paused');
  }

  /**
   * Resume processing after pause.
   */
  resume() {
    if (!this._paused) return;
    this._paused = false;
    bus.emit('queue:resumed');
    if (this._running) this._tick();
  }

  /**
   * Wait until the queue is empty and all active sends complete.
   * @returns {Promise<void>}
   */
  waitForDrain() {
    if (this._queue.size() === 0 && this._active === 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this._drainResolvers.push(resolve);
    });
  }

  /**
   * Wake up the processor — schedule a tick.
   * Called by the queue manager when new items are added.
   */
  notify() {
    if (this._running && !this._paused) {
      setImmediate(() => this._tick());
    }
  }

  /**
   * The main tick — dequeue items up to concurrency limit and process them.
   */
  _tick() {
    if (!this._running || this._paused) return;

    // Fill up to concurrency
    while (this._active < this._concurrency && this._queue.readyCount() > 0) {
      const job = this._queue.dequeue();
      if (!job) break;
      this._active++;
      this._processJob(job);
    }

    // Schedule next tick if there's more work (or delayed items pending)
    if (this._running && !this._paused && (this._queue.size() > 0 || this._active > 0)) {
      setImmediate(() => this._tick());
    }
  }

  /**
   * Process a single job.
   */
  async _processJob(job) {
    try {
      await this._sendFn(job);
      this._stats.sent++;
    } catch (err) {
      this._stats.failed++;
      if (this._logger) {
        this._logger.error(`Job failed: ${err.message}`, {
          to: job.email?.to,
          attempt: job.attempt,
          error: err.message
        });
      }
    } finally {
      this._active--;
      this._checkDrain();
      // Continue processing
      if (this._running && !this._paused) {
        setImmediate(() => this._tick());
      }
    }
  }

  /**
   * Check if queue is drained (empty + no active) and resolve waiters.
   */
  _checkDrain() {
    if (this._queue.size() === 0 && this._active === 0) {
      bus.emit('queue:drained');
      for (const resolve of this._drainResolvers) {
        resolve();
      }
      this._drainResolvers = [];
    }
  }

  /**
   * Get processor status.
   */
  status() {
    return {
      running: this._running,
      paused: this._paused,
      active: this._active,
      queued: this._queue.size(),
      ready: this._queue.readyCount(),
      stats: { ...this._stats }
    };
  }
}

module.exports = { Processor };
