/**
 * Gurudev Books - Dynamic Checkout & India Post Courier Logic
 * 
 * Implements:
 * 1. Book Courier Charge Calculation based on order weight & destination pincode.
 * 2. Fixed 20g packaging weight added to total book weights.
 * 3. India Post Pune tariff slabs (Within Maharashtra vs Other States).
 * 4. Pincode lookup via api.postalpincode.in with localStorage caching.
 * 5. Robust offline fallback correctly handling Goa (403xxx) as Other States.
 * 6. Dynamic UPI QR code generation and mobile-friendly 1-tap checkout.
 */

// Local storage cache key for pincode-to-location lookups
const PINCODE_CACHE_KEY = 'gurudev_pincode_cache_v1';

// Offline 2-digit PIN prefix mapping for Indian States
const PINCODE_PREFIX_STATE_MAP = {
  '11': 'Delhi',
  '12': 'Haryana', '13': 'Haryana',
  '14': 'Punjab', '15': 'Punjab',
  '16': 'Chandigarh',
  '17': 'Himachal Pradesh',
  '18': 'Jammu & Kashmir', '19': 'Jammu & Kashmir',
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh', '23': 'Uttar Pradesh',
  '24': 'Uttarakhand', '25': 'Uttar Pradesh', '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan',
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  '50': 'Telangana',
  '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha',
  '78': 'Assam',
  '79': 'North Eastern States',
  '80': 'Bihar', '81': 'Bihar', '82': 'Bihar', '83': 'Jharkhand', '84': 'Bihar', '85': 'Bihar'
};

// Global state for current checkout calculations
let currentShippingCalculation = {
  bookWeightGrams: 0,
  packingWeightGrams: 20,
  chargeableWeightGrams: 20,
  isMaharashtra: true,
  shippingCharge: 70,
  slabLabel: 'Up to 500g',
  zoneName: 'Within Maharashtra',
  subtotal: 0,
  totalPayable: 70
};

// ============================================
// 1. Weight & Tariff Calculation Logic
// ============================================

/**
 * Calculates net book weight and total chargeable weight (book weight + 20g packaging)
 */
function calculateCartWeights() {
  const cart = getCart();
  let bookWeightGrams = 0;

  cart.forEach(item => {
    const book = BOOKS.find(b => b.id === item.bookId);
    // Use stored book weight, or fallback to default if missing
    let weight = (book && book.weight_grams != null && Number(book.weight_grams) > 0)
      ? Number(book.weight_grams)
      : (CONFIG.DEFAULT_BOOK_WEIGHT_GRAMS || 150);
    bookWeightGrams += (weight * item.quantity);
  });

  const packingWeightGrams = CONFIG.PACKING_WEIGHT_GRAMS != null ? CONFIG.PACKING_WEIGHT_GRAMS : 20;
  const chargeableWeightGrams = bookWeightGrams + packingWeightGrams;

  return {
    bookWeightGrams,
    packingWeightGrams,
    chargeableWeightGrams
  };
}

/**
 * Determines whether the destination is Within Maharashtra or Other States.
 * Crucially handles Goa (403xxx) as "Other States" even though it shares postal prefix range.
 */
function evaluateDestinationZone(destinationState, pincode) {
  const cleanState = (destinationState || '').trim();
  const cleanPin = (pincode || '').trim();

  // 1. Explicit Goa Check:
  // Goa PIN codes are 403xxx. Even though circle is Maharashtra, Goa is a different state.
  const isGoa = cleanPin.startsWith('403') || /goa/i.test(cleanState);
  if (isGoa) {
    return {
      isMaharashtra: false,
      zoneName: 'Other States (Goa)',
      stateName: cleanState || 'Goa'
    };
  }

  // 2. Maharashtra Check:
  const isMHStateText = /^mh$/i.test(cleanState) || /maharashtra/i.test(cleanState);

  // If state input is not yet explicitly written or matching, check 6-digit numeric PIN range
  let isMHPincode = false;
  if (cleanPin.length === 6 && /^\d{6}$/.test(cleanPin)) {
    const pinNum = parseInt(cleanPin, 10);
    if (pinNum >= 400001 && pinNum <= 445402 && !cleanPin.startsWith('403')) {
      isMHPincode = true;
    }
  }

  if (isMHStateText || (!cleanState && isMHPincode)) {
    return {
      isMaharashtra: true,
      zoneName: 'Within Maharashtra',
      stateName: cleanState || 'Maharashtra'
    };
  }

  return {
    isMaharashtra: false,
    zoneName: cleanState ? `Other States (${cleanState})` : 'Other States',
    stateName: cleanState || 'Other State'
  };
}

