-- =========================================================================
-- COMPLETE SUPABASE RESET & TEST ISOLATION FRAMEWORK SETUP
-- =========================================================================
-- Instructions:
-- 1. Open your Supabase Project Dashboard: https://supabase.com/dashboard
-- 2. Go to the "SQL Editor" in the left sidebar.
-- 3. Copy and paste all contents of this file into the editor.
-- 4. Click "Run" (or Ctrl+Enter / Cmd+Enter).
--
-- What this script does:
--  ✓ Safely deletes all old/dummy orders and order items.
--  ✓ Resets book stock inventory back to full fresh stock (10 copies each).
--  ✓ Installs the `is_test` column and index for production test isolation.
--  ✓ Installs anti-tampering triggers (test orders NEVER touch inventory stock).
--  ✓ Installs atomic order creation RPC with database-level admin JWT check.
--  ✓ Installs customer tracking RPC (hides internal test orders from real devotees).
--  ✓ Installs admin 1-click test purge RPC.
--  ✓ Configures all Row Level Security (RLS) policies.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: TEMPORARILY DROP TRIGGERS TO PREVENT STOCK CORRUPTION DURING WIPE
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_decrement_stock ON order_items;
DROP TRIGGER IF EXISTS trg_restore_stock ON order_items;

-- -------------------------------------------------------------------------
-- STEP 2: CLEAN SLATE - DELETE ALL OLD ORDERS AND ORDER ITEMS
-- -------------------------------------------------------------------------
DELETE FROM order_items;
DELETE FROM orders;

-- -------------------------------------------------------------------------
-- STEP 3: RESET BOOK STOCK QUANTITIES BACK TO FULL FRESH INVENTORY (10 EACH)
-- -------------------------------------------------------------------------
-- Make sure table exists and columns are ready
ALTER TABLE books ADD COLUMN IF NOT EXISTS weight_grams integer;

-- Update stock quantity for all existing books
UPDATE books SET stock_quantity = 10;

-- -------------------------------------------------------------------------
-- STEP 4: ADD TEST ISOLATION SCHEMA TO ORDERS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_link text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Create an index to quickly filter test vs real orders
CREATE INDEX IF NOT EXISTS idx_orders_is_test ON orders(is_test);

-- -------------------------------------------------------------------------
-- STEP 5: STOCK DECREMENT TRIGGER (SKIPS INVENTORY REDUCTION FOR TEST ORDERS)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decrement_book_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_is_test boolean := false;
BEGIN
  -- Verify if parent order is flagged as a test order
  SELECT coalesce(is_test, false) INTO v_is_test 
  FROM orders 
  WHERE id = NEW.order_id;

  -- CRITICAL PRODUCTION PROTECTION:
  -- If this is a test order, do NOT decrement physical inventory!
  IF v_is_test IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Verify book existence & available stock
  IF NOT EXISTS (SELECT 1 FROM books WHERE id = NEW.book_id) THEN
    RAISE EXCEPTION 'Book with ID % does not exist', NEW.book_id;
  END IF;

  IF (SELECT stock_quantity FROM books WHERE id = NEW.book_id) < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock for book ID %', NEW.book_id;
  END IF;

  -- Decrement real physical inventory for production orders
  UPDATE books
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.book_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION decrement_book_stock();

-- -------------------------------------------------------------------------
-- STEP 6: STOCK RESTORATION TRIGGER (SKIPS RESTORATION WHEN TEST ORDERS ARE DELETED)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION restore_book_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_is_test boolean := false;
BEGIN
  -- Check if order was a test order
  SELECT coalesce(is_test, false) INTO v_is_test 
  FROM orders 
  WHERE id = OLD.order_id;

  -- If this was a test order, stock was never decremented, so don't increment it
  IF v_is_test IS TRUE THEN
    RETURN OLD;
  END IF;

  UPDATE books
  SET stock_quantity = stock_quantity + OLD.quantity
  WHERE id = OLD.book_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restore_stock
  AFTER DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION restore_book_stock();

-- -------------------------------------------------------------------------
-- STEP 7: ATOMIC ORDER CREATION RPC (WITH DATABASE-LEVEL SECURITY GATE)
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_order_with_items(text, text, text, integer, text, jsonb);
DROP FUNCTION IF EXISTS create_order_with_items(text, text, text, integer, text, jsonb, boolean);
DROP FUNCTION IF EXISTS create_order_with_items(text, text, text, integer, text, jsonb, boolean, text);

CREATE OR REPLACE FUNCTION create_order_with_items(
  cust_name text,
  cust_phone text,
  cust_address text,
  total_amt integer,
  proof_url text,
  items jsonb,
  is_test boolean DEFAULT false,
  test_secret text DEFAULT NULL
) RETURNS uuid SECURITY DEFINER AS $$
DECLARE
  new_order_id uuid;
  item_rec json;
  v_is_test boolean := false;
