# Flash Deal

A GitHub Pages-friendly storefront prototype built from the `retech.db` commerce schema.

## Included

- Responsive Flash Deal storefront for desktop and mobile browsers
- Installable PWA manifest and service worker
- Real catalog values from the database: 12 products, 8 brands, 7 categories, product images, hero banners, flash-deal merchandising
- Search, category filtering, wishlist, persistent cart, checkout entry state, and install prompt
- Admin dashboard entry at `admin.html`

## Important architecture boundary

GitHub Pages serves static files only. It cannot safely:

- connect directly to Turso with a private token
- hash/check admin passwords server-side
- create orders, update inventory, or protect admin CRUD routes

For production, deploy a small API separately (Cloudflare Worker, Vercel Function, Netlify Function, or a dedicated Node service) using `@libsql/client`. The API should own authentication, authorization, validation, coupon calculations, checkout/order transactions, and audit logging. The browser should call that API over HTTPS.

Do not put a Turso URL/token or admin password in `app.js`, static HTML, or GitHub Pages secrets. The requested admin credentials must be replaced with an environment-backed password hash and session/token flow in the API.

## GitHub Pages deployment

1. Put this folder in a GitHub repository.
2. In **Settings > Pages**, choose **GitHub Actions** or deploy the root folder as the site source.
3. Add a custom domain in the Pages settings and create the provided DNS `CNAME` record at the domain registrar.
4. Keep `retech.db` out of the public site if it contains customer data. Import or sync the catalog into Turso instead.
5. Deploy `api/`, then set its HTTPS URL in [api-config.js](api-config.js).

The API scaffold includes catalog reads, flash-deal reads, order lookup, protected product creation, and protected inventory adjustment. Extend the same transaction pattern for signup/login, cart, coupons, checkout, reviews, and delivery updates before launch.

## Turso API mapping

The existing schema already supports the requested operations through these tables:

- Catalog: `products`, `brands`, `categories`, `tags`, `product_tags`, `product_images`, `product_videos`, `product_variants`, `laptop_specs`
- Promotions: `flash_deals`, `discounts`, `coupons`, `coupon_customers`, `banners`, `marketing_popups`
- Customer: `users`, `customer_profiles`, `addresses`, `wishlists`, `price_alerts`, `back_in_stock_alerts`, `reviews`, `questions_answers`
- Purchase: `cart_items`, `orders`, `order_items`, `order_status_history`, `delivery_tracking`
- Operations: `inventory_transactions`, `audit_logs`

The database currently contains no orders, so order tracking will remain empty until the API and checkout transaction are connected.

## Local preview

Run `python -m http.server 4173` from this folder and open `http://localhost:4173/`.
