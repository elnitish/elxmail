'use strict';

const net = require('net');

/**
 * IP address utilities — validation and classification.
 */

/**
 * Validate an IP address (IPv4 or IPv6).
 * @param {string} ip
 * @returns {boolean}
 */
function isValid(ip) {
  return net.isIP(ip) !== 0;
}

/**
 * Check if an IP is IPv4.
 * @param {string} ip
 * @returns {boolean}
 */
function isIPv4(ip) {
  return net.isIPv4(ip);
}

/**
 * Check if an IP is IPv6.
 * @param {string} ip
 * @returns {boolean}
 */
function isIPv6(ip) {
  return net.isIPv6(ip);
}

/**
 * Check if an IP is private/reserved.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 10.x.x.x
    if (parts[0] === 10) return true;
    // 172.16.x.x - 172.31.x.x
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.x.x
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.x.x.x
    if (parts[0] === 127) return true;
    return false;
  }
  // IPv6 loopback and link-local
  if (ip === '::1') return true;
  if (ip.startsWith('fe80:')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

/**
 * Normalize an IP address to a consistent format.
 * @param {string} ip
 * @returns {string}
 */
function normalize(ip) {
  if (!ip) return '';
  return ip.trim().toLowerCase();
}

module.exports = { isValid, isIPv4, isIPv6, isPrivate, normalize };
