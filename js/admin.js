let currentFilter = 'all';
let currentScope = 'production'; // 'production' (default) | 'test' | 'all'
let allOrders = [];
let currentSession = null;
let currentTab = 'orders';

function setScope(scope) {
  currentScope = scope;
  ['prod', 'test', 'all'].forEach(s => {
    const btn = document.getElementById(`scope-btn-${s}`);
    if (btn) {
      const isActive = (s === 'prod' && scope === 'production') || (s === 'test' && scope === 'test') || (s === 'all' && scope === 'all');
      btn.style.background = isActive ? 'var(--maroon)' : 'white';
      btn.style.color = isActive ? 'white' : 'var(--text)';
      btn.style.borderColor = isActive ? 'var(--maroon)' : '#E7E5E4';
    }
  });
  renderDashboard();
}


async function checkAuth() {
  const savedSession = localStorage.getItem('admin_session');
  if (!savedSession) {
    showLogin();
    return;
  }

  try {
    const supabaseClient = createSupabaseClient();
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error || !session) {
      localStorage.removeItem('admin_session');
      showLogin();
      return;
    }

    // Verify admin email authorization list (case-insensitive check)
    const emailList = CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase());
    const userEmail = (session.user.email || '').toLowerCase();
    if (!emailList.includes(userEmail)) {
      await showAlert('Access Denied', 'Your email is not authorized as an admin.', 'danger');
      await supabaseClient.auth.signOut();
      localStorage.removeItem('admin_session');
      showLogin();
      return;
    }

    currentSession = session;
    showDashboard();
  } catch (e) {
    localStorage.removeItem('admin_session');
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-section').style.display = 'flex';
  document.getElementById('dashboard-section').style.display = 'none';
}

async function showDashboard() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = 'block';

  const email = currentSession?.user?.email || 'Admin';
  document.getElementById('admin-email-display').textContent = `Logged in as ${email}`;

  // Make sure catalogs are loaded globally
  if (BOOKS.length === 0) {
    await fetchBooks();
  }

  if (currentTab === 'orders') {
    await loadOrders();
  } else {
    await loadInventory();
  }
}

