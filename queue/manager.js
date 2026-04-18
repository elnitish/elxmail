'use strict';

const { MemoryQueue } = require('./adapters/memory');
const { Processor } = require('./processor');
const { calculate: calcPriority } = require('./priority');
const { ElxQueueError } = require('../errors');

/**
 * Queue Manager — public API for the email queue.
 * Wraps the queue adapter and processor, providing:
 *   add(), addBatch(), pause(), resume(), status(), drain()
 *
 * Each email is wrapped in a "job" object with metadata:
 *   { email, provider, priority, attempt, maxAttempts, createdAt }
 */
class QueueManager {
  /**
   * @param {Object} options
   * @param {Object} options.config - Queue config from store
   * @param {Function} options.sendFn - Async function that sends a single job
   * @param {Function} [options.classifyFn] - Classify email provider (returns string)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options) {
    const { config = {}, sendFn, classifyFn, logger } = options;

    this._config = config;
    this._classifyFn = classifyFn || (() => 'unknown');
    this._logger = logger;

    // Create queue adapter
    this._queue = new MemoryQueue();

    // Create processor
    this._processor = new Processor({
      queue: this._queue,
      sendFn,
      concurrency: config.concurrency || 10,
      logger
    });
  }

  /**
   * Add a single email to the queue.
   * @param {Object} email - { to, from, subject, body, data, ... }
   * @param {string} [provider] - Pre-classified provider (skips classification)
   * @returns {Object} - The created job
   */
  add(email, provider) {
    const prov = provider || this._classifyFn(email.to);
    const priority = calcPriority(prov, this._config.priority);

    const job = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      email,
      provider: prov,
      priority,
      attempt: 0,
      maxAttempts: this._config.retryAttempts || 3,
      retryDelay: this._config.retryDelay || 300,
      retryBackoff: this._config.retryBackoff || 'exponential',
      createdAt: Date.now()
    };

    this._queue.enqueue(job, priority);
    this._processor.notify();  // Wake up processor if idle
    return job;
  }

  /**
   * Add multiple emails to the queue.
   * @param {Object[]} emails - Array of email objects
   * @returns {Object[]} - Array of created jobs
   */
  addBatch(emails) {
    if (!Array.isArray(emails)) {
      throw new ElxQueueError('addBatch requires an array of emails');
    }
    return emails.map(email => this.add(email));
  }

  /**
   * Re-enqueue a failed job for retry with backoff delay.
   * @param {Object} job - The failed job
   */
  retry(job) {
    job.attempt++;

    if (job.attempt >= job.maxAttempts) {
      if (this._logger) {
        this._logger.warn(`Job exhausted retries`, { to: job.email.to, attempts: job.attempt });
      }
      return false;
    }

    // Calculate delay based on backoff strategy
    const baseDelay = (job.retryDelay || 300) * 1000; // convert to ms
    const delayMs = job.retryBackoff === 'exponential'
      ? baseDelay * Math.pow(2, job.attempt - 1)
      : baseDelay;

    const notBefore = Date.now() + delayMs;
    const retryPriority = calcPriority(job.provider, this._config.priority, job.attempt);

    this._queue.enqueue(job, retryPriority, notBefore);
    // Schedule a tick at retry time so delayed items get picked up
    setTimeout(() => this._processor.notify(), Math.max(0, notBefore - Date.now()) + 10).unref();

    if (this._logger) {
      this._logger.debug(`Job requeued for retry`, {
        to: job.email.to,
        attempt: job.attempt,
        retryIn: `${Math.round(delayMs / 1000)}s`
      });
    }

    return true;
  }

  /**
   * Start processing the queue.
   */
  start() {
    this._processor.start();
  }

  /**
   * Stop processing. Active sends finish.
   */
  stop() {
    this._processor.stop();
  }

  /**
   * Pause processing. Active sends finish but no new ones start.
   */
  pause() {
    this._processor.pause();
  }

  /**
   * Resume processing after pause.
   */
  resume() {
    this._processor.resume();
  }

  /**
   * Wait for queue to drain (all items processed).
   * @returns {Promise<void>}
   */
  drain() {
    return this._processor.waitForDrain();
  }

  /**
   * Get queue status.
   * @returns {Object}
   */
  status() {
    return this._processor.status();
  }

  /**
   * Clear all items from the queue.
   */
  clear() {
    this._queue.clear();
  }
}

module.exports = { QueueManager };
