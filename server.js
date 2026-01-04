require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Stripe = require('stripe');
const path = require('path');
const cors = require('cors');

// HARD FAIL IF STRIPE KEYS ARE MISSING
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
  console.error('❌ Missing Stripe keys in .env');
  process.exit(1);
}

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 8000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'change_this',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(
  session({
    secret: 'dev-secret',
    resave: false,
    saveUninitialized: true
  })
);

// PRODUCTS
const PRODUCTS = [
  { id: 'tshirt-001', name: 'Classic Tee', price: 1999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Classic+Tee' },
  { id: 'hoodie-002', name: 'Comfy Hoodie', price: 4999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Comfy+Hoodie' },
  { id: 'jeans-003', name: 'Slim Jeans', price: 5999, currency: 'usd', image: 'https://via.placeholder.com/400?text=Slim+Jeans' }
];

// STATIC FRONTEND
app.use(express.static(path.join(__dirname, 'public')));

// HELPERS
function ensureCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

// ROUTES
app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

app.get('/api/cart', (req, res) => {
  res.json(ensureCart(req));
});

app.post('/api/cart', (req, res) => {
  const { id, qty = 1 } = req.body;
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return res.status(400).json({ error: 'Invalid product' });

  const cart = ensureCart(req);
  const existing = cart.find(i => i.id === id);

  if (existing) existing.qty += qty;
  else cart.push({ ...product, qty });

  res.json(cart);
});

app.post('/api/cart/remove', (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  const cart = ensureCart(req);

  const item = cart.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  // decrement quantity
  item.qty -= 1;

  // remove item completely if qty <= 0
  if (item.qty <= 0) {
    req.session.cart = cart.filter(i => i.id !== id);
  }

  res.json(req.session.cart);
});

// STRIPE CONFIG
app.get('/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});
app.post('/api/cart/remove', (req, res) => {
  console.log('REMOVE BODY:', req.body);

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  if (!req.session.cart) {
    req.session.cart = [];
  }

  req.session.cart = req.session.cart.filter(item => item.id !== id);

  res.json({ success: true });
});
// STRIPE CHECKOUT
app.post('/api/checkout', async (req, res) => {
  const cart = ensureCart(req);
  if (!cart.length) return res.status(400).json({ error: 'Cart empty' });

  const line_items = cart.map(i => ({
    price_data: {
      currency: i.currency,
      product_data: { name: i.name, images: [i.image] },
      unit_amount: i.price
    },
    quantity: i.qty
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items,
    success_url: `${DOMAIN}/success.html`,
    cancel_url: `${DOMAIN}/cancel.html`
  });

  res.json({ sessionId: session.id });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
