-- =========================================================================
-- DATABASE MIGRATION: Testing Framework, Test Data Isolation & Security
-- =========================================================================
-- Run this migration in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql

-- 1. Add `is_test` column to `orders` table (safe to run multiple times)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Create an index to quickly filter test vs real orders
CREATE INDEX IF NOT EXISTS idx_orders_is_test ON orders(is_test);

-- 2. Update stock decrement trigger to SKIP inventory reduction for test orders
CREATE OR REPLACE FUNCTION decrement_book_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_is_test boolean := false;
BEGIN
  -- Verify if parent order is flagged as a test order
  SELECT coalesce(is_test, false) INTO v_is_test 
  FROM orders 
  WHERE id = NEW.order_id;

  -- CRITICAL TEST ISOLATION:
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

  -- Decrement real inventory for production orders
  UPDATE books
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.book_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Update stock restoration trigger to SKIP inventory addition when test orders are deleted
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

-- 4. Re-create atomic order creation RPC supporting the `is_test` flag with Database Security Gate
-- Dropping old signatures first to allow signature overload upgrade
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
  -- Prevent unauthorized callers or hackers from spoofing test orders.
  -- Only authenticated admins or callers with the valid test secret can create test orders.
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

  -- 2. Insert items (triggers will check is_test and handle inventory accordingly)
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

-- 5. Secure customer order tracking RPC: HIDE test orders from public customer lookups
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
    -- SECURITY & PRIVACY: Real customer tracking never returns internal test orders
    AND coalesce(o.is_test, false) = false
  GROUP BY o.id
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_customer_orders_by_phone(text) TO anon, authenticated;

-- 6. Add DELETE RLS Policies for authenticated Admin
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;
CREATE POLICY "Admins can delete orders" ON orders FOR DELETE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

DROP POLICY IF EXISTS "Admins can delete order items" ON order_items;
CREATE POLICY "Admins can delete order items" ON order_items FOR DELETE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- 7. Add RPC Function to Purge All Test Orders (Authenticated Admin Only)
DROP FUNCTION IF EXISTS delete_all_test_orders();

CREATE OR REPLACE FUNCTION delete_all_test_orders()
RETURNS integer SECURITY DEFINER AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Verify admin authorization
  IF auth.role() <> 'authenticated' OR lower(auth.jwt() ->> 'email') <> 'admin1@srilagurudev.com' THEN
    RAISE EXCEPTION 'Access Denied: Only authenticated administrators can purge test orders';
  END IF;

  DELETE FROM orders WHERE is_test = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION delete_all_test_orders() TO authenticated;