async function adminLogin(event) {
  event.preventDefault();

  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';

  try {
    const supabaseClient = createSupabaseClient();
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) throw error;

    // Verify admin email authorization list (case-insensitive check)
    const emailList = CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase());
    const userEmail = (data.session.user.email || '').toLowerCase();
    if (!emailList.includes(userEmail)) {
      await showAlert('Access Denied', 'Your email is not authorized as an admin.', 'danger');
      await supabaseClient.auth.signOut();
      return;
    }

    currentSession = data.session;
    localStorage.setItem('admin_session', JSON.stringify(data.session));
    showDashboard();

  } catch (error) {
    console.error('Login error details:', error);
    showAlert('Login Failed', error.message || 'Invalid email or password', 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
}

function adminLogout() {
  localStorage.removeItem('admin_session');
  currentSession = null;
  showLogin();
}

// ============================================
// Orders Dashboard Section
// ============================================

async function loadOrders() {
  const container = document.getElementById('orders-container');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const supabaseClient = createSupabaseClient();

    let query = supabaseClient
      .from('orders')
      .select('*, order_items(book_id, quantity, price)')
      .order('created_at', { ascending: false });

    if (currentFilter !== 'all') {
      query = query.eq('status', currentFilter);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    allOrders = orders || [];
    renderDashboard();

  } catch (error) {
    console.error('Load orders error:', error);
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9888;</div><p>Error loading orders. Please refresh.</p></div>';
  }
}

function renderDashboard() {
  renderStats();
  renderOrders();
}

function renderStats() {
  const orders = getFilteredOrders();
  const total = orders.length;
  const pending = orders.filter(o => o.status === 'Payment Verification is Pending').length;
  const verified = orders.filter(o => o.status === 'Payment Verified').length;
  const shipped = orders.filter(o => o.status === 'Shipped').length;
  const delivered = orders.filter(o => o.status === 'Delivered').length;
  const lakshmi = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const scopeLabel = currentScope === 'test' ? ' (Sandbox Test)' : currentScope === 'all' ? ' (Combined)' : '';

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${total}</div>
      <div class="stat-label">Total Orders${scopeLabel}</div>
    </div>
    <div class="stat-card pending">
      <div class="stat-number">${pending}</div>
      <div class="stat-label">Payment Verification Pending</div>
    </div>
    <div class="stat-card verified">
      <div class="stat-number">${verified}</div>
      <div class="stat-label">Payment Verified</div>
    </div>
    <div class="stat-card shipped">
      <div class="stat-number">${shipped}</div>
      <div class="stat-label">Shipped</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${delivered}</div>
      <div class="stat-label">Delivered</div>
    </div>
    <div class="stat-card lakshmi">
      <div class="stat-number">Rs. ${lakshmi.toLocaleString('en-IN')}</div>
      <div class="stat-label">Total Lakshmi${scopeLabel}</div>
    </div>
  `;
}

function getFilteredOrders() {
  const searchTerm = document.getElementById('search-input')?.value?.toLowerCase().trim() || '';

  let filtered = allOrders;

  // Enforce Data Isolation: separate Real Production Orders from Sandbox Test Orders
  if (currentScope === 'production') {
    filtered = filtered.filter(order => order.is_test !== true);
  } else if (currentScope === 'test') {
    filtered = filtered.filter(order => order.is_test === true);
  }

  if (searchTerm) {
    filtered = filtered.filter(order => {
      const name = (order.customer_name || '').toLowerCase();
      const phone = (order.phone || '').toLowerCase();
      const address = (order.address || '').toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm) || address.includes(searchTerm);
    });
  }

  return filtered;
}

function renderOrders() {
  const container = document.getElementById('orders-container');
  const orders = getFilteredOrders();

  if (orders.length === 0) {
    const searchTerm = document.getElementById('search-input')?.value?.trim();
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon><polygon points="12 22.08 12 12 21 6.92 21 17.08 12 22.08"></polygon><polygon points="12 12 3 6.92 12 1.84 21 6.92 12 12"></polygon><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div>
        <p>${searchTerm ? 'No orders match your search.' : 'No orders found.'}</p>
      </div>
    `;
    return;
  }

  const userGroups = {};
  orders.forEach(order => {
    const key = order.phone;
    if (!userGroups[key]) {
      userGroups[key] = {
        phone: order.phone,
        name: order.customer_name,
        orders: []
      };
    }
    userGroups[key].orders.push(order);
  });

  let html = '';
  Object.values(userGroups).forEach(user => {
    const safeUserPhone = escapeHtml(user.phone);
    const safeUserName = escapeHtml(user.name);
    html += `
      <div class="user-group">
        <div class="user-group-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
          <span class="user-phone" style="display: inline-flex; align-items: center; gap: 0.35rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>${safeUserPhone}</span>
          <span class="user-name">${safeUserName}</span>
          <span class="user-order-count">${user.orders.length} order${user.orders.length > 1 ? 's' : ''}</span>
        </div>
        <div class="user-orders">
          ${user.orders.map(order => renderOrderCard(order)).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderOrderCard(order) {
  let shippingLabelText = '';
  const rawAddress = order.address || '';
  const safeName = escapeHtml(order.customer_name);
  const safePhone = escapeHtml(order.phone);
  const safeStatus = escapeHtml(order.status);
  const safeOrderId = escapeHtml(order.id);
  const isTestOrder = Boolean(order.is_test);

  if (rawAddress.includes(' | ')) {
    const parts = rawAddress.split(' | ');
    const street = parts[0] || '';
    const cityState = parts[1] || '';
    const pincode = parts[2] || '';
    shippingLabelText = `Name: ${order.customer_name}\nAddress: ${street}\n${cityState} - ${pincode}\nPhone: ${order.phone}`;
  } else {
    shippingLabelText = `Name: ${order.customer_name}\nAddress: ${rawAddress}\nPhone: ${order.phone}`;
  }

  const date = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const statusClass = (order.status || '').toLowerCase().replace(/\s+/g, '-');

  const itemsHtml = (order.order_items || []).map(item => {
    const book = BOOKS.find(b => b.id === item.book_id);
    const title = book ? escapeHtml(book.title) : `Book #${escapeHtml(item.book_id)}`;
    return `
      <div class="order-item-mini">
        <span>${title} &times; ${item.quantity}</span>
        <span>Rs. ${item.price * item.quantity}</span>
      </div>
    `;
  }).join('');

  const proofBtn = order.payment_proof_url
    ? `<button class="proof-btn" onclick="openProofModal('${escapeHtml(order.payment_proof_url)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align: middle; margin-right:4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> View Payment Proof</button>`
    : '';

  let trackingHtml = '';
  if (order.tracking_number || order.tracking_link) {
    const safeTrackNum = escapeHtml(order.tracking_number || '');
    const safeTrackLink = escapeHtml(order.tracking_link || '');
    trackingHtml = `
      <div style="margin-top:0.65rem;font-size:0.83rem;background:var(--purple-light);padding:0.5rem 0.75rem;border-radius:var(--radius-sm);line-height:1.4;display:inline-block;max-width:100%;">
        ${safeTrackNum ? `<p style="color:var(--purple);margin:0;"><strong>Tracking #:</strong> ${safeTrackNum}</p>` : ''}
        ${safeTrackLink ? `<p style="color:var(--purple);margin:2px 0 0 0;word-break:break-all;"><strong>Link:</strong> <a href="${safeTrackLink}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;color:var(--purple);font-weight:600;">${safeTrackLink}</a></p>` : ''}
      </div>
    `;
  }

  const testBadge = isTestOrder
    ? `<span style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;padding:0.2rem 0.55rem;border-radius:4px;font-weight:700;font-size:0.75rem;letter-spacing:0.5px;display:inline-flex;align-items:center;gap:0.3rem;">🧪 TEST ORDER</span>`
    : '';

  return `
    <div class="order-card-admin" style="${isTestOrder ? 'border:1.5px dashed #F59E0B;background:#FFFDF7;' : ''}">
      <div class="order-top-row" style="flex-wrap:wrap;gap:0.5rem;align-items:center;">
        <span class="order-id-badge">Order #${order.id.slice(0, 8).toUpperCase()}</span>
        <span class="order-date-small">${date}</span>
        <span class="status-badge status-${statusClass}">${safeStatus}</span>
        ${testBadge}
        <button class="proof-btn" onclick="deleteOrder('${safeOrderId}')" style="margin:0 0 0 auto;padding:0.35rem 0.65rem;font-size:0.75rem;background:var(--danger-light);color:var(--danger);">Delete Order</button>
      </div>

      <div class="order-address" style="line-height:1.5; margin-bottom:1.25rem;">
        <div style="background:#F5F5F4; border:1px solid #E7E5E4; padding:0.85rem 1.15rem; border-radius:var(--radius-sm); font-family:monospace; white-space:pre-wrap; font-size:0.88rem; color:var(--text); box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);" id="shipping-label-${safeOrderId}">${escapeHtml(shippingLabelText)}</div>
        <button class="copy-address-btn" onclick="copyShippingLabel('${safeOrderId}', this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"></path></svg>
          Copy Shipping Address
        </button>
      </div>

      <div class="order-items-mini">
        ${itemsHtml}
      </div>

      <div class="order-total-row">
        <span>Total</span>
        <span>Rs. ${order.total_amount}</span>
      </div>

      ${proofBtn}
      ${trackingHtml}

      <div class="order-actions">
        <select class="status-select-admin" id="status-${safeOrderId}">
          <option value="Order Placed" ${order.status === 'Order Placed' ? 'selected' : ''}>Order Placed</option>
          <option value="Payment Verification is Pending" ${order.status === 'Payment Verification is Pending' ? 'selected' : ''}>Payment Verification is Pending</option>
          <option value="Payment Verified" ${order.status === 'Payment Verified' ? 'selected' : ''}>Payment Verified</option>
          <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
          <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        </select>
        <input type="text" class="tracking-input-admin" id="tracking-num-${safeOrderId}" placeholder="Tracking #" value="${escapeHtml(order.tracking_number || '')}" style="width:130px;" />
        <input type="text" class="tracking-input-admin" id="tracking-link-${safeOrderId}" placeholder="Tracking Link" value="${escapeHtml(order.tracking_link || '')}" style="flex:1;min-width:140px;" />
        <button class="update-btn-admin" onclick="updateOrder('${safeOrderId}')">Update</button>
      </div>
    </div>
  `;
}

async function openProofModal(proofRef) {
  const modal = document.getElementById('proof-modal');
  const img = document.getElementById('proof-image');

  try {
    const supabaseClient = createSupabaseClient();

    let fileName = proofRef;
    if (proofRef.startsWith('http')) {
      const parts = proofRef.split('/');
      fileName = parts[parts.length - 1];
    }

    const { data, error } = await supabaseClient.storage
      .from('payment-proofs')
      .createSignedUrl(fileName, 3600);

    if (error) throw error;

    img.src = data.signedUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('Error loading proof:', error);
    showAlert('Proof Error', 'Could not load payment proof. Please try again.', 'danger');
  }
}

function closeProofModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('proof-modal-close')) return;
  const modal = document.getElementById('proof-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('proof-image').src = '';
}

