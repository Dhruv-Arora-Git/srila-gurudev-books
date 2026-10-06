async function trackOrders(event) {
  if (event) event.preventDefault();

  const phone = document.getElementById('track-phone').value.trim();
  if (!phone) {
    showAlert('Phone Number Required', 'Please enter your 10-digit mobile number to track orders.', 'warning');
    return;
  }

  // Security check: validate phone number format
  if (typeof validatePhone === 'function' && !validatePhone(phone)) {
    showAlert('Invalid Phone Number', 'Please enter a valid 10-digit mobile number.', 'warning');
    return;
  }

  // Persist the phone number searched in the tracking bar
  localStorage.setItem('last_tracked_phone', phone);

  const resultsDiv = document.getElementById('track-results');
  resultsDiv.innerHTML = '<div class="spinner"></div>';

  try {
    // Ensure catalog books list is loaded to display titles correctly
    if (BOOKS.length === 0) {
      await fetchBooks();
    }

    // Call secure database procedure to fetch orders for the phone number
    const { data: rawOrders, error } = await supabaseClient
      .rpc('get_customer_orders_by_phone', { customer_phone: phone });

    if (error) throw error;

    // Enforce Data Isolation: Real customers only see Real Production orders.
    // Test orders are hidden unless explicit Test Mode is active in the current session.
    const isTestSession = typeof CONFIG !== 'undefined' && CONFIG.isTestMode && CONFIG.isTestMode();
    const orders = (rawOrders || []).filter(order => isTestSession ? true : order.is_test !== true);

    if (!orders || orders.length === 0) {
      resultsDiv.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:3rem 0;">No active orders found for this mobile number.</p>';
      return;
    }

    resultsDiv.innerHTML = orders.map(order => {
      const safeOrderId = escapeHtml(order.id);
      const safeStatus = escapeHtml(order.status);
      const safeStatusClass = (order.status || '').toLowerCase().replace(/\s+/g, '-');
      const safeDate = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const safeTrackingNumber = escapeHtml(order.tracking_number || '');
      const safeTrackingLink = escapeHtml(order.tracking_link || '');
      const maskedDest = typeof maskAddress === 'function' ? maskAddress(order.address) : order.address;
      const isTestOrder = Boolean(order.is_test);

      const itemsHtml = (order.order_items || []).map(item => {
        const book = BOOKS.find(b => b.id === item.book_id);
        const title = book ? escapeHtml(book.title) : 'Book';
        return `
          <div class="order-item-row">
            <span>${title} &times; ${item.quantity}</span>
            <span>Rs. ${item.price * item.quantity}</span>
          </div>
        `;
      }).join('');

      const itemsSubtotal = (order.order_items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const deliveryFee = Math.max(0, order.total_amount - itemsSubtotal);

      return `
        <div class="order-card" style="${isTestOrder ? 'border: 1.5px dashed #F59E0B; background:#FFFDF7;' : ''}">
          <div class="order-header" style="flex-wrap:wrap;gap:0.5rem;align-items:center;">
            <span class="order-id">Order #${safeOrderId.slice(0, 8).toUpperCase()}</span>
            <span class="order-date">${safeDate}</span>
            <span class="status-badge status-${safeStatusClass}">${safeStatus}</span>
            ${isTestOrder ? '<span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;padding:0.15rem 0.5rem;border-radius:4px;font-weight:700;font-size:0.75rem;">🧪 TEST ORDER</span>' : ''}
          </div>
          <div class="order-items-list">
            ${itemsHtml}
          </div>
          <div class="summary-row">
            <span>Books Subtotal</span>
            <span>Rs. ${itemsSubtotal}</span>
          </div>
          <div class="summary-row">
            <span>Postage / Courier</span>
            <span>Rs. ${deliveryFee}</span>
          </div>
          <div class="summary-row total-row">
            <span>Total Amount</span>
            <span>Rs. ${order.total_amount}</span>
          </div>
          ${maskedDest ? `
            <div class="summary-row" style="font-size:0.88rem;color:var(--text-secondary);border-top:1px dashed #E7E5E4;padding-top:0.5rem;margin-top:0.5rem;">
              <span>Destination:</span>
              <span style="font-family:monospace;font-size:0.85rem;color:var(--text);">${escapeHtml(maskedDest)}</span>
            </div>
          ` : ''}
          ${(order.tracking_number || order.tracking_link) ? `
            <div style="margin-top:1.25rem;padding:1rem 1.25rem;background:var(--purple-light);border-radius:var(--radius);line-height:1.6;border:1px solid rgba(139, 92, 246, 0.1);display:flex;flex-direction:column;gap:0.5rem;">
              ${safeTrackingNumber ? `
                <p style="margin:0;font-size:0.95rem;display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                  <strong>Tracking Number:</strong> 
                  <code style="font-size:1.05rem;color:var(--purple);font-weight:600;">${safeTrackingNumber}</code>
                  <button class="copy-track-btn" onclick="copyToClipboard('${safeTrackingNumber}', this)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy
                  </button>
                </p>
              ` : ''}
              ${safeTrackingLink ? `<p style="margin:0;font-size:0.95rem;"><strong>Tracking Link:</strong> <a href="${safeTrackingLink}" target="_blank" rel="noopener noreferrer" style="color:var(--purple);font-weight:600;text-decoration:underline;word-break:break-all;margin-left:0.25rem;">${safeTrackingLink}</a></p>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Track error:', error);
    resultsDiv.innerHTML = '<p style="text-align:center;color:var(--danger);padding:3rem 0;">Error fetching orders. Please check your network and try again.</p>';
  }
}

function copyToClipboard(text, btnElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btnElement.innerHTML;
    btnElement.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Copied!
    `;
    btnElement.classList.add('copied');
    setTimeout(() => {
      btnElement.innerHTML = originalHTML;
      btnElement.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
  });
}
