async function trackOrders(event) {
  if (event) event.preventDefault();

  const phone = document.getElementById('track-phone').value.trim();
  if (!phone) {
    showAlert('Phone Number Required', 'Please enter your 10-digit phone number to track orders.', 'warning');
    return;
  }

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
        <div class="summary-row">
          <span>Total</span>
          <span>Rs. ${order.total_amount}</span>
        </div>
        ${order.tracking_number ? `<p style="margin-top:1.25rem;padding:0.75rem 1rem;background:var(--purple-light);border-radius:var(--radius-sm);line-height:1.5;"><strong>Tracking Number:</strong> <code style="font-size:1.05rem;color:var(--purple);font-weight:600;">${order.tracking_number}</code></p>` : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Track error:', error);
    resultsDiv.innerHTML = '<p style="text-align:center;color:var(--danger);padding:3rem 0;">Error fetching orders. Please try again.</p>';
  }
}