async function updateOrder(orderId) {
  const newStatus = document.getElementById(`status-${orderId}`).value;
  const trackingNumber = document.getElementById(`tracking-num-${orderId}`).value.trim();
  const trackingLink = document.getElementById(`tracking-link-${orderId}`).value.trim();

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const supabaseClient = createSupabaseClient();

    const { error } = await supabaseClient
      .from('orders')
      .update({ 
        status: newStatus, 
        tracking_number: trackingNumber || null,
        tracking_link: trackingLink || null
      })
      .eq('id', orderId);

    if (error) throw error;

    showToast('Order updated!', 'success');
    await loadOrders();

  } catch (error) {
    console.error('Update error:', error);
    showAlert('Update Failed', 'Error updating order', 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update';
  }
}

async function deleteOrder(orderId) {
  const isConfirmed = await showConfirm(
    'Confirm Deletion',
    'Are you sure you want to delete this order? Deleting this order will automatically restore the stock quantities of its items back to the inventory.'
  );

  if (!isConfirmed) {
    return;
  }

  try {
    const supabaseClient = createSupabaseClient();
    const { error } = await supabaseClient
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;

    showToast('Order deleted & stock restored!', 'success');
    await loadOrders();
  } catch (error) {
    console.error('Delete order error:', error);
    showAlert('Delete Failed', 'Error deleting order: ' + error.message, 'danger');
  }
}

