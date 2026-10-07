# Gurudev Books Store - Setup Guide

## Quick Start

### 1. Supabase Setup (Database)

1. Go to https://supabase.com and create a free account
2. Click **New Project**
3. Name: `gurudev-books`, set a strong database password, select **Singapore** region (closest to India)
4. Wait for project to initialize (~2 mins)

### 2. Get API Keys

1. Go to **Settings > API** in your Supabase dashboard
2. Copy **Project URL** and **anon public** key
3. Open `js/config.js` and replace:
   - `SUPABASE_URL` with your project URL
   - `SUPABASE_ANON_KEY` with your anon key

### 3. Run SQL Migration

1. Go to **SQL Editor** in Supabase dashboard
2. Copy all contents from `supabase-setup.sql`
3. Paste and click **Run**

### 4. Create Admin Accounts

1. Go to **Authentication > Users**
2. Click **Add User > Create New User**
3. Create 2 accounts:
   - Email: `admin1@yourdomain.com`, Password: (choose strong password)
   - Email: `admin2@yourdomain.com`, Password: (choose strong password)
4. Update `js/config.js` with these emails in `ADMIN_EMAILS`

### 5. Add Your Book Data

Open `js/books.js` and replace placeholder books with your actual data:

```js
const BOOKS = [
  {
    id: 1,
    title: 'Actual Book Title',
    price: 250,
    description: 'Book description...',
    image: 'assets/images/book1.jpg',
  },
  // ... add all 30-40 books
];
```

Place book cover images in `assets/images/` folder.

### 6. Add UPI QR Code

1. Replace `assets/images/qr-code.png` with your actual UPI QR code image
2. Update `js/config.js`:
   - `UPI_ID` with your actual UPI ID (e.g., `yourname@paytm`)
   - `UPI_NAME` with your business name

### 7. Deploy to Vercel (Free)

1. Push your code to a GitHub repository
2. Go to https://vercel.com and sign up with GitHub
3. Click **New Project** > Import your repository
4. Keep default settings, click **Deploy**
5. Your site will be live at `your-project.vercel.app`

### Add Custom Domain (Optional)

1. In Vercel dashboard, go to **Settings > Domains**
2. Add your custom domain
3. Follow DNS configuration instructions
4. For affordable domain: Buy a `.in` domain (~Rs. 49/year) from any registrar

---

## WhatsApp Notifications (Optional - Later)

### Setup Meta WhatsApp Cloud API

1. Go to https://developers.facebook.com
2. Create a **Meta Developer Account**
3. Create a new **App** > Select **Business** type
4. Add **WhatsApp** product to your app
5. You'll get a **Phone Number ID** and **Access Token**

### Create Message Templates

In WhatsApp Manager, create these templates:

**Template: payment_verified**
```
Your order #{{1}} payment has been verified. We'll ship soon!
```

**Template: order_shipped**
```
Your order #{{1}} has been shipped! Tracking: {{2}}
```

**Template: order_delivered**
```
Your order #{{1}} has been delivered. Enjoy reading!
```

### Create Supabase Edge Function

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link project: `supabase link --project-ref your-project-ref`
4. Create function: `supabase functions new notify-whatsapp`
5. Deploy: `supabase functions deploy notify-whatsapp`

---

## Testing

1. Open `index.html` in browser (or your Vercel URL)
2. Add books to cart
3. Go to checkout, fill form, upload any image as payment proof
4. Submit order
5. Go to `track.html`, enter phone number to see order
6. Go to `admin.html`, login with admin credentials
7. Update order status

---

## File Structure

```
Gurudev books/
├── index.html                   # Public storefront & book catalog
├── cart.html                    # Shopping cart
├── checkout.html                # Dynamic courier calculation & UPI checkout
├── track.html                   # Public order status tracking
├── admin.html                   # Protected administrative dashboard
├── test-runner.html             # Diagnostic runner & live database checks
├── robots.txt                   # Search crawler directives (protects admin & tests)
├── site.webmanifest             # PWA metadata & mobile homescreen configuration
├── favicon.ico                  # Root multi-resolution favicon
├── apple-touch-icon.png         # Root Apple touch icon (180x180)
├── favicon.png                  # Root standard favicon (64x64)
├── css/
│   └── style.css                # Centralized responsive design system & animations
├── js/
│   ├── config.js                # Supabase credentials & courier tariff tables
│   ├── books.js                 # Catalog database queries & stock management
│   ├── cart.js                  # Cart state, badge counter, and validation
│   ├── checkout.js              # India Post courier calculator & UPI intent
│   ├── track.js                 # Sanitized public order status lookup
│   ├── admin.js                 # Order dispatching, inventory editor & ledger
│   └── security.js              # XSS sanitization, privacy masking & input validators
├── assets/
│   └── images/                  # All store images, logos, QR codes & favicons
│       ├── logo.png             # Official transparent medallion logo
│       ├── qr-code.png          # UPI payment QR code (Surya Kanta Das)
│       ├── favicon.ico          # Multi-resolution icon asset
│       ├── favicon-32x32.png    # Standard 32px favicon
│       ├── favicon-16x16.png    # Standard 16px favicon
│       ├── apple-touch-icon.png # 180px Apple touch icon
│       ├── icon-192.png         # PWA Android 192px icon
│       ├── icon-512.png         # PWA Android 512px icon
│       ├── gopal_jiu_fade.png   # Gopal Jiu deity hero asset
│       ├── gurudev_with_prabhupada_2.png # Guru-parampara hero image
│       ├── pink_lotus.png       # Lotus ornament
│       └── signature.png        # Srila Gurudev divine signature
├── tests/
│   ├── run-tests.js             # Automated CLI test suite runner
│   ├── test-utils.js            # Mock databases, state reset & assertion framework
│   ├── shipping.test.js         # India Post slab calculation tests
│   ├── cart.test.js             # Cart state, stock capping, and persistence tests
│   ├── security.test.js         # XSS sanitization and privacy mask tests
│   └── isolation.test.js        # Test order segregation and ledger protection tests
├── MIGRATION_TESTING_FRAMEWORK.sql # SQL migration for sandbox testing schema
├── RESET_AND_SETUP_SUPABASE.sql    # Clean reset & comprehensive schema initialization
├── supabase-setup.sql           # Base database migration script
├── TESTING_AND_SECURITY.md      # Testing architecture and security documentation
└── SETUP.md                     # Deployment and configuration guide
```