BEGIN
  -- DATABASE-LEVEL ANTI-TAMPERING SECURITY CHECK:
  -- Only authenticated admins or authorized test callers can create test orders.
  IF coalesce(is_test, false) IS TRUE THEN
    IF (auth.role() = 'authenticated' AND lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com')
       OR (test_secret IS NOT NULL AND test_secret = 'gurudev_test_2026') THEN
      v_is_test := true;
    ELSE
      -- Block unauthorized tampering: Reject the request immediately!
      RAISE EXCEPTION 'Access Denied: Only store administrators can create test orders.';
    END IF;
  END IF;

  -- 1. Insert order with validated is_test flag
  INSERT INTO orders (
    customer_name, 
    phone, 
    address, 
    total_amount, 
    status, 
    payment_proof_url, 
    is_test
  )
  VALUES (
    cust_name, 
    cust_phone, 
    cust_address, 
    total_amt, 
    'Payment Verification is Pending', 
    proof_url, 
    v_is_test
  )
  RETURNING id INTO new_order_id;

  -- 2. Insert items (triggers will inspect is_test and handle inventory accordingly)
  FOR item_rec IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    INSERT INTO order_items (order_id, book_id, quantity, price)
    VALUES (
      new_order_id,
      (item_rec->>'book_id')::integer,
      (item_rec->>'quantity')::integer,
      (item_rec->>'price')::integer
    );
  END LOOP;

  RETURN new_order_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_order_with_items(text, text, text, integer, text, jsonb, boolean, text) TO anon, authenticated;

-- -------------------------------------------------------------------------
-- STEP 8: CUSTOMER ORDER TRACKING RPC (HIDES TEST ORDERS FROM REAL CUSTOMERS)
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_customer_orders_by_phone(text);

CREATE OR REPLACE FUNCTION get_customer_orders_by_phone(customer_phone text)
RETURNS TABLE (
  id uuid,
  customer_name text,
  phone text,
  address text,
  total_amount integer,
  status text,
  tracking_number text,
  tracking_link text,
  created_at timestamptz,
  is_test boolean,
  order_items jsonb
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.customer_name,
    o.phone,
    o.address,
    o.total_amount,
    o.status,
    o.tracking_number,
    o.tracking_link,
    o.created_at,
    o.is_test,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'book_id', oi.book_id,
          'quantity', oi.quantity,
          'price', oi.price
        )
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'::jsonb
    ) AS order_items
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.phone = customer_phone
    -- SECURITY & PRIVACY: Real customer tracking NEVER returns internal test orders
    AND coalesce(o.is_test, false) = false
  GROUP BY o.id
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_customer_orders_by_phone(text) TO anon, authenticated;

-- -------------------------------------------------------------------------
-- STEP 9: ADMIN RPC TO PURGE TEST ORDERS (AUTHENTICATED ADMIN ONLY)
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS delete_all_test_orders();

CREATE OR REPLACE FUNCTION delete_all_test_orders()
RETURNS integer SECURITY DEFINER AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Strict Admin Authorization Check
  IF auth.role() <> 'authenticated' OR lower(auth.jwt() ->> 'email') <> 'admin1@srilagurudev.com' THEN
    RAISE EXCEPTION 'Access Denied: Only authenticated administrators can purge test orders';
  END IF;

  DELETE FROM orders WHERE is_test = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION delete_all_test_orders() TO authenticated;

-- -------------------------------------------------------------------------
-- STEP 10: ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS "Anyone can view books" ON books;
DROP POLICY IF EXISTS "Admins can modify books" ON books;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON order_items;
DROP POLICY IF EXISTS "Admins can view all order items" ON order_items;
DROP POLICY IF EXISTS "Admins can delete order items" ON order_items;

-- Books Policies
CREATE POLICY "Anyone can view books" ON books FOR SELECT USING (true);
CREATE POLICY "Admins can modify books" ON books FOR ALL 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Orders Policies
CREATE POLICY "Anyone can create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all orders" ON orders FOR SELECT 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));
CREATE POLICY "Admins can update orders" ON orders FOR UPDATE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));
CREATE POLICY "Admins can delete orders" ON orders FOR DELETE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Order Items Policies
CREATE POLICY "Anyone can create order items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all order items" ON order_items FOR SELECT 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));
CREATE POLICY "Admins can delete order items" ON order_items FOR DELETE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Storage Policies
DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view book covers" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage book covers" ON storage.objects;

CREATE POLICY "Anyone can upload payment proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');
CREATE POLICY "Admins can view payment proofs" ON storage.objects FOR SELECT 
  USING (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));
CREATE POLICY "Anyone can view book covers" ON storage.objects FOR SELECT USING (bucket_id = 'book-covers');
CREATE POLICY "Admins can manage book covers" ON storage.objects FOR ALL 
  USING (bucket_id = 'book-covers' AND auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- =========================================================================
-- DONE! Your database is now 100% clean, fresh, and fully test-isolated.
-- =========================================================================
