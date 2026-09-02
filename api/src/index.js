import { createClient } from '@libsql/client/web';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const json = value => JSON.stringify(value ?? null);

function db(env) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Turso environment is not configured');
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
}
async function query(env, sql, args = {}) { return (await db(env).execute({ sql, args })).rows; }
function requireAdmin(c) {
  if (c.req.header('x-admin-key') !== c.env.ADMIN_API_KEY) throw new Error('Unauthorized');
}

app.use('*', async (c, next) => { await cors({ origin: c.env.ALLOWED_ORIGIN || '*', allowHeaders: ['Content-Type', 'x-admin-key'], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] })(c, next); });
app.get('/health', c => c.json({ ok: true, service: 'flashdeal-api' }));
app.get('/catalog', async c => c.json(await query(c.env, `SELECT p.*, b.name AS brand_name, b.logo_url, c.name AS category_name, c.slug AS category_slug, (SELECT image_url FROM product_images i WHERE i.product_id=p.id ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS image_url FROM products p JOIN brands b ON b.id=p.brand_id JOIN categories c ON c.id=p.category_id WHERE p.is_active=1 ORDER BY p.created_at DESC`)));
app.get('/categories', async c => c.json(await query(c.env, 'SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order')));
app.get('/brands', async c => c.json(await query(c.env, 'SELECT * FROM brands WHERE is_active=1 ORDER BY name')));
app.get('/flash-deals', async c => c.json(await query(c.env, "SELECT f.*, p.name, p.slug, p.stock_quantity, (SELECT image_url FROM product_images i WHERE i.product_id=p.id ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS image_url FROM flash_deals f JOIN products p ON p.id=f.product_id WHERE f.is_active=1 AND datetime('now') BETWEEN f.start_at AND f.end_at")));
app.get('/orders/:userId', async c => c.json(await query(c.env, 'SELECT o.*, d.tracking_number, d.courier_name, d.current_status, d.current_location FROM orders o LEFT JOIN delivery_tracking d ON d.order_id=o.id WHERE o.user_id=:userId ORDER BY o.created_at DESC', { ':userId': c.req.param('userId') })));
const adminTables = ['users','customer_profiles','addresses','brands','categories','tags','products','product_tags','laptop_specs','product_images','product_videos','product_variants','discounts','coupons','coupon_customers','flash_deals','cart_items','orders','order_items','order_status_history','delivery_tracking','wishlists','reviews','questions_answers','price_alerts','back_in_stock_alerts','inventory_transactions','banners','audit_logs','marketing_popups'];
app.get('/admin/tables', async c => { requireAdmin(c); const rows = await Promise.all(adminTables.map(async table => ({ table, count: (await query(c.env, `SELECT COUNT(*) AS count FROM ${table}`))[0].count }))); return c.json(rows); });
app.get('/admin/tables/:table', async c => { requireAdmin(c); const table = c.req.param('table'); if (!adminTables.includes(table)) return c.json({ error: 'Table not available' }, 404); return c.json(await query(c.env, `SELECT * FROM ${table} LIMIT 100`)); });
app.post('/admin/catalog', async c => { requireAdmin(c); const body = await c.req.json(); const productId = id('prod'); const timestamp = now(); await db(c.env).batch([{ sql: 'INSERT INTO products (id,sku,slug,name,short_description,description,brand_id,category_id,model_number,price,mrp,selling_price,cost_price,manufacturer,created_at,updated_at) VALUES (:id,:sku,:slug,:name,:short,:description,:brand,:category,:model,:price,:mrp,:selling,:cost,:manufacturer,:created,:updated)', args: { ':id': productId, ':sku': body.sku, ':slug': body.slug, ':name': body.name, ':short': body.short_description || body.name, ':description': body.description || body.name, ':brand': body.brand_id, ':category': body.category_id, ':model': body.model_number || body.sku, ':price': body.price, ':mrp': body.mrp, ':selling': body.selling_price || body.price, ':cost': body.cost_price || body.price, ':manufacturer': body.manufacturer || body.name, ':created': timestamp, ':updated': timestamp } }]); return c.json({ id: productId }, 201); });
app.post('/admin/catalog/:id/stock', async c => { requireAdmin(c); const body = await c.req.json(); const timestamp = now(); const client = db(c.env); const rows = await client.execute({ sql: 'SELECT stock_quantity FROM products WHERE id=:id', args: { ':id': c.req.param('id') } }); if (!rows.rows.length) return c.json({ error: 'Product not found' }, 404); const previous = rows.rows[0].stock_quantity; await client.batch([{ sql: 'UPDATE products SET stock_quantity=:stock, updated_at=:updated WHERE id=:id', args: { ':stock': body.stock_quantity, ':updated': timestamp, ':id': c.req.param('id') } }, { sql: 'INSERT INTO inventory_transactions (id,product_id,type,quantity,previous_stock,new_stock,reference,created_at) VALUES (:tx,:product,:type,:quantity,:previous,:new,:reference,:created)', args: { ':tx': id('inv'), ':product': c.req.param('id'), ':type': 'ADJUSTMENT', ':quantity': body.stock_quantity - previous, ':previous': previous, ':new': body.stock_quantity, ':reference': 'admin-api', ':created': timestamp } }]); return c.json({ ok: true }); });
app.onError((error, c) => c.json({ error: error.message }, error.message === 'Unauthorized' ? 401 : 500));
export default app;
