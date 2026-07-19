let BOOKS = [];

// Initialize Supabase Client globally
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/**
 * Fetches all books from Supabase database and populates the global BOOKS array.
 */
async function fetchBooks() {
  try {
    const { data, error } = await supabaseClient
      .from('books')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw error;
    
    // Map db properties (image_url) to frontend property names (image)
    BOOKS = (data || []).map(book => ({
      ...book,
      image: book.image_url || book.image
    }));
    
    return BOOKS;
  } catch (err) {
    console.error('Error loading books from database:', err);
    // Return empty array on failure
    return [];
  }
}
