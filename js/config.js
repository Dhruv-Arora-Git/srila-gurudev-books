const CONFIG = {
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
};
