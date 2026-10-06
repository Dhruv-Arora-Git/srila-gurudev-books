/**
 * Gurudev Books - Testing Framework Core Utilities & Mock Database
 */

class Expectation {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    if (this.actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)} (${typeof expected}), but received ${JSON.stringify(this.actual)} (${typeof this.actual})`);
    }
    return true;
  }

  toEqual(expected) {
    const actStr = JSON.stringify(this.actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      throw new Error(`Expected deep equality:\nExpected: ${expStr}\nReceived: ${actStr}`);
    }
    return true;
  }

  toBeTruthy() {
    if (!this.actual) {
      throw new Error(`Expected truthy value, but received ${JSON.stringify(this.actual)}`);
    }
    return true;
  }

  toBeFalsy() {
    if (this.actual) {
      throw new Error(`Expected falsy value, but received ${JSON.stringify(this.actual)}`);
    }
    return true;
  }

  toContain(sub) {
    if (typeof this.actual === 'string' && !this.actual.includes(sub)) {
      throw new Error(`Expected string "${this.actual}" to contain "${sub}"`);
    } else if (Array.isArray(this.actual) && !this.actual.includes(sub)) {
      throw new Error(`Expected array to contain item ${JSON.stringify(sub)}`);
    }
    return true;
  }

  toBeGreaterThan(val) {
    if (!(this.actual > val)) {
      throw new Error(`Expected ${this.actual} to be greater than ${val}`);
    }
    return true;
  }

  toBeLessThanOrEqual(val) {
    if (!(this.actual <= val)) {
      throw new Error(`Expected ${this.actual} to be <= ${val}`);
    }
    return true;
  }
}

function expect(actual) {
  return new Expectation(actual);
}

// In-Memory Test Suite Registry
const testSuites = [];
let currentSuite = null;

function describe(suiteName, fn) {
  const suite = { name: suiteName, tests: [] };
  testSuites.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prev;
}

function test(testName, fn) {
  if (!currentSuite) {
    describe('Default Suite', () => {
      currentSuite.tests.push({ name: testName, fn });
    });
  } else {
    currentSuite.tests.push({ name: testName, fn });
  }
}

/**
 * Mock Supabase Database Client for isolated sandbox testing
 */
function createMockSupabase() {
  const db = {
    books: [
      { id: 1, title: 'When Good Fortune Arises', price: 300, stock_quantity: 10, weight_grams: 611 },
      { id: 2, title: 'Mathura meets Vrindavan', price: 200, stock_quantity: 10, weight_grams: 381 },
      { id: 5, title: 'Gopal Jiu', price: 70, stock_quantity: 2, weight_grams: 123 },
      { id: 6, title: 'How to find Guru', price: 20, stock_quantity: 0, weight_grams: 33 } // Out of stock
    ],
    orders: [],
    order_items: []
  };

  return {
    _db: db,
    from(table) {
      return {
        select(cols) {
          const rows = [...(db[table] || [])];
          return {
            order(col, opts) {
              return Promise.resolve({ data: rows, error: null });
            },
            then(resolve) {
              resolve({ data: rows, error: null });
            }
          };
        },
        delete() {
          return {
            eq(col, val) {
              const before = (db[table] || []).length;
              db[table] = (db[table] || []).filter(item => item[col] !== val);
              return Promise.resolve({ data: null, error: null, deletedCount: before - db[table].length });
            }
          };
        },
        update(updates) {
          return {
            eq(col, val) {
              (db[table] || []).forEach(row => {
                if (row[col] === val) {
                  Object.assign(row, updates);
                }
              });
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    },
    rpc(fnName, params = {}) {
      if (fnName === 'create_order_with_items') {
        const { cust_name, cust_phone, cust_address, total_amt, proof_url, items, is_test, test_secret } = params;
        const newOrderId = 'test-ord-' + Date.now();

        // Database-level Anti-Tamper Check:
        // Unauthorized callers requesting is_test=true without admin test secret are blocked!
        if (is_test && test_secret !== 'gurudev_test_2026') {
          return Promise.resolve({
            data: null,
            error: { message: 'Access Denied: Only store administrators can create test orders.' }
          });
        }

        // Check stock for real orders
        if (!is_test) {
          for (const it of items) {
            const book = db.books.find(b => b.id === it.book_id);
            if (!book) return Promise.resolve({ data: null, error: { message: `Book not found` } });
            if (book.stock_quantity < it.quantity) {
              return Promise.resolve({ data: null, error: { message: `Insufficient stock for book ID ${it.book_id}` } });
            }
          }
          // Decrement real stock
          for (const it of items) {
            const book = db.books.find(b => b.id === it.book_id);
            book.stock_quantity -= it.quantity;
          }
        }
        // IF IS_TEST: Do NOT decrement book stock!

        db.orders.push({
          id: newOrderId,
          customer_name: cust_name,
          phone: cust_phone,
          address: cust_address,
          total_amount: total_amt,
          status: 'Payment Verification is Pending',
          payment_proof_url: proof_url,
          is_test: Boolean(is_test),
          created_at: new Date().toISOString()
        });

        for (const it of items) {
          db.order_items.push({
            order_id: newOrderId,
            book_id: it.book_id,
            quantity: it.quantity,
            price: it.price
          });
        }

        return Promise.resolve({ data: newOrderId, error: null });
      }

      if (fnName === 'get_customer_orders_by_phone') {
        const { customer_phone } = params;
        // Production tracking strictly excludes is_test orders!
        const matching = db.orders
          .filter(o => o.phone === customer_phone && !o.is_test)
          .map(o => ({
            ...o,
            order_items: db.order_items.filter(oi => oi.order_id === o.id)
          }));
        return Promise.resolve({ data: matching, error: null });
      }

      if (fnName === 'delete_all_test_orders') {
        const before = db.orders.length;
        const testIds = db.orders.filter(o => o.is_test).map(o => o.id);
        db.orders = db.orders.filter(o => !o.is_test);
        db.order_items = db.order_items.filter(oi => !testIds.includes(oi.order_id));
        return Promise.resolve({ data: before - db.orders.length, error: null });
      }

      return Promise.resolve({ data: null, error: { message: `Unknown RPC function ${fnName}` } });
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    expect,
    describe,
    test,
    testSuites,
    createMockSupabase
  };
}

if (typeof window !== 'undefined') {
  window.TestFramework = {
    expect,
    describe,
    test,
    suites: testSuites,
    createMockSupabase
  };
}
