-- ============================================
-- SUPABASE SETUP - Run this in SQL Editor
-- ============================================

-- 1. Create Books Table
CREATE TABLE IF NOT EXISTS books (
  id serial PRIMARY KEY,
  title text NOT NULL,
  price integer NOT NULL,
  description text,
  type text, -- e.g., 'Softbound', 'Hardbound'
  pages integer,
  dimensions text,
  image_url text, -- URL to cover image
  stock_quantity integer NOT NULL DEFAULT 0,
  weight_grams integer, -- Weight in grams
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure weight_grams column exists if table already existed
ALTER TABLE books ADD COLUMN IF NOT EXISTS weight_grams integer;

-- 2. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  total_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'Payment Verification is Pending',
  payment_proof_url text,
  tracking_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  book_id integer REFERENCES books(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  price integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. Seed Initial Book Data (Safe to run multiple times)
INSERT INTO books (id, title, price, description, type, pages, dimensions, image_url, stock_quantity, weight_grams)
VALUES 
(1, 'When Good Fortune Arises', 300, 'Devotional literature exploring divine fortune and spiritual growth.', 'Softbound', NULL, NULL, NULL, 10, 611),
(2, 'Mathura meets Vrindavan', 200, 'Exquisite narrations of the meeting of Mathura and Vrindavan consciousness.', 'Softbound', NULL, NULL, NULL, 10, 381),
(3, 'Process of Inquiry', 200, 'An analytical and spiritual guide to the process of inquiry in bhakti.', 'Softbound', NULL, NULL, NULL, 10, 252),
(4, 'Worship of SriGuru', 150, 'Philosophical and practical explanations on the worship of the spiritual master.', 'Softbound', NULL, NULL, NULL, 10, 189),
(5, 'Gopal Jiu', 70, 'Glorification and pastimes of the beloved deity Sri Gopal Jiu.', 'Softbound', NULL, NULL, NULL, 10, 123),
(6, 'How to find Guru', 20, 'A concise guide for sincere seekers on finding a bona fide spiritual master.', 'Softbound', NULL, NULL, NULL, 10, 33),
(7, 'Auspicious Invocations', 20, 'Collected prayers and invocations for spiritual auspiciousness.', 'Softbound', NULL, NULL, NULL, 10, 33),
(8, 'After Disappearance of Sri Guru', 20, 'Important directives and guidance following the departure of the spiritual master.', 'Softbound', NULL, NULL, NULL, 10, 50),
(9, 'Three Logs of Wood', 20, 'Deep philosophical analogy on dedication and spiritual surrender.', 'Softbound', NULL, NULL, NULL, 10, 33),
(10, 'Formidable Foe', 25, 'Understanding and overcoming material conditioning and obstacles in devotion.', 'Softbound', NULL, NULL, NULL, 10, 43),
(11, 'Embankment of Separation', 120, 'Ecstatic feelings and teachings on the mood of separation (vipralambha-bhava).', 'Softbound', NULL, NULL, NULL, 10, NULL),
(12, 'Guru Tattva', 30, 'Deep scriptural truths regarding the spiritual master.', 'Softbound', NULL, NULL, NULL, 10, 62),
(13, 'Trinad Api Sunichena', 300, 'Exposition on the famous verse regarding humility, tolerance, and respect.', 'Softbound', NULL, NULL, NULL, 10, NULL),
(14, 'Shuddha Naam Bhajana', 100, 'The science of chanting the pure holy name of the Lord.', 'Softbound', NULL, NULL, NULL, 10, 244),
(15, 'Tattva Darshan', 100, 'Illuminating vision of absolute philosophical truths.', 'Softbound', NULL, NULL, NULL, 10, 287),
(16, 'Vaishnava Institutions', 20, 'Principles and structures of Vaishnava societies and associations.', 'Softbound', NULL, NULL, NULL, 10, 30),
(17, 'Guru Tattva (HH Haladhara Swami Maharaj)', 400, 'Scriptural conclusions on the guru-disciple relationship by HH Haladhara Swami.', 'Softbound', NULL, NULL, NULL, 10, 844)
ON CONFLICT (id) DO UPDATE SET 
  title = EXCLUDED.title,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  pages = EXCLUDED.pages,
  dimensions = EXCLUDED.dimensions,
  weight_grams = EXCLUDED.weight_grams;

-- Adjust the sequence generator to sync up with manually inserted IDs
SELECT setval(pg_get_serial_sequence('books', 'id'), coalesce(max(id), 1)) FROM books;


-- 5. Set up Storage Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;


-- 6. RLS Setup
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS "Anyone can view books" ON books;
DROP POLICY IF EXISTS "Admins can modify books" ON books;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Anyone can view orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON order_items;
DROP POLICY IF EXISTS "Anyone can view order items" ON order_items;
DROP POLICY IF EXISTS "Admins can view all order items" ON order_items;
DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view book covers" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage book covers" ON storage.objects;

-- Books Table Policies
CREATE POLICY "Anyone can view books" ON books FOR SELECT USING (true);
CREATE POLICY "Admins can modify books" ON books FOR ALL 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Orders Table Policies
CREATE POLICY "Anyone can create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all orders" ON orders FOR SELECT 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));
CREATE POLICY "Admins can update orders" ON orders FOR UPDATE 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Order Items Table Policies
CREATE POLICY "Anyone can create order items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all order items" ON order_items FOR SELECT 
  USING (auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

-- Storage Bucket Policies
CREATE POLICY "Anyone can upload payment proofs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');
CREATE POLICY "Admins can view payment proofs" ON storage.objects FOR SELECT 
  USING (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));

