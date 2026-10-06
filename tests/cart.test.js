/**
 * Test Suite: Shopping Cart Operations & Stock Constraints
 */
(() => {
const { describe, test, expect } = (typeof module !== 'undefined' && module.exports)
  ? require('./test-utils')
  : window.TestFramework;

const envGlobal = typeof global !== 'undefined' ? global : window;

// Mock localStorage for Node environment if needed
let mockStore = {};
if (typeof localStorage === 'undefined') {
  envGlobal.localStorage = {
    getItem: (key) => mockStore[key] || null,
    setItem: (key, val) => { mockStore[key] = String(val); },
    removeItem: (key) => { delete mockStore[key]; },
    clear: () => { mockStore = {}; }
  };
}

// Mock BOOKS catalog
const testBooks = [
  { id: 1, title: 'When Good Fortune Arises', price: 300, stock_quantity: 5 },
  { id: 2, title: 'Mathura meets Vrindavan', price: 200, stock_quantity: 2 },
  { id: 6, title: 'How to find Guru', price: 20, stock_quantity: 0 } // Out of stock
];
envGlobal.BOOKS = testBooks;
if (typeof window !== 'undefined') window.BOOKS = testBooks;

// Mock showToast
envGlobal.showToast = () => {};
envGlobal.updateCartBadge = () => {};

const {
  getCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  getCartTotal,
  getCartCount
} = (typeof module !== 'undefined' && module.exports)
  ? require('../js/cart')
  : window;

describe('Shopping Cart Operations & Stock Limits', () => {

  test('Starts with empty cart', () => {
    clearCart();
    expect(getCart().length).toBe(0);
    expect(getCartTotal()).toBe(0);
    expect(getCartCount()).toBe(0);
  });

  test('Adds items to cart and computes accurate total', () => {
    clearCart();
    addToCart(1, 2); // 2 x 300 = 600
    addToCart(2, 1); // 1 x 200 = 200

    const cart = getCart();
    expect(cart.length).toBe(2);
    expect(getCartCount()).toBe(3);
    expect(getCartTotal()).toBe(800);
  });

  test('Increments existing item quantity correctly', () => {
    clearCart();
    addToCart(1, 1);
    addToCart(1, 2);

    const cart = getCart();
    expect(cart.length).toBe(1);
    expect(cart[0].quantity).toBe(3);
    expect(getCartTotal()).toBe(900);
  });

  test('Prevents adding out-of-stock books', () => {
    clearCart();
    addToCart(6, 1); // Stock is 0
    expect(getCart().length).toBe(0);
  });

  test('Prevents exceeding available inventory stock', () => {
    clearCart();
    // Book #2 has only 2 copies in stock
    addToCart(2, 2);
    expect(getCart()[0].quantity).toBe(2);

    // Attempting to add 1 more should be rejected
    addToCart(2, 1);
    expect(getCart()[0].quantity).toBe(2);
  });

  test('Removes items and updates totals cleanly', () => {
    clearCart();
    addToCart(1, 2);
    addToCart(2, 1);

    removeFromCart(1);
    const cart = getCart();
    expect(cart.length).toBe(1);
    expect(cart[0].bookId).toBe(2);
    expect(getCartTotal()).toBe(200);
  });

  test('Clears entire cart on command', () => {
    addToCart(1, 1);
    clearCart();
    expect(getCart().length).toBe(0);
    expect(getCartTotal()).toBe(0);
  });
});
})();
