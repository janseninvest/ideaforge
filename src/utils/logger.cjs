'use strict';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function info(mod, message) {
  console.log(`${colors.green}[${timestamp()}] [${mod}]${colors.reset} ${message}`);
}

function error(mod, message) {
  console.error(`${colors.red}[${timestamp()}] [${mod}] ERROR:${colors.reset} ${message}`);
}

function debug(mod, message) {
  if (process.env.DEBUG) {
    console.log(`${colors.gray}[${timestamp()}] [${mod}] ${message}${colors.reset}`);
  }
}

function warn(mod, message) {
  console.log(`${colors.yellow}[${timestamp()}] [${mod}] WARN:${colors.reset} ${message}`);
}

module.exports = { info, error, debug, warn };
