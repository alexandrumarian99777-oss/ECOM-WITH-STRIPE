require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Stripe = require('stripe');
const path = require('path');
const cors = require('cors');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 5000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'change_this',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    // secure: true, // enable in production (requires HTTPS)
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Simple in-memory product catalog (replace with DB in production)
const PRODUCTS = [
  { id: 'tshirt-001', name: 'Classic Tee', description: 'Unisex cotton tee', price: 1999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Classic+Tee' },
  { id: 'hoodie-002', name: 'Comfy Hoodie', description: 'Fleece hoodie', price: 4999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Comfy+Hoodie' },
  { id: 'jeans-003', name: 'Slim Jeans', description: 'Stretch denim', price: 5999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Slim+Jeans' }
];

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper - ensure cart exists on session
function ensureCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

function findProduct(id) {
  return PRODUCTS.find(p => p.id === id);
}

// API: list products
app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

// API: get cart
app.get('/api/cart', (req, res) => {
  const cart = ensureCart(req);
  res.json(cart);
});

// API: add item to cart { id, qty }
app.post('/api/cart', (req, res) => {
  const { id, qty = 1 } = req.body;
  const product = findProduct(id);
  if (!product) return res.status(400).json({ error: 'Invalid product id' });

  const cart = ensureCart(req);
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty = Math.max(1, existing.qty + Number(qty));
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, currency: product.currency, image: product.image, qty: Number(qty) });
  }

  req.session.save(err => {
    if (err) console.error('Session save error', err);
    res.json(cart);
  });
});

// API: update quantity { id, qty }
app.post('/api/cart/update', (req, res) => {
  const { id, qty } = req.body;
  const cart = ensureCart(req);
  const item = cart.find(i => i.id === id);
  if (!item) return res.status(400).json({ error: 'Item not in cart' });
  item.qty = Math.max(0, Number(qty));
  // remove if qty 0
  req.session.cart = cart.filter(i => i.qty > 0);

  req.session.save(err => {
    if (err) console.error('Session save error', err);
    res.json(req.session.cart);
  });
});

// API: remove item { id }
app.post('/api/cart/remove', (req, res) => {
  const { id } = req.body;
  let cart = ensureCart(req);
  cart = cart.filter(i => i.id !== id);
  req.session.cart = cart;

  req.session.save(err => {
    if (err) console.error('Session save error', err);
    res.json(cart);
  });
});

// API: clear cart
app.post('/api/cart/clear', (req, res) => {
  req.session.cart = [];
  req.session.save(err => {
    if (err) console.error('Session save error', err);
    res.json({ ok: true });
  });
});

// API: return publishable key for client initialization
app.get('/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

// API: create Stripe Checkout session from current cart
app.post('/api/checkout', async (req, res) => {
  const cart = ensureCart(req);
  if (!cart || cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  // Build line items
  const line_items = cart.map(item => ({
    price_data: {
      currency: item.currency || 'usd',
      product_data: {
        name: item.name,
        images: item.image ? [item.image] : []
      },
      unit_amount: item.price // price in cents
    },
    quantity: item.qty
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${DOMAIN}/success.html`,
      cancel_url: `${DOMAIN}/cancel.html`
    });

    // Optionally, you may keep cart until success page clears it
    res.json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Keep server running
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
