const isBrowser = typeof window !== 'undefined';

// Determine execution environment
const isLocalhost = isBrowser && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.local')
);

const CONFIG = {
  ENVIRONMENT: isLocalhost ? 'development' : 'production',
  
  // Secret key required to unlock Test Mode on the live website
  // Only you and your authorized staff should know this key
  TEST_SECRET_KEY: 'gurudev_test_2026',

  SUPABASE_URL: 'https://mzwhtvlqvrkhmhzosugj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d2h0dmxxdnJraG1oem9zdWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzU1NDMsImV4cCI6MjA5NDg1MTU0M30.K4CQXUYVgOvDzNggifJ8_D6IrcAAvkMk8bMaQL5HR7c',
  UPI_ID: '8007768327@barodampay',
  UPI_NAME: 'SURYA KANTA DAS',
  DELIVERY_CHARGE: 70, // Default fallback base rate
  // India Post Courier Tariff for Books dispatched from Pune
  PACKING_WEIGHT_GRAMS: 20,
  DEFAULT_BOOK_WEIGHT_GRAMS: 150, // Safe fallback if weight_grams is not defined in DB
  SHIPPING_SLABS: [
    { maxWeight: 500,  mhRate: 70,  otherRate: 72 },
    { maxWeight: 1000, mhRate: 106, otherRate: 114 },
    { maxWeight: 1500, mhRate: 142, otherRate: 171 },
    { maxWeight: 2000, mhRate: 198, otherRate: 239 },
    { maxWeight: 3000, mhRate: 277, otherRate: 337 },
    { maxWeight: 4000, mhRate: 344, otherRate: 420 },
    { maxWeight: 5000, mhRate: 420, otherRate: 515 },
  ],
  SHIPPING_ABOVE_5KG: {
    baseMh: 420,
    baseOther: 515,
    perKgMh: 70,
    perKgOther: 90
  },
  ADMIN_EMAILS: ['admin1@srilagurudev.com'],
  // Web3Forms Admin Email Notifications (100% Free, up to 10,000 emails/month)
  // Get your free Access Key at: https://web3forms.com
  WEB3FORMS_ACCESS_KEY: 'eafe9b76-6ddb-4e4a-a386-ef89444e219a', 

  /**
   * SECURITY GATE: Checks whether the caller is authorized to use Test Mode.
   * On live deployments, Test Mode is STRICTLY RESTRICTED to verified Admin logins.
   * Public visitors typing ?test=1 will be BLOCKED with zero public access.
   */
  isAuthorizedForTestMode() {
    if (!isBrowser) return true; // Node test runner is always authorized

    // 1. Local development is permitted for developers
    if (isLocalhost) return true;

    // 2. Strict Store Admin Login Verification
    // Only administrators who have logged in with their admin account at admin.html
    const adminSession = localStorage.getItem('admin_session');
    if (adminSession) {
      try {
        const session = JSON.parse(adminSession);
        if (session && session.user && session.user.email) {
          const emailList = (this.ADMIN_EMAILS || []).map(e => e.toLowerCase());
          if (emailList.includes(session.user.email.toLowerCase())) {
            return true;
          }
        }
      } catch (e) {}
    }

    return false;
  },

  /**
   * Returns whether test mode is currently active AND authorized.
   */
  isTestMode() {
    if (!isBrowser) return false;
    const isTestRequested = (
      new URLSearchParams(window.location.search).get('test') === '1' ||
      new URLSearchParams(window.location.search).get('test_mode') === 'true' ||
      localStorage.getItem('gurudev_test_mode') === 'true'
    );
    return Boolean(isTestRequested && this.isAuthorizedForTestMode());
  },

  /**
   * Helper to enable or disable Test Mode in the current browser
   */
  setTestMode(enabled) {
    if (isBrowser) {
      if (enabled) {
        localStorage.setItem('gurudev_test_mode', 'true');
      } else {
        localStorage.removeItem('gurudev_test_mode');
        localStorage.removeItem('gurudev_test_key');
      }
    }
  },

  /**
   * Displays an alert and strips ?test=1 if an unauthorized user attempts to access test mode
   */
  showAdminLoginRequiredNotice() {
    if (isBrowser && window.history && window.history.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('test');
        url.searchParams.delete('test_mode');
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
      } catch (e) {}
    }

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: '🔒 Admin Login Required',
        text: 'Test Mode is restricted exclusively to store administrators. Public access is disabled. Please log in with your Admin credentials to use Test Mode.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4A1525',
        cancelButtonColor: '#78716C',
        confirmButtonText: 'Go to Staff Login',
        cancelButtonText: 'Continue as Customer'
      }).then(result => {
        if (result.isConfirmed) {
          window.location.href = 'admin.html';
        }
      });
    } else if (typeof alert !== 'undefined') {
      alert('Test Mode is restricted exclusively to store administrators. Please log in at Staff Login.');
    }
  }
};

// Node.js module export for testing framework
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
