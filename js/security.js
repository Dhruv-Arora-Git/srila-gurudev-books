/**
 * Gurudev Books - Security & Data Sanitization Utilities
 * 
 * Protects against:
 * 1. Stored & DOM-based XSS (Cross-Site Scripting)
 * 2. Unauthorized PII exposure in public tracking
 * 3. Invalid phone numbers and postal codes
 */

/**
 * Escapes unsafe HTML characters to prevent XSS injection.
 * @param {string|any} str 
 * @returns {string} Safe HTML string
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Masks a phone number to protect customer privacy on public trackers.
 * Example: "9876543210" -> "98******10"
 * @param {string} phone 
 * @returns {string} Masked phone number
 */
function maskPhone(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length >= 10) {
    return clean.slice(0, 2) + '******' + clean.slice(-2);
  }
  return '******' + (clean.length >= 2 ? clean.slice(-2) : '');
}

/**
 * Masks sensitive customer delivery address lines on public order tracking.
 * Preserves city, state, and pincode for verification while obscuring house/flat number.
 * Example: "Flat 402, Lotus Apt, MG Road | Pune, Maharashtra | 411038"
 *       -> "•••••••••••• | Pune, Maharashtra | 411038"
 * @param {string} address 
 * @returns {string} Masked address string
 */
function maskAddress(address) {
  if (!address) return '';
  const clean = String(address).trim();
  
  if (clean.includes(' | ')) {
    const parts = clean.split(' | ');
    const street = parts[0] || '';
    const cityState = parts[1] || '';
    const pincode = parts[2] || '';
    
    // Obscure street while retaining confirmation length
    const maskedStreet = street.length > 5 
      ? street.slice(0, 2) + '••••••••' 
      : '••••••••';
    
    return `${maskedStreet} | ${cityState} | ${pincode}`;
  }
  
  // Generic fallback if not formatted with pipe
  if (clean.length > 12) {
    return '••••••••, ' + clean.slice(Math.floor(clean.length * 0.5));
  }
  return '••••••••';
}

/**
 * Validates whether a phone number is a valid 10-digit Indian mobile number.
 * @param {string} phone 
 * @returns {boolean}
 */
function validatePhone(phone) {
  if (!phone) return false;
  const clean = String(phone).trim().replace(/\D/g, '');
  return clean.length === 10 && /^[6-9]\d{9}$/.test(clean);
}

/**
 * Validates whether a pincode is a valid 6-digit Indian postal code.
 * @param {string} pincode 
 * @returns {boolean}
 */
function validatePincode(pincode) {
  if (!pincode) return false;
  const clean = String(pincode).trim();
  return /^[1-9][0-9]{5}$/.test(clean);
}

// Export for Node.js test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    maskPhone,
    maskAddress,
    validatePhone,
    validatePincode
  };
}
