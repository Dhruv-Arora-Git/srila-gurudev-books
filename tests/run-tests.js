#!/usr/bin/env node

/**
 * Gurudev Books - Automated Test Suite Runner (CLI)
 * 
 * Executes all unit, integration, and security test suites in terminal or CI/CD.
 */

const { testSuites } = require('./test-utils');

// Load test suites
require('./shipping.test');
require('./cart.test');
require('./security.test');
require('./isolation.test');

// ANSI Color codes for clean terminal output
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

async function runAllTests() {
  console.log(`\n${BOLD}${CYAN}====================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   Gurudev Books - Automated Testing Framework      ${RESET}`);
  console.log(`${BOLD}${CYAN}====================================================${RESET}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const startTime = Date.now();

  for (const suite of testSuites) {
    console.log(`${BOLD}📦 Suite: ${suite.name}${RESET}`);

    for (const t of suite.tests) {
      totalTests++;
      const testStart = Date.now();
      try {
        await t.fn();
        const duration = Date.now() - testStart;
        passedTests++;
        console.log(`  ${GREEN}✓${RESET} ${t.name} ${GRAY}(${duration}ms)${RESET}`);
      } catch (err) {
        const duration = Date.now() - testStart;
        failedTests++;
        console.log(`  ${RED}✗ ${t.name} (${duration}ms)${RESET}`);
        console.log(`    ${RED}${err.message}${RESET}`);
        if (err.stack) {
          const lines = err.stack.split('\n').slice(1, 3);
          console.log(`    ${GRAY}${lines.join('\n    ')}${RESET}`);
        }
      }
    }
    console.log('');
  }

  const elapsed = Date.now() - startTime;

  console.log(`${BOLD}----------------------------------------------------${RESET}`);
  console.log(`${BOLD}Test Summary:${RESET}`);
  console.log(`  Total:  ${totalTests}`);
  console.log(`  Passed: ${GREEN}${passedTests}${RESET}`);
  console.log(`  Failed: ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
  console.log(`  Time:   ${elapsed}ms`);
  console.log(`${BOLD}----------------------------------------------------${RESET}\n`);

  if (failedTests > 0) {
    console.log(`${RED}${BOLD}❌ Some tests failed. Please review the errors above.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`${GREEN}${BOLD}✅ All tests passed successfully! Production safety & isolation verified.${RESET}\n`);
    process.exit(0);
  }
}

runAllTests();