/**
 * Calculates India Post Pune courier charge based on authoritative rate card.
 * @param {number} bookWeightGrams - Total book weight before packaging
 * @param {string} destinationState - Name of destination state
 * @param {string} pincode - 6-digit destination postal code
 */
function getShippingCharge(bookWeightGrams, destinationState, pincode) {
  const packingWeight = CONFIG.PACKING_WEIGHT_GRAMS != null ? CONFIG.PACKING_WEIGHT_GRAMS : 20;
  const chargeableWeight = bookWeightGrams + packingWeight;
  const zone = evaluateDestinationZone(destinationState, pincode);
  const isMH = zone.isMaharashtra;

  const slabs = CONFIG.SHIPPING_SLABS || [
    { maxWeight: 500,  mhRate: 70,  otherRate: 72 },
    { maxWeight: 1000, mhRate: 106, otherRate: 114 },
    { maxWeight: 1500, mhRate: 142, otherRate: 171 },
    { maxWeight: 2000, mhRate: 198, otherRate: 239 },
    { maxWeight: 3000, mhRate: 277, otherRate: 337 },
    { maxWeight: 4000, mhRate: 344, otherRate: 420 },
    { maxWeight: 5000, mhRate: 420, otherRate: 515 },
  ];

  let prevMax = 0;
  for (const slab of slabs) {
    if (chargeableWeight <= slab.maxWeight) {
      const slabLabel = slab.maxWeight <= 500 ? 'Up to 500g' : `${prevMax + 1} - ${slab.maxWeight}g`;
      return {
        rate: isMH ? slab.mhRate : slab.otherRate,
        isMaharashtra: isMH,
        chargeableWeight,
        slabLabel,
        zoneName: zone.zoneName
      };
    }
    prevMax = slab.maxWeight;
  }

  // Weight above 5000 g:
  // extra_kg = CEILING((Chargeable Weight - 5000) / 1000)
  // Charge = Base (420 or 515) + extra_kg x Per-kg Rate (70 or 90)
  const extraKg = Math.ceil((chargeableWeight - 5000) / 1000);
  const configAbove = CONFIG.SHIPPING_ABOVE_5KG || {
    baseMh: 420,
    baseOther: 515,
    perKgMh: 70,
    perKgOther: 90
  };

  const base = isMH ? configAbove.baseMh : configAbove.baseOther;
  const perKg = isMH ? configAbove.perKgMh : configAbove.perKgOther;
  const rate = base + (extraKg * perKg);

  return {
    rate,
    isMaharashtra: isMH,
    chargeableWeight,
    slabLabel: `5001g+ (+${extraKg} kg extra)`,
    zoneName: zone.zoneName
  };
}

// ============================================
// 2. PIN Code Lookup & Caching System
// ============================================

