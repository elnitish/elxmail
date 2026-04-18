'use strict';

const { EventEmitter } = require('events');

/**
 * Central event bus for elxmail.
 * All components communicate through this bus — they emit events
 * instead of calling each other directly. This keeps everything
 * decoupled and testable.
 *
 * Supports namespaced events with wildcard matching:
 *   bus.on('bounce:hard', fn)   — specific event
 *   bus.on('bounce:*', fn)      — all bounce events
 *
 * Known event types:
 *   sent, delivered, bounced, bounce:hard, bounce:soft,
 *   complained, opened, clicked,
 *   throttle:limit, throttle:cooldown,
 *   warmup:limit, warmup:complete,
 *   dns:warning, dns:pass,
 *   domain:unhealthy, domain:healthy,
 *   queue:drained, queue:paused, queue:resumed,
 *   transport:error, transport:connected
 */
class ElxEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this._wildcardListeners = new Map(); // pattern → Set<fn>
  }

  /**
   * Register a listener. Supports wildcard patterns like 'bounce:*'.
   */
  on(event, fn) {
    if (event.includes('*')) {
      if (!this._wildcardListeners.has(event)) {
        this._wildcardListeners.set(event, new Set());
      }
      this._wildcardListeners.get(event).add(fn);
      return this;
    }
    return super.on(event, fn);
  }

  /**
   * Remove a listener. Handles wildcard patterns.
   */
  off(event, fn) {
    if (event.includes('*')) {
      const listeners = this._wildcardListeners.get(event);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) this._wildcardListeners.delete(event);
      }
      return this;
    }
    return super.off(event, fn);
  }

  /**
   * Emit an event. Also triggers matching wildcard listeners.
   */
  emit(event, ...args) {
    super.emit(event, ...args);

    // Check wildcard listeners
    for (const [pattern, listeners] of this._wildcardListeners) {
      if (this._matchWildcard(pattern, event)) {
        for (const fn of listeners) {
          fn(...args);
        }
      }
    }

    return this;
  }

  /**
   * Match a wildcard pattern against an event name.
   * 'bounce:*' matches 'bounce:hard', 'bounce:soft'
   * '*' matches everything
   */
  _matchWildcard(pattern, event) {
    if (pattern === '*') return true;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(event);
  }

  /**
   * Remove all listeners and wildcard listeners. Used in shutdown/reset.
   */
  removeAllListeners(event) {
    if (event) {
      this._wildcardListeners.delete(event);
    } else {
      this._wildcardListeners.clear();
    }
    return super.removeAllListeners(event);
  }
}

// Singleton — all components share the same bus
const bus = new ElxEventBus();

module.exports = bus;
