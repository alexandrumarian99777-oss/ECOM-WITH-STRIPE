let stripe;
async function init() {
  // get publishable key from server
  const cfg = await fetch('/config').then(r => r.json());
  stripe = Stripe(cfg.publishableKey);

  await loadProducts();
  await refreshCart();

  document.getElementById('viewCartBtn').addEventListener('click', () => toggleCart(true));
  document.getElementById('closeCartBtn').addEventListener('click', () => toggleCart(false));
  document.getElementById('checkoutBtn').addEventListener('click', startCheckout);
  document.getElementById('clearCartBtn').addEventListener('click', clearCart);
}

function toggleCart(show) {
  document.getElementById('cartDrawer').classList.toggle('hidden', !show);
}

async function loadProducts() {
  const products = await fetch('/api/products').then(r => r.json());
  const root = document.getElementById('products');
  root.innerHTML = '';
  products.forEach(p => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <img src="${p.image}" alt="${p.name}" />
      <h3>${p.name}</h3>
      <p>${p.description || ''}</p>
      <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center">
        <strong>$${(p.price/100).toFixed(2)}</strong>
        <button class="btn" data-id="${p.id}">Add to cart</button>
      </div>
    `;
    root.appendChild(el);
    el.querySelector('button').addEventListener('click', () => addToCart(p.id));
  });
}

async function addToCart(id, qty = 1) {
  await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, qty })
  });
  await refreshCart();
  toggleCart(true);
}

async function refreshCart() {
  const cart = await fetch('/api/cart').then(r => r.json());
  const itemsEl = document.getElementById('cartItems');
  itemsEl.innerHTML = '';
  let total = 0;
  let count = 0;
  cart.forEach(item => {
    count += item.qty;
    total += item.qty * item.price;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <img src="${item.image}" />
      <div style="flex:1">
        <div><strong>${item.name}</strong></div>
        <div>$${(item.price/100).toFixed(2)} x <input type="number" min="0" value="${item.qty}" style="width:60px" data-id="${item.id}" /></div>
      </div>
      <button data-id="${item.id}" class="muted">Remove</button>
    `;
    itemsEl.appendChild(div);

    div.querySelector('input').addEventListener('change', async (e) => {
      const newQty = Number(e.target.value || 0);
      await fetch('/api/cart/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, qty: newQty })
      });
      await refreshCart();
    });

    div.querySelector('button').addEventListener('click', async () => {
      await fetch('/api/cart/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
      await refreshCart();
    });
  });

  document.getElementById('cart-count').textContent = count;
  document.getElementById('cartTotal').textContent = (total/100).toFixed(2);
  if (cart.length === 0) {
    itemsEl.innerHTML = '<p>Your cart is empty.</p>';
  }
}

async function startCheckout() {
  // call backend to create checkout session
  const res = await fetch('/api/checkout', { method: 'POST' }).then(r => r.json());
  if (res.error) {
    alert(res.error || 'Failed to start checkout');
    return;
  }
  const sessionId = res.sessionId;
  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    alert(error.message || 'Checkout redirect failed');
  }
}

async function clearCart() {
  await fetch('/api/cart/clear', { method: 'POST' });
  await refreshCart();
}

// init
init().catch(err => {
  console.error(err);
  alert('Failed to initialize shop. Check console for details.');
});
