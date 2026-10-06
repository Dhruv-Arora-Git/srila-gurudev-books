/**
 * Test Suite: Test Data Isolation & Production Protection
 * 
 * Verifies that:
 * 1. Test orders never decrement physical book inventory.
 * 2. Test orders never pollute production financial accounting (Total Lakshmi).
 * 3. Test orders are never shown to real customers on the order tracking page.
 * 4. Test orders can be purged cleanly without touching production customer records.
 */
(() => {
const { describe, test, expect, createMockSupabase } = (typeof module !== 'undefined' && module.exports)
  ? require('./test-utils')
  : window.TestFramework;

describe('Test Data Isolation & Production Protection', () => {

  test('Real production orders decrement book inventory stock', async () => {
    const mockSupabase = createMockSupabase();
    
    // Initial stock of Book #1: 10 copies
    const bookBefore = mockSupabase._db.books.find(b => b.id === 1);
    expect(bookBefore.stock_quantity).toBe(10);

    // Place a Real Production Order for 2 copies (is_test = false)
    const { data: orderId, error } = await mockSupabase.rpc('create_order_with_items', {
      cust_name: 'Genuine Customer',
      cust_phone: '9876543210',
      cust_address: '123 MG Road | Pune, Maharashtra | 411001',
      total_amt: 670,
      proof_url: 'real-proof.jpg',
      items: [{ book_id: 1, quantity: 2, price: 300 }],
      is_test: false
    });

    expect(error).toBe(null);
    expect(orderId).toBeTruthy();

    // Verification: Stock MUST be decremented from 10 to 8
    const bookAfter = mockSupabase._db.books.find(b => b.id === 1);
    expect(bookAfter.stock_quantity).toBe(8);
  });

  test('Sandbox test orders NEVER decrement physical book inventory', async () => {
    const mockSupabase = createMockSupabase();

    // Initial stock of Book #2: 10 copies
    const bookBefore = mockSupabase._db.books.find(b => b.id === 2);
    expect(bookBefore.stock_quantity).toBe(10);

    // Place a Sandbox Test Order for 4 copies (is_test = true with authorized secret)
    const { data: orderId, error } = await mockSupabase.rpc('create_order_with_items', {
      cust_name: '[TEST] Test Devotee',
      cust_phone: '9999999999',
      cust_address: 'Test Ashram | Pune, Maharashtra | 411048',
      total_amt: 870,
      proof_url: 'test-proof.png',
      items: [{ book_id: 2, quantity: 4, price: 200 }],
      is_test: true,
      test_secret: 'gurudev_test_2026'
    });

    expect(error).toBe(null);
    expect(orderId).toBeTruthy();

    // CRITICAL SECURITY & BUSINESS INVARIANT:
    // Physical inventory MUST remain untouched at 10 copies!
    const bookAfter = mockSupabase._db.books.find(b => b.id === 2);
    expect(bookAfter.stock_quantity).toBe(10);
  });

  test('Anti-Tampering: Unauthorized caller attempting is_test: true without admin key is rejected by database', async () => {
    const mockSupabase = createMockSupabase();

    // Attacker attempts to place an order with is_test: true without authorized secret
    const { data: orderId, error } = await mockSupabase.rpc('create_order_with_items', {
      cust_name: 'Attacker Tamper',
      cust_phone: '9999999999',
      cust_address: 'Hacker Way',
      total_amt: 9999,
      proof_url: 'fake.png',
      items: [{ book_id: 1, quantity: 1, price: 300 }],
      is_test: true,
      test_secret: 'wrong_secret_attempt'
    });

    // Verification: Database must REJECT the transaction!
    expect(orderId).toBe(null);
    expect(error).toBeTruthy();
    expect(error.message).toContain('Access Denied');
  });

  test('Public customer tracking hides test orders from real users', async () => {
    const mockSupabase = createMockSupabase();
    const customerPhone = '9876543210';

    // 1. Create a genuine customer order
    await mockSupabase.rpc('create_order_with_items', {
      cust_name: 'Bhakt John',
      cust_phone: customerPhone,
      cust_address: 'Real St | Pune, MH | 411001',
      total_amt: 370,
      proof_url: 'real.jpg',
      items: [{ book_id: 1, quantity: 1, price: 300 }],
      is_test: false
    });

    // 2. Create an internal test order using the same phone number (with valid admin test secret)
    await mockSupabase.rpc('create_order_with_items', {
      cust_name: '[TEST] QA Engineer',
      cust_phone: customerPhone,
      cust_address: 'Internal QA | Pune, MH | 411001',
      total_amt: 9999,
      proof_url: 'mock.jpg',
      items: [{ book_id: 1, quantity: 1, price: 300 }],
      is_test: true,
      test_secret: 'gurudev_test_2026'
    });

    // 3. Customer checks their orders on public tracking
    const { data: publicOrders } = await mockSupabase.rpc('get_customer_orders_by_phone', {
      customer_phone: customerPhone
    });

    // Verification:
    // Only the real order (total 370) is returned. Test order (total 9999) is strictly excluded!
    expect(publicOrders.length).toBe(1);
    expect(publicOrders[0].total_amount).toBe(370);
    expect(publicOrders[0].customer_name).toBe('Bhakt John');
    expect(publicOrders[0].is_test).toBeFalsy();
  });

  test('Admin production accounting excludes test orders from Total Lakshmi', () => {
    // Simulate database order rows
    const databaseOrders = [
      { id: '1', customer_name: 'Devotee A', total_amount: 500, status: 'Delivered', is_test: false },
      { id: '2', customer_name: 'Devotee B', total_amount: 800, status: 'Shipped', is_test: false },
      { id: '3', customer_name: '[TEST] QA Run', total_amount: 25000, status: 'Payment Verified', is_test: true } // Giant test order!
    ];

    // Real production filter rule: order.is_test !== true
    const productionOrders = databaseOrders.filter(o => o.is_test !== true);
    const productionLakshmi = productionOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // Verification: Production total should be 500 + 800 = 1300 Rs.
    // It must NOT include the 25,000 Rs test amount!
    expect(productionOrders.length).toBe(2);
    expect(productionLakshmi).toBe(1300);
  });

  test('Purge action deletes ONLY test orders, preserving real customer orders', async () => {
    const mockSupabase = createMockSupabase();

    // Insert 2 real orders
    await mockSupabase.rpc('create_order_with_items', {
      cust_name: 'Real Order 1',
      cust_phone: '9111111111',
      cust_address: 'Real 1',
      total_amt: 300,
      proof_url: 'p1.jpg',
      items: [{ book_id: 1, quantity: 1, price: 300 }],
      is_test: false
    });
    await mockSupabase.rpc('create_order_with_items', {
      cust_name: 'Real Order 2',
      cust_phone: '9222222222',
      cust_address: 'Real 2',
      total_amt: 400,
      proof_url: 'p2.jpg',
      items: [{ book_id: 2, quantity: 2, price: 200 }],
      is_test: false
    });

    // Insert 3 test orders (with valid admin secret)
    for (let i = 1; i <= 3; i++) {
      await mockSupabase.rpc('create_order_with_items', {
        cust_name: `Test Order ${i}`,
        cust_phone: '9000000000',
        cust_address: 'Test',
        total_amt: 100,
        proof_url: 't.jpg',
        items: [{ book_id: 1, quantity: 1, price: 100 }],
        is_test: true,
        test_secret: 'gurudev_test_2026'
      });
    }

    expect(mockSupabase._db.orders.length).toBe(5);

    // Admin invokes delete_all_test_orders
    const { data: deletedCount } = await mockSupabase.rpc('delete_all_test_orders');

    expect(deletedCount).toBe(3);
    expect(mockSupabase._db.orders.length).toBe(2);

    // Remaining orders must all be genuine production orders
    expect(mockSupabase._db.orders.every(o => !o.is_test)).toBe(true);
  });
});
})();