async function purgeAllTestOrders() {
  const testOrders = allOrders.filter(o => o.is_test === true);
  if (testOrders.length === 0) {
    showToast('No test orders found to clean up.', 'info');
    return;
  }

  const isConfirmed = await showConfirm(
    'Purge All Test Orders',
    `Are you sure you want to permanently delete all ${testOrders.length} test order(s)? Real customer orders will NOT be affected.`
  );

  if (!isConfirmed) return;

  const purgeBtn = document.getElementById('purge-test-btn');
  if (purgeBtn) {
    purgeBtn.disabled = true;
    purgeBtn.textContent = 'Purging...';
  }

  try {
    const supabaseClient = createSupabaseClient();
    
    // First attempt using dedicated RPC function
    const { data: rpcDeleted, error: rpcError } = await supabaseClient
      .rpc('delete_all_test_orders');

    if (rpcError) {
      // Fallback: Delete rows directly via table delete
      const { error: directError } = await supabaseClient
        .from('orders')
        .delete()
        .eq('is_test', true);

      if (directError) throw directError;
    }

    showToast(`Successfully deleted ${testOrders.length} test order(s)!`, 'success');
    await loadOrders();
  } catch (err) {
    console.error('Error purging test orders:', err);
    showAlert('Purge Failed', 'Error removing test orders: ' + err.message, 'danger');
  } finally {
    if (purgeBtn) {
      purgeBtn.disabled = false;
      purgeBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Purge Test Orders
      `;
    }
  }
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  loadOrders();
}

function handleSearch() {
  renderDashboard();
}

// ============================================
// Tabs Controller
// ============================================

function switchTab(tab) {
  currentTab = tab;
  const ordersTab = document.getElementById('orders-tab-view');
  const inventoryTab = document.getElementById('inventory-tab-view');
  const ordersBtn = document.getElementById('tab-btn-orders');
  const inventoryBtn = document.getElementById('tab-btn-inventory');

  if (tab === 'orders') {
    ordersTab.style.display = 'block';
    inventoryTab.style.display = 'none';
    ordersBtn.classList.add('active');
    ordersBtn.style.color = 'var(--maroon)';
    ordersBtn.style.borderBottom = '2px solid var(--maroon)';
    inventoryBtn.classList.remove('active');
    inventoryBtn.style.color = 'var(--text-muted)';
    inventoryBtn.style.borderBottom = 'none';
    loadOrders();
  } else {
    ordersTab.style.display = 'none';
    inventoryTab.style.display = 'block';
    inventoryBtn.classList.add('active');
    inventoryBtn.style.color = 'var(--maroon)';
    inventoryBtn.style.borderBottom = '2px solid var(--maroon)';
    ordersBtn.classList.remove('active');
    ordersBtn.style.color = 'var(--text-muted)';
    ordersBtn.style.borderBottom = 'none';
    loadInventory();
  }
}

// ============================================
// Stock / Inventory Management Section
// ============================================

async function loadInventory() {
  const container = document.getElementById('inventory-container');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    await fetchBooks();
    renderInventory();
  } catch (error) {
    console.error('Error loading inventory:', error);
    container.innerHTML = '<div class="empty-state"><p>Error loading books. Please reload.</p></div>';
  }
}

function renderInventory() {
  const container = document.getElementById('inventory-container');
  if (BOOKS.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No books found. Click "+ Add New Book" to add one.</p></div>';
    return;
  }

  const rowsHtml = BOOKS.map(book => {
    const qty = book.stock_quantity;
    let stockClass = 'stock-in';
    let stockText = `🟢 ${qty} In Stock`;
    if (qty === 0) {
      stockClass = 'stock-out';
      stockText = '🔴 Out of Stock';
    } else if (qty <= 5) {
      stockClass = 'stock-low';
      stockText = `🟡 ${qty} Low Stock`;
    }

    return `
      <tr style="border-bottom: 1px solid var(--ivory-dark);">
        <td style="padding:0.75rem 1rem;">
          <img src="${book.image}" alt="${book.title}" style="width:40px;height:55px;object-fit:cover;border-radius:4px;box-shadow:var(--shadow-sm);" onerror="this.style.display='none';this.parentElement.textContent='No Image';" />
        </td>
        <td style="padding:0.75rem 1rem;font-weight:600;color:var(--maroon);">${book.title}</td>
        <td style="padding:0.75rem 1rem;">Rs. ${book.price}</td>
        <td style="padding:0.75rem 1rem;"><span class="stock-badge ${stockClass}">${stockText}</span></td>
        <td style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${book.type || 'Book'} | ${book.pages || 0} pages ${book.dimensions ? `| ${book.dimensions}` : ''}
        </td>
        <td style="padding:0.75rem 1rem;">
          <button class="proof-btn" onclick="openBookModal(${book.id})" style="margin:0;padding:0.35rem 0.65rem;font-size:0.75rem;">Edit</button>
          <button class="proof-btn" onclick="deleteBook(${book.id})" style="margin:0;padding:0.35rem 0.65rem;font-size:0.75rem;background:var(--danger-light);color:var(--danger);margin-left:0.5rem;">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="inventory-table-wrapper" style="overflow-x:auto;">
      <table class="inventory-table" style="width:100%;border-collapse:collapse;margin-top:1rem;background:var(--card-bg);border-radius:var(--radius);box-shadow:var(--shadow-sm);border:1px solid rgba(74,21,37,0.05);">
        <thead>
          <tr style="background:var(--ivory-dark);text-align:left;border-bottom:1.5px solid #E7E5E4;font-size:0.85rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:1rem;">Cover</th>
            <th style="padding:1rem;">Title</th>
            <th style="padding:1rem;">Price</th>
            <th style="padding:1rem;">Stock Status</th>
            <th style="padding:1rem;">Specifications</th>
            <th style="padding:1rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function openBookModal(bookId) {
  const modal = document.getElementById('book-modal');
  const title = document.getElementById('book-modal-title');
  
  // Clear forms
  document.getElementById('book-form').reset();
  document.getElementById('edit-book-id').value = '';

  if (bookId) {
    title.textContent = 'Edit Book Details';
    const book = BOOKS.find(b => b.id === bookId);
    if (book) {
      document.getElementById('edit-book-id').value = book.id;
      document.getElementById('book-title').value = book.title;
      document.getElementById('book-price').value = book.price;
      document.getElementById('book-stock').value = book.stock_quantity;
      document.getElementById('book-desc').value = book.description;
      document.getElementById('book-type').value = book.type || 'Softbound';
      document.getElementById('book-pages').value = book.pages || 0;
      document.getElementById('book-dimensions').value = book.dimensions || '';
    }
  } else {
    title.textContent = 'Add New Book';
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeBookModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('proof-modal-close')) return;
  const modal = document.getElementById('book-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

async function saveBook(event) {
  event.preventDefault();
  
  const saveBtn = document.getElementById('save-book-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const id = document.getElementById('edit-book-id').value;
  const title = document.getElementById('book-title').value.trim();
  const price = parseInt(document.getElementById('book-price').value);
  const stock = parseInt(document.getElementById('book-stock').value);
  const desc = document.getElementById('book-desc').value.trim();
  const type = document.getElementById('book-type').value;
  const pages = parseInt(document.getElementById('book-pages').value);
  const dimensions = document.getElementById('book-dimensions').value.trim();
  const coverUpload = document.getElementById('book-cover-upload').files[0];

  try {
    const supabaseClient = createSupabaseClient();
    let imageUrl = null;

    if (coverUpload) {
      const fileExt = coverUpload.name.split('.').pop();
      const fileName = `cover-${Date.now()}.${fileExt}`;
      const { data, error } = await supabaseClient.storage
        .from('book-covers')
        .upload(fileName, coverUpload);

      if (error) throw error;

      const { data: { publicUrl } } = supabaseClient.storage
        .from('book-covers')
        .getPublicUrl(fileName);

      imageUrl = publicUrl;
    }

    const bookData = {
      title,
      price,
      stock_quantity: stock,
      description: desc,
      type,
      pages,
      dimensions: dimensions || null
    };

    if (imageUrl) {
      bookData.image_url = imageUrl;
    }

    if (id) {
      // Update existing book
      const { error } = await supabaseClient
        .from('books')
        .update(bookData)
        .eq('id', id);

      if (error) throw error;
      showToast('Book updated successfully!', 'success');
    } else {
      // Insert new book (cover image is required for new books)
      if (!imageUrl) {
        await showAlert('Image Required', 'Please upload a cover image for new books.', 'warning');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Book';
        return;
      }
      const { error } = await supabaseClient
        .from('books')
        .insert(bookData);

      if (error) throw error;
      showToast('Book added successfully!', 'success');
    }

    closeBookModal();
    loadInventory();

  } catch (error) {
    console.error('Error saving book:', error);
    await showAlert('Save Failed', 'Error saving book: ' + error.message, 'danger');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Book';
  }
}

async function deleteBook(bookId) {
  const isConfirmed = await showConfirm(
    'Confirm Deletion',
    'Are you sure you want to delete this book? This will permanently remove it from the catalog.'
  );

  if (!isConfirmed) {
    return;
  }

  try {
    const supabaseClient = createSupabaseClient();
    const { error } = await supabaseClient
      .from('books')
      .delete()
      .eq('id', bookId);

    if (error) {
      // Handle foreign key constraint error gracefully
      if (error.message && error.message.includes('foreign key constraint')) {
        await showAlert(
          'Cannot Delete Book',
          'Cannot delete this book because it has been ordered in previous orders. Instead, set its stock quantity to 0 to hide it from the catalog.',
          'warning'
        );
      } else {
        throw error;
      }
      return;
    }

    showToast('Book deleted!', 'success');
    loadInventory();
  } catch (error) {
    console.error('Error deleting book:', error);
    await showAlert('Delete Failed', 'Error deleting book: ' + error.message, 'danger');
  }
}

// ============================================
// CSV Export Functionality
// ============================================

function exportOrdersToCSV() {
  if (allOrders.length === 0) {
    showToast('No orders to export.', 'warning');
    return;
  }

  const csvRows = [];
  // CSV Headers
  csvRows.push(['Order ID', 'Date', 'Customer Name', 'Phone', 'Address', 'Total Amount (Rs.)', 'Status', 'Tracking Number', 'Items Ordered'].join(','));

  allOrders.forEach(order => {
    const itemsDescription = (order.order_items || []).map(item => {
      const book = BOOKS.find(b => b.id === item.book_id);
      return `${book ? book.title : 'Book'} (Qty: ${item.quantity})`;
    }).join('; ');

    const row = [
      order.id,
      new Date(order.created_at).toLocaleDateString('en-IN'),
      `"${order.customer_name.replace(/"/g, '""')}"`,
      `"${order.phone}"`,
      `"${order.address.replace(/"/g, '""')}"`,
      order.total_amount,
      order.status,
      `"${order.tracking_number || ''}"`,
      `"${itemsDescription.replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(','));
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `gurudev_books_orders_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================
// Helpers & Core Initialization
// ============================================

function createSupabaseClient() {
  return supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

document.addEventListener('DOMContentLoaded', checkAuth);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeProofModal();
    closeBookModal();
  }
});

function copyShippingLabel(orderId, btn) {
  const textEl = document.getElementById(`shipping-label-${orderId}`);
  if (!textEl) return;
  
  navigator.clipboard.writeText(textEl.textContent.trim()).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Copied!
    `;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
  });
}
