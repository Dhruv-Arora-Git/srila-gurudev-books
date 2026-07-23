async function trackOrders(event) {
  if (event) event.preventDefault();

  const phone = document.getElementById('track-phone').value.trim();
  if (!phone) {
    showAlert('Phone Number Required', 'Please enter your 10-digit phone number to track orders.', 'warning');
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
    const { data: orders, error } = await supabaseClient
      .rpc('get_customer_orders_by_phone', { customer_phone: phone });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      resultsDiv.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:3rem 0;">No orders found for this phone number.</p>';
      return;
    }

    resultsDiv.innerHTML = orders.map(order => `
      <div class="order-card">
        <div class="order-header">
          <span class="order-id">Order #${order.id.slice(0, 8).toUpperCase()}</span>
          <span class="order-date">${new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span class="status-badge status-${order.status.toLowerCase().replace(/\s+/g, '-')}">${order.status}</span>
        </div>
        <div class="order-items-list">
          ${(order.order_items || []).map(item => {
            const book = BOOKS.find(b => b.id === item.book_id);
            return `
              <div class="order-item-row">
                <span>${book ? book.title : 'Book'} &times; ${item.quantity}</span>
                <span>Rs. ${item.price * item.quantity}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="summary-row">
          <span>Subtotal</span>
          <span>Rs. ${order.total_amount - CONFIG.DELIVERY_CHARGE}</span>
        </div>
        <div class="summary-row">
          <span>Delivery</span>
          <span>Rs. ${CONFIG.DELIVERY_CHARGE}</span>
        </div>
        <div class="summary-row total-row">
          <span>Total</span>
          <span>Rs. ${order.total_amount}</span>
        </div>
        ${(order.tracking_number || order.tracking_link) ? `
          <div style="margin-top:1.25rem;padding:1rem 1.25rem;background:var(--purple-light);border-radius:var(--radius);line-height:1.6;border:1px solid rgba(139, 92, 246, 0.1);display:flex;flex-direction:column;gap:0.5rem;">
            ${order.tracking_number ? `
              <p style="margin:0;font-size:0.95rem;display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <strong>Tracking Number:</strong> 
                <code style="font-size:1.05rem;color:var(--purple);font-weight:600;">${order.tracking_number}</code>
                <button class="copy-track-btn" onclick="copyToClipboard('${order.tracking_number}', this)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  Copy
                </button>
              </p>
            ` : ''}
            ${order.tracking_link ? `<p style="margin:0;font-size:0.95rem;"><strong>Tracking Link:</strong> <a href="${order.tracking_link.trim()}" target="_blank" style="color:var(--purple);font-weight:600;text-decoration:underline;word-break:break-all;margin-left:0.25rem;">${order.tracking_link.trim()}</a></p>` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Track error:', error);
    resultsDiv.innerHTML = '<p style="text-align:center;color:var(--danger);padding:3rem 0;">Error fetching orders. Please try again.</p>';
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
    console.error('Copy failed:', err);
  });
}