CREATE POLICY "Anyone can view book covers" ON storage.objects FOR SELECT USING (bucket_id = 'book-covers');
CREATE POLICY "Admins can manage book covers" ON storage.objects FOR ALL 
  USING (bucket_id = 'book-covers' AND auth.role() = 'authenticated' AND (lower(auth.jwt() ->> 'email') = 'admin1@srilagurudev.com'));


-- 7. Database Triggers for Stock Management
CREATE OR REPLACE FUNCTION decrement_book_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify if book exists and check stock
  IF NOT EXISTS (SELECT 1 FROM books WHERE id = NEW.book_id) THEN
    RAISE EXCEPTION 'Book with ID % does not exist', NEW.book_id;
  END IF;

  IF (SELECT stock_quantity FROM books WHERE id = NEW.book_id) < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock for book ID %', NEW.book_id;
  END IF;

  UPDATE books
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.book_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decrement_stock ON order_items;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION decrement_book_stock();

CREATE OR REPLACE FUNCTION restore_book_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE books
  SET stock_quantity = stock_quantity + OLD.quantity
  WHERE id = OLD.book_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restore_stock ON order_items;
CREATE TRIGGER trg_restore_stock
  AFTER DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION restore_book_stock();


-- 8. Secure RPC Function for Customer Order Tracking
CREATE OR REPLACE FUNCTION get_customer_orders_by_phone(customer_phone text)
RETURNS TABLE (
  id uuid,
  customer_name text,
  phone text,
  address text,
  total_amount integer,
  status text,
  tracking_number text,
  created_at timestamptz,
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
    o.created_at,
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
  GROUP BY o.id
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_customer_orders_by_phone(text) TO anon, authenticated;

-- 9. Secure Atomic Transaction RPC to Create Order and Order Items (checks/decrements stock)
CREATE OR REPLACE FUNCTION create_order_with_items(
  cust_name text,
  cust_phone text,
  cust_address text,
  total_amt integer,
  proof_url text,
  items jsonb
) RETURNS uuid SECURITY DEFINER AS $$
DECLARE
  new_order_id uuid;
  item_rec json;
BEGIN
  -- 1. Insert the order
  INSERT INTO orders (customer_name, phone, address, total_amount, status, payment_proof_url)
  VALUES (cust_name, cust_phone, cust_address, total_amt, 'Payment Verification is Pending', proof_url)
  RETURNING id INTO new_order_id;

  -- 2. Insert items and check/decrement stock
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

GRANT EXECUTE ON FUNCTION create_order_with_items(text, text, text, integer, text, jsonb) TO anon, authenticated;
