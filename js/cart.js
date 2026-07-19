function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(bookId, quantity) {
  const cart = getCart();
  const existing = cart.find(item => item.bookId === bookId);
  const book = BOOKS.find(b => b.id === bookId);
  const stock = book ? book.stock_quantity : 0;

  if (stock <= 0) {
    showToast('Sorry, this book is out of stock.', 'danger');
    return;
  }

  const currentQty = existing ? existing.quantity : 0;
  if (currentQty + quantity > stock) {
    showToast(`Only ${stock} copies available in stock.`, 'warning');
    return;
  }

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ bookId, quantity });
  }
  saveCart(cart);
  showToast('Added to cart!', 'success');
}

function updateQuantity(bookId, quantity) {
  const cart = getCart();
  const item = cart.find(item => item.bookId === bookId);
  if (item) {
    const book = BOOKS.find(b => b.id === bookId);
    const stock = book ? book.stock_quantity : 10;

    let targetQty = quantity;
    if (targetQty > stock) {
      targetQty = stock;
      showToast(`Only ${stock} copies available in stock.`, 'warning');
    }

    item.quantity = targetQty;
    if (item.quantity <= 0) {
      cart.splice(cart.indexOf(item), 1);
    }
  }
  saveCart(cart);
}

function removeFromCart(bookId) {
  const cart = getCart().filter(item => item.bookId !== bookId);
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem('cart');
  updateCartBadge();
}

function getCartTotal() {
  const cart = getCart();
  return cart.reduce((total, item) => {
    const book = BOOKS.find(b => b.id === item.bookId);
    if (!book) return total;
    return total + (book.price * item.quantity);
  }, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  const oldCount = parseInt(badge.textContent || '0');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';

  // Trigger bounce animation if quantity increased
  if (count > oldCount) {
    badge.style.animation = 'none';
    void badge.offsetWidth; // trigger reflow
    badge.style.animation = ''; // restore CSS animation
  }
}

// ============================================
// Premium Notification System (SweetAlert2)
// ============================================

function showToast(message, type = 'success') {
  if (typeof Swal === 'undefined') {
    // Fallback if CDN failed or is not loaded yet
    console.warn('SweetAlert2 not loaded, using fallback toast:', message);
    const fallback = document.createElement('div');
    fallback.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4A1525;color:white;padding:12px 24px;border-radius:8px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:0.9rem;font-weight:600;';
    fallback.textContent = message;
    document.body.appendChild(fallback);
    setTimeout(() => fallback.remove(), 3000);
    return;
  }

  let icon = 'info';
  if (type === 'success') icon = 'success';
  else if (type === 'warning') icon = 'warning';
  else if (type === 'danger') icon = 'error';

  const Toast = Swal.mixin({
    toast: true,
    position: 'top', // Premium look at the top
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  Toast.fire({
    icon: icon,
    title: message
  });
}

function showAlert(title, message, type = 'info') {
  if (typeof Swal === 'undefined') {
    alert(`${title}\n\n${message}`);
    return Promise.resolve();
  }

  let icon = 'info';
  if (type === 'success') icon = 'success';
  else if (type === 'warning') icon = 'warning';
  else if (type === 'danger') icon = 'error';

  return Swal.fire({
    title: title,
    text: message,
    icon: icon,
    confirmButtonColor: '#4A1525', // Maroon branding color
    confirmButtonText: 'OK'
  });
}

function showConfirm(title, message) {
  if (typeof Swal === 'undefined') {
    return Promise.resolve(confirm(message));
  }

  return Swal.fire({
    title: title,
    text: message,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#4A1525', // Maroon branding color
    cancelButtonColor: '#78716C', // Muted gray
    confirmButtonText: 'Confirm',
    cancelButtonText: 'Cancel'
  }).then((result) => {
    return result.isConfirmed;
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
