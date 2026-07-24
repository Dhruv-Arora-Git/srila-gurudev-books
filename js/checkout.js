async function submitOrder(event) {
  event.preventDefault();

  const cart = getCart();
  if (cart.length === 0) {
    showAlert('Cart Empty', 'Your cart is empty!', 'warning');
    return;
  }

  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const street = document.getElementById('customer-street').value.trim();
  const city = document.getElementById('customer-city').value.trim();
  const state = document.getElementById('customer-state').value.trim();
  const pincode = document.getElementById('customer-pincode').value.trim();
  const paymentProof = document.getElementById('payment-proof').files[0];

  if (!name || !phone || !street || !city || !state || !pincode) {
    showAlert('Missing Details', 'Please fill in all delivery details.', 'warning');
    return;
  }

  // Combine into a single serialized address for the database column
  const address = `${street} | ${city}, ${state} | ${pincode}`;

  if (!paymentProof) {
    showAlert('Payment Proof Required', 'Please upload your UPI payment screenshot proof.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('submit-order-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  try {
    const fileExt = paymentProof.name.split('.').pop();
    const fileName = `proof-${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('payment-proofs')
      .upload(fileName, paymentProof);

    if (uploadError) throw uploadError;

    const total = getCartTotal() + CONFIG.DELIVERY_CHARGE;

    // Prepare items array for the RPC call
    const items = cart.map(item => {
      const book = BOOKS.find(b => b.id === item.bookId);
      return {
        book_id: item.bookId,
        quantity: item.quantity,
        price: book.price
      };
    });

    // Call the database transaction function
    const { data: orderId, error: orderError } = await supabaseClient
      .rpc('create_order_with_items', {
        cust_name: name,
        cust_phone: phone,
        cust_address: address,
        total_amt: total,
        proof_url: fileName,
        items: items
      });

    if (orderError) {
      // Handle insufficient stock custom database error
      if (orderError.message && orderError.message.includes('Insufficient stock')) {
        showAlert(
          'Out of Stock',
          'Sorry! One or more books in your cart became out of stock while you were checking out. Please return to your cart and update your quantities.',
          'danger'
        );
        
        // Clean up the uploaded payment proof since order failed
        await supabaseClient.storage
          .from('payment-proofs')
          .remove([fileName]);
      } else {
        showAlert('Order Failed', 'Error placing order: ' + orderError.message, 'danger');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place Order';
      return;
    }

    // Save phone number for automatic loading on tracking page
    localStorage.setItem('customer_phone', phone);

    clearCart();
    showToast('Order placed successfully!', 'success');
    setTimeout(() => {
      window.location.href = 'track.html';
    }, 1500);

  } catch (error) {
    console.error('Order error:', error);
    showAlert('Order Failed', 'Error placing order. Please try again.', 'danger');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
  }
}