function getPincodeCache() {
  try {
    return JSON.parse(localStorage.getItem(PINCODE_CACHE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function savePincodeCache(cache) {
  try {
    localStorage.setItem(PINCODE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Could not save pincode cache:', e);
  }
}

/**
 * Looks up location details for a given PIN code.
 * 1. Checks cache
 * 2. Queries api.postalpincode.in with timeout
 * 3. Falls back to offline prefix table if API is unreachable
 */
async function lookupPincode(pincode) {
  if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    return null;
  }

  // 1. Cache hit
  const cache = getPincodeCache();
  if (cache[pincode]) {
    return cache[pincode];
  }

  // 2. API query with 3.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data[0] && data[0].Status === 'Success' && Array.isArray(data[0].PostOffice) && data[0].PostOffice.length > 0) {
        const po = data[0].PostOffice[0];
        const state = po.State || '';
        const city = po.District || po.Division || po.Block || po.Name || '';
        const result = { state, city, source: 'api' };
        cache[pincode] = result;
        savePincodeCache(cache);
        return result;
      }
    }
  } catch (err) {
    console.log('Online pincode lookup unavailable, using offline fallback:', err.message);
  }

  // 3. Robust Offline Fallback
  let fallbackState = '';
  let fallbackCity = '';

  if (pincode.startsWith('403')) {
    fallbackState = 'Goa';
    fallbackCity = 'Goa';
  } else {
    const pinNum = parseInt(pincode, 10);
    if (pinNum >= 400001 && pinNum <= 445402) {
      fallbackState = 'Maharashtra';
      fallbackCity = (pinNum >= 411001 && pinNum <= 411062) ? 'Pune' : 'Maharashtra';
    } else {
      const prefix2 = pincode.slice(0, 2);
      fallbackState = PINCODE_PREFIX_STATE_MAP[prefix2] || 'Other State';
      fallbackCity = '';
    }
  }

  const fallbackResult = {
    state: fallbackState,
    city: fallbackCity,
    source: 'offline'
  };

  cache[pincode] = fallbackResult;
  savePincodeCache(cache);
  return fallbackResult;
}

// ============================================
// 3. UI Synchronization & Summary Rendering
// ============================================

/**
 * Renders the items list and weight pills in the checkout summary column
 */
function renderCheckoutItems() {
  const cart = getCart();
  const listContainer = document.getElementById('checkout-items-list');
  const countBadge = document.getElementById('summary-items-count');

  if (!listContainer) return;

  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (countBadge) {
    countBadge.textContent = `${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'}`;
  }

  listContainer.innerHTML = cart.map(item => {
    const book = BOOKS.find(b => b.id === item.bookId);
    if (!book) return '';
    const weight = (book.weight_grams != null && Number(book.weight_grams) > 0)
      ? Number(book.weight_grams)
      : (CONFIG.DEFAULT_BOOK_WEIGHT_GRAMS || 150);
    const lineTotal = book.price * item.quantity;
    const totalWeight = weight * item.quantity;

    return `
      <div class="checkout-item-row">
        <div class="checkout-item-thumb">
          <img src="${book.image}" alt="${book.title}" onerror="this.style.background='#f0e8d8';" />
        </div>
        <div class="checkout-item-info">
          <h4 class="checkout-item-title">${book.title}</h4>
          <div class="checkout-item-meta">
            <span class="qty-pill">Qty: ${item.quantity}</span>
          </div>
        </div>
        <div class="checkout-item-price">
          Rs. ${lineTotal}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Recalculates all order figures, updates summary text, delivery badges, and dynamic UPI QR code
 */
function updateCheckoutCalculations() {
  const pincode = document.getElementById('customer-pincode')?.value.trim() || '';
  const state = document.getElementById('customer-state')?.value.trim() || '';

  const { bookWeightGrams, packingWeightGrams, chargeableWeightGrams } = calculateCartWeights();
  const subtotal = getCartTotal();

  // Run authoritative tariff logic in background
  const shippingResult = getShippingCharge(bookWeightGrams, state, pincode);
  const shippingCharge = shippingResult.rate;
  const totalPayable = subtotal + shippingCharge;

  // Save current calculation for order submission & admin notification
  currentShippingCalculation = {
    bookWeightGrams,
    packingWeightGrams,
    chargeableWeightGrams,
    isMaharashtra: shippingResult.isMaharashtra,
    shippingCharge,
    slabLabel: shippingResult.slabLabel,
    zoneName: shippingResult.zoneName,
    subtotal,
    totalPayable
  };

  // Update Price Summary elements
  const subtotalEl = document.getElementById('summary-subtotal');
  const shippingEl = document.getElementById('summary-shipping');
  const slabBadgeEl = document.getElementById('shipping-rate-slab-badge');
  const grandTotalEl = document.getElementById('summary-total-amount');
  const payAmountEl = document.getElementById('pay-amount');

  if (subtotalEl) subtotalEl.textContent = `Rs. ${subtotal}`;
  if (shippingEl) shippingEl.textContent = `Rs. ${shippingCharge}`;
  if (slabBadgeEl) {
    slabBadgeEl.textContent = shippingResult.isMaharashtra ? 'Within Maharashtra' : (state || 'Other States');
  }
  if (grandTotalEl) grandTotalEl.textContent = `Rs. ${totalPayable}`;
  if (payAmountEl) payAmountEl.textContent = `Rs. ${totalPayable}`;

  // Update Zone Notification Banner
  updateZoneBanner(pincode, state, shippingResult);

  // Update Dynamic UPI QR Code and Mobile Payment Link
  updateDynamicPayment(totalPayable);
}

/**
 * Updates the visual zone notification banner above payment section
 */
function updateZoneBanner(pincode, state, shippingResult) {
  const banner = document.getElementById('delivery-zone-banner');
  const headline = document.getElementById('zone-headline');
  const subtitle = document.getElementById('zone-subtitle');
  if (!banner || !headline || !subtitle) return;

  if (pincode && pincode.length === 6) {
    const destinationLabel = state
      ? (state.toLowerCase().includes('maharashtra') ? 'Within Maharashtra' : state)
      : (shippingResult.isMaharashtra ? 'Within Maharashtra' : 'Other States');

    if (shippingResult.isMaharashtra) {
      banner.className = 'zone-banner zone-banner-mh';
      headline.textContent = `✓ Delivery to ${destinationLabel}: Rs. ${shippingResult.rate}`;
      subtitle.textContent = 'India Post Pune dispatch • Secure parcel packaging';
    } else {
      banner.className = 'zone-banner zone-banner-other';
      headline.textContent = `✓ Delivery to ${destinationLabel}: Rs. ${shippingResult.rate}`;
      subtitle.textContent = 'India Post Pune dispatch • Secure parcel packaging';
    }
  } else {
    banner.className = 'zone-banner zone-banner-neutral';
    headline.textContent = 'Enter PIN Code to Calculate Delivery';
    subtitle.textContent = 'Dispatched from Pune via India Post • Fast & secure parcel delivery';
  }
}

/**
 * Generates an exact UPI dynamic QR code and mobile intent URL with order amount pre-filled
 */
function updateDynamicPayment(totalAmount) {
  const upiIdDisplay = document.getElementById('upi-id-display');
  const upiNameDisplay = document.getElementById('upi-name-display');
  const qrImg = document.getElementById('upi-qr-img');
  const mobileBtn = document.getElementById('mobile-upi-btn');

  if (upiIdDisplay) upiIdDisplay.textContent = CONFIG.UPI_ID;
  if (upiNameDisplay) upiNameDisplay.textContent = CONFIG.UPI_NAME || 'SURYA KANTA DAS';

  // Standard UPI URI format for mobile 1-tap checkout
  // Crucial: Keep literal '@' in pa and clean spaces in pn so Google Pay and other UPI apps resolve the account successfully
  const cleanUpiId = (CONFIG.UPI_ID || '8007768327@barodampay').trim();
  const payeeName = (CONFIG.UPI_NAME || 'SURYA KANTA DAS').trim();
  const upiUrl = `upi://pay?pa=${cleanUpiId}&pn=${payeeName}&am=${totalAmount}&cu=INR&mode=01&purpose=00&tn=Gurudev Books`;

  if (qrImg) {
    // Official Bank of Baroda UPI QR code image
    qrImg.src = 'assets/qr-code.png';
  }

  if (mobileBtn) {
    mobileBtn.href = upiUrl;
  }
}

/**
 * Interactive 1-click copy for UPI ID
 */
function copyUpiId() {
  const upiId = CONFIG.UPI_ID;
  navigator.clipboard.writeText(upiId).then(() => {
    const label = document.getElementById('copy-text-label');
    const btn = document.getElementById('copy-upi-btn');
    if (label) label.textContent = 'Copied!';
    if (btn) btn.classList.add('copied');
    showToast('UPI ID copied to clipboard!', 'success');

    setTimeout(() => {
      if (label) label.textContent = 'Copy UPI ID';
      if (btn) btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    showToast(`UPI ID: ${upiId}`, 'info');
  });
}

// ============================================
// 4. File Upload Preview & Reset
// ============================================

function handleProofFileChange(event) {
  const file = event.target.files[0];
  const idle = document.getElementById('dropzone-idle');
  const preview = document.getElementById('dropzone-preview');
  const previewImg = document.getElementById('preview-image');
  const previewName = document.getElementById('preview-filename');

  if (!file) {
    if (idle) idle.style.display = 'flex';
    if (preview) preview.style.display = 'none';
    return;
  }

  if (previewName) previewName.textContent = file.name;

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      if (idle) idle.style.display = 'none';
      if (preview) preview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  } else {
    if (idle) idle.style.display = 'none';
    if (preview) preview.style.display = 'flex';
  }
}

function clearProofUpload(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const fileInput = document.getElementById('payment-proof');
  const idle = document.getElementById('dropzone-idle');
  const preview = document.getElementById('dropzone-preview');
  const previewImg = document.getElementById('preview-image');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (preview) preview.style.display = 'none';
  if (idle) idle.style.display = 'flex';
}

// ============================================
// 5. Order Submission Flow
// ============================================

async function submitOrder(event) {
  event.preventDefault();

  const cart = getCart();
  if (cart.length === 0) {
    showAlert('Cart Empty', 'Your cart is empty! Please add books first.', 'warning');
    return;
  }

  const name = document.getElementById('customer-name')?.value.trim();
  const phone = document.getElementById('customer-phone')?.value.trim();
  const street = document.getElementById('customer-street')?.value.trim();
  const city = document.getElementById('customer-city')?.value.trim();
  const state = document.getElementById('customer-state')?.value.trim();
  const pincode = document.getElementById('customer-pincode')?.value.trim();
  const paymentProof = document.getElementById('payment-proof')?.files[0];

  if (!name || !phone || !street || !city || !state || !pincode) {
    showAlert('Missing Details', 'Please fill in all delivery address details.', 'warning');
    return;
  }

  if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    showAlert('Invalid PIN Code', 'Please enter a valid 6-digit postal PIN code.', 'warning');
    return;
  }

  if (!paymentProof) {
    showAlert('Payment Proof Required', 'Please upload your UPI payment transfer screenshot.', 'warning');
    return;
  }

  // Standard address serialization format preserved for admin shipping labels:
  // "street | city, state | pincode"
  const address = `${street} | ${city}, ${state} | ${pincode}`;

  // Recalculate latest totals to guarantee precision
  updateCheckoutCalculations();
  const total = currentShippingCalculation.totalPayable;
  const shippingCharge = currentShippingCalculation.shippingCharge;
  const totalWeight = currentShippingCalculation.chargeableWeightGrams;

  const submitBtn = document.getElementById('submit-order-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <span class="spinner-small" style="display:inline-block;margin-right:8px;vertical-align:middle;"></span>
    <span>Processing Order...</span>
  `;

  try {
    // 1. Upload payment screenshot to Supabase Storage
    const fileExt = paymentProof.name.split('.').pop();
    const fileName = `proof-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('payment-proofs')
      .upload(fileName, paymentProof);

    if (uploadError) throw uploadError;

    // 2. Prepare order items
    const items = cart.map(item => {
      const book = BOOKS.find(b => b.id === item.bookId);
      return {
        book_id: item.bookId,
        quantity: item.quantity,
        price: book ? book.price : 0
      };
    });

    // 3. Call database atomic transaction RPC
    const { data: orderId, error: orderError } = await supabaseClient
      .rpc('create_order_with_items', {
        cust_name: name,
        cust_phone: phone,
        cust_address: address,
        total_amt: total,
        proof_url: fileName,
        items: items
      });

    if (orderError) {
      if (orderError.message && orderError.message.includes('Insufficient stock')) {
        showAlert(
          'Out of Stock',
          'One or more books in your cart became out of stock during checkout. Please return to your cart and update quantities.',
          'danger'
        );
        // Clean up uploaded proof file
        await supabaseClient.storage.from('payment-proofs').remove([fileName]);
      } else {
        showAlert('Order Failed', 'Error placing order: ' + orderError.message, 'danger');
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Place Order</span>`;
      return;
    }

    // 4. Send Email Notification to Admin (async, non-blocking)
    sendOrderEmailNotification({
      orderId,
      name,
      phone,
      address,
      total,
      shippingCharge,
      totalWeight,
      zoneName: currentShippingCalculation.zoneName,
      items
    });

    // 5. Store phone for auto-tracking
    localStorage.setItem('customer_phone', phone);

    // 6. Complete order
    clearCart();
    showToast('Order placed successfully! Hare Krishna 🙏', 'success');

    setTimeout(() => {
      window.location.href = 'track.html';
    }, 1500);

  } catch (error) {
    console.error('Checkout error:', error);
    showAlert('Order Failed', 'An error occurred while placing your order. Please try again or reach out on WhatsApp.', 'danger');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Place Order</span>`;
  }
}

async function sendOrderEmailNotification({ orderId, name, phone, address, total, shippingCharge, totalWeight, zoneName, items }) {
  if (!CONFIG.WEB3FORMS_ACCESS_KEY) {
    console.log("Email notification skipped: WEB3FORMS_ACCESS_KEY not configured");
    return;
  }

  const itemsListFormatted = items.map(item => {
    const book = BOOKS.find(b => b.id === item.book_id);
    return `${book ? book.title : 'Book'} x ${item.quantity} (Rs. ${item.price * item.quantity})`;
  }).join(', ');

  const payload = {
    access_key: CONFIG.WEB3FORMS_ACCESS_KEY,
    subject: `📚 New Order Placed: #${orderId}`,
    from_name: "Gurudev Books Store",
    order_id: orderId,
    customer_name: name,
    customer_phone: phone,
    delivery_address: address,
    delivery_zone: zoneName,
    chargeable_weight: `${totalWeight} g (India Post Pune)`,
    shipping_charge: `Rs. ${shippingCharge}`,
    total_amount: `Rs. ${total}`,
    order_items: itemsListFormatted
  };

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (response.ok && result.success) {
      console.log("Admin email notification delivered successfully.");
    }
  } catch (error) {
    console.error("Email notification failed:", error);
  }
}

// ============================================
// 6. Page Initialization & Event Listeners
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const cart = getCart();
  if (cart.length === 0) {
    window.location.href = 'cart.html';
    return;
  }

  // Load catalog books if not loaded
  if (!BOOKS || BOOKS.length === 0) {
    await fetchBooks();
  }

  // Render initial items and calculations
  renderCheckoutItems();
  updateCheckoutCalculations();

  // Elements
  const pincodeInput = document.getElementById('customer-pincode');
  const cityInput = document.getElementById('customer-city');
  const stateInput = document.getElementById('customer-state');
  const pincodeBadge = document.getElementById('pincode-badge');
  const pincodeSpinner = document.getElementById('pincode-spinner');
  const proofInput = document.getElementById('payment-proof');

  // Pre-fill phone if available from tracking
  const savedPhone = localStorage.getItem('customer_phone') || localStorage.getItem('last_tracked_phone');
  const phoneInput = document.getElementById('customer-phone');
  if (savedPhone && phoneInput && !phoneInput.value) {
    phoneInput.value = savedPhone;
  }

  // Pincode Input Event Handler with Debounce
  let pincodeDebounce = null;
  if (pincodeInput) {
    pincodeInput.addEventListener('input', () => {
      const pin = pincodeInput.value.replace(/\D/g, '').slice(0, 6);
      pincodeInput.value = pin;

      clearTimeout(pincodeDebounce);

      if (pin.length < 6) {
        if (pincodeBadge) {
          pincodeBadge.textContent = `${pin.length}/6 digits`;
          pincodeBadge.className = 'pincode-status-pill';
        }
        updateCheckoutCalculations();
        return;
      }

      if (pincodeSpinner) pincodeSpinner.style.display = 'inline-block';
      if (pincodeBadge) {
        pincodeBadge.textContent = 'Looking up...';
        pincodeBadge.className = 'pincode-status-pill loading';
      }

      pincodeDebounce = setTimeout(async () => {
        const info = await lookupPincode(pin);
        if (pincodeSpinner) pincodeSpinner.style.display = 'none';

        if (info && info.state) {
          if (stateInput && (!stateInput.value || stateInput.dataset.autofilled === 'true')) {
            stateInput.value = info.state;
            stateInput.dataset.autofilled = 'true';
          }
          if (cityInput && info.city && (!cityInput.value || cityInput.dataset.autofilled === 'true')) {
            cityInput.value = info.city;
            cityInput.dataset.autofilled = 'true';
          }

          if (pincodeBadge) {
            const isMH = info.state.toLowerCase().includes('maharashtra') && !pin.startsWith('403');
            pincodeBadge.textContent = isMH ? '✓ Maharashtra' : `✓ ${info.state}`;
            pincodeBadge.className = `pincode-status-pill ${isMH ? 'mh' : 'other'}`;
          }
        } else {
          if (pincodeBadge) {
            pincodeBadge.textContent = 'PIN verified';
            pincodeBadge.className = 'pincode-status-pill';
          }
        }

        updateCheckoutCalculations();
      }, 250);
    });
  }

  // State / City manual changes trigger rate recalculation
  if (stateInput) {
    stateInput.addEventListener('input', () => {
      stateInput.dataset.autofilled = 'false';
      updateCheckoutCalculations();
    });
  }

  if (cityInput) {
    cityInput.addEventListener('input', () => {
      cityInput.dataset.autofilled = 'false';
    });
  }

  // Payment proof file change listener
  if (proofInput) {
    proofInput.addEventListener('change', handleProofFileChange);
  }
});


