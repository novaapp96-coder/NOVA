import { ERR } from '../data/errors';
import { queryProducts } from '../core/logic';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type {
  Category,
  ID,
  Product,
  ProductQuery,
  ProductVariant,
  Review,
} from '../core/types';

/* ------------------------------------------------------------------ */
/* Supabase row shapes (snake_case) — see supabase/schema.sql          */
/* ------------------------------------------------------------------ */
interface SupabaseCategoryRow {
  id: string;
  name: string | null;
  icon: string | null;
  emoji: string | null;
  active: boolean | null;
  sort_order: number | null;
}

interface SupabaseProductRow {
  id: string;
  name: string | null;
  category_id: string | null;
  brand: string | null;
  price: number | string | null;
  old_price: number | string | null;
  description: string | null;
  images: string[] | null;
  stock: number | null;
  rating: number | string | null;
  reviews_count: number | null;
  featured: boolean | null;
  is_new: boolean | null;
  hidden: boolean | null;
  sold_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SupabaseVariantRow {
  id: string;
  product_id: string | null;
  type: 'size' | 'color' | null;
  value: string | null;
  stock: number | null;
  swatch: string | null;
}

/* ------------------------------------------------------------------ */
/* Row → domain adapters                                              */
/* ------------------------------------------------------------------ */
function categoryFromRow(row: SupabaseCategoryRow): Category {
  return {
    id: row.id,
    name: row.name ?? '',
    icon: row.icon ?? 'apps',
    emoji: row.emoji ?? '🛍️',
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

function variantFromRow(row: SupabaseVariantRow): ProductVariant {
  return {
    id: row.id,
    type: (row.type as 'size' | 'color') ?? 'size',
    value: row.value ?? '',
    stock: row.stock ?? 0,
    swatch: row.swatch ?? undefined,
  };
}

function productFromRow(row: SupabaseProductRow, variants: ProductVariant[]): Product {
  const now = new Date().toISOString();
  return {
    id: row.id,
    name: row.name ?? '',
    categoryId: row.category_id ?? '',
    brand: row.brand ?? undefined,
    price: Number(row.price ?? 0),
    oldPrice: row.old_price == null ? undefined : Number(row.old_price),
    description: row.description ?? '',
    images: row.images ?? [],
    variants,
    stock: row.stock ?? 0,
    rating: Number(row.rating ?? 0),
    reviewsCount: row.reviews_count ?? 0,
    featured: row.featured ?? false,
    isNew: row.is_new ?? false,
    hidden: row.hidden ?? false,
    soldCount: row.sold_count ?? 0,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
async function fetchVariantsForProducts(
  productIds: ID[],
): Promise<Map<ID, ProductVariant[]>> {
  const map = new Map<ID, ProductVariant[]>();
  if (productIds.length === 0) return map;

  const { data, error } = await supabase
    .from('product_variants')
    .select('id, product_id, type, value, stock, swatch')
    .in('product_id', productIds);

  // eslint-disable-next-line no-console
  console.log('[catalog] fetchVariantsForProducts:', {
    productIdsCount: productIds.length,
    rows: data?.length ?? 0,
    error: error ?? null,
  });
  if (error || !data) return map;
  for (const row of data as SupabaseVariantRow[]) {
    if (!row.product_id) continue;
    const list = map.get(row.product_id) ?? [];
    list.push(variantFromRow(row));
    map.set(row.product_id, list);
  }
  return map;
}

function compareCategorySort(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder;
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/** Catalog repository — backed by Supabase. */
export const catalogRepository = {
  async getCategories(): Promise<Category[]> {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.log('[catalog] getCategories: SKIPPED (supabase not configured)');
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, icon, emoji, active, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      // eslint-disable-next-line no-console
      console.log('[catalog] getCategories:', {
        rows: data?.length ?? 0,
        ids: (data ?? []).map((r) => r.id),
        error: error ?? null,
      });
      if (error || !data) return [];
      return (data as SupabaseCategoryRow[]).map(categoryFromRow).sort(compareCategorySort);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] getCategories threw:', e);
      return [];
    }
  },

  async getAllCategories(): Promise<Category[]> {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.log('[catalog] getAllCategories: SKIPPED (supabase not configured)');
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, icon, emoji, active, sort_order')
        .order('sort_order', { ascending: true });
      // eslint-disable-next-line no-console
      console.log('[catalog] getAllCategories:', {
        rows: data?.length ?? 0,
        error: error ?? null,
      });
      if (error || !data) return [];
      return (data as SupabaseCategoryRow[]).map(categoryFromRow).sort(compareCategorySort);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] getAllCategories threw:', e);
      return [];
    }
  },

  async getProducts(query: ProductQuery = {}): Promise<Product[]> {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.log('[catalog] getProducts: SKIPPED (supabase not configured)');
      return [];
    }
    try {
      let q = supabase
        .from('products')
        .select(
          'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
        )
        .eq('hidden', false);

      if (query.categoryId) q = q.eq('category_id', query.categoryId);
      if (query.featured) q = q.eq('featured', true);
      if (query.newOnly) q = q.eq('is_new', true);
      if (query.offersOnly) q = q.not('old_price', 'is', null);
      if (query.inStockOnly) q = q.gt('stock', 0);
      if (query.minPrice != null) q = q.gte('price', query.minPrice);
      if (query.maxPrice != null) q = q.lte('price', query.maxPrice);
      if (query.search) {
        const term = `%${query.search.replace(/[%_]/g, '')}%`;
        q = q.or(`name.ilike.${term},description.ilike.${term},brand.ilike.${term}`);
      }

      switch (query.sort) {
        case 'price_asc':
          q = q.order('price', { ascending: true });
          break;
        case 'price_desc':
          q = q.order('price', { ascending: false });
          break;
        case 'top_rated':
          q = q.order('rating', { ascending: false });
          break;
        case 'newest':
          q = q.order('created_at', { ascending: false });
          break;
        case 'best_selling':
        default:
          q = q
            .order('sold_count', { ascending: false })
            .order('created_at', { ascending: false });
      }

      const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 1000;
      const from = ((query.page ?? 1) - 1) * pageSize;
      q = q.range(from, from + pageSize - 1);

      const { data, error } = await q;
      // eslint-disable-next-line no-console
      console.log('[catalog] getProducts:', {
        query,
        rows: data?.length ?? 0,
        sample: (data ?? []).slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name,
          category_id: r.category_id,
          hidden: r.hidden,
        })),
        error: error ?? null,
      });
      if (error || !data) return [];

      const rows = data as SupabaseProductRow[];
      const variants = await fetchVariantsForProducts(rows.map((r) => r.id));
      const products = rows.map((r) => productFromRow(r, variants.get(r.id) ?? []));
      const result = queryProducts(products, query);
      // eslint-disable-next-line no-console
      console.log('[catalog] getProducts AFTER queryProducts:', {
        rawRows: rows.length,
        mappedProducts: products.length,
        afterFilter: result.length,
        categoryIdInQuery: query.categoryId ?? null,
      });
      return result;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] getProducts threw:', e);
      return [];
    }
  },

  async countProducts(query: ProductQuery = {}): Promise<number> {
    const list = await this.getProducts(query);
    return list.length;
  },

  async getProduct(id: ID): Promise<Product> {
    if (!isSupabaseConfigured) throw ERR.notFound('المنتج');
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
        )
        .eq('id', id)
        .maybeSingle();
      // eslint-disable-next-line no-console
      console.log('[catalog] getProduct:', { id, found: !!data, error: error ?? null });
      if (error || !data) throw ERR.notFound('المنتج');
      const variants = await fetchVariantsForProducts([id]);
      return productFromRow(data as SupabaseProductRow, variants.get(id) ?? []);
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      // eslint-disable-next-line no-console
      console.error('[catalog] getProduct threw:', e);
      throw ERR.notFound('المنتج');
    }
  },

  async getProductsByIds(ids: ID[]): Promise<Product[]> {
    if (!isSupabaseConfigured || ids.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[catalog] getProductsByIds: SKIPPED', {
        configured: isSupabaseConfigured,
        idsCount: ids.length,
      });
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, category_id, brand, price, old_price, description, images, stock, rating, reviews_count, featured, is_new, hidden, sold_count, created_at, updated_at',
        )
        .in('id', ids);
      // eslint-disable-next-line no-console
      console.log('[catalog] getProductsByIds:', {
        idsCount: ids.length,
        rows: data?.length ?? 0,
        error: error ?? null,
      });
      if (error || !data) return [];
      const rows = data as SupabaseProductRow[];
      const variants = await fetchVariantsForProducts(rows.map((r) => r.id));
      return rows.map((r) => productFromRow(r, variants.get(r.id) ?? []));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] getProductsByIds threw:', e);
      return [];
    }
  },

  async getReviews(productId: ID): Promise<Review[]> {
    if (!isSupabaseConfigured) return [];
    try {
      // Schema has no public.reviews table; reviews are aggregated on the
      // product. Return an empty list to keep the UI working.
      void productId;
      return [];
    } catch {
      return [];
    }
  },

  async addReview(
    productId: ID,
    user: { id: ID; name: string },
    rating: number,
    comment: string,
  ): Promise<Review[]> {
    if (!isSupabaseConfigured) throw ERR.network();
    const clean = Math.min(5, Math.max(1, Math.round(rating)));
    const text = comment.trim();
    if (!text) throw ERR.generic('يرجى كتابة رأيكِ في المنتج.');

    try {
      const { data: product, error: readError } = await supabase
        .from('products')
        .select('id, rating, reviews_count')
        .eq('id', productId)
        .maybeSingle();
      if (readError || !product) throw ERR.notFound('المنتج');

      const currentCount = product.reviews_count ?? 0;
      const currentRating = Number(product.rating ?? 0);
      const newCount = currentCount + 1;
      const newRating =
        Math.round(((currentRating * currentCount + clean) / newCount) * 10) / 10;

      const { error: updateError } = await supabase
        .from('products')
        .update({ reviews_count: newCount, rating: newRating })
        .eq('id', productId);
      if (updateError) throw ERR.server();

      void user;
      return [
        {
          id: `local-${Date.now()}`,
          productId,
          userId: user.id,
          userName: user.name,
          rating: clean,
          comment: text,
          createdAt: new Date().toISOString(),
        },
      ];
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      throw ERR.network();
    }
  },

  async getFavoriteIds(userId: ID): Promise<ID[]> {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.log('[catalog] getFavoriteIds: SKIPPED (supabase not configured)');
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('product_id')
        .eq('user_id', userId);
      // eslint-disable-next-line no-console
      console.log('[catalog] getFavoriteIds:', {
        userId,
        rows: data?.length ?? 0,
        error: error ?? null,
      });
      if (error || !data) return [];
      return (data as { product_id: string | null }[])
        .map((r) => r.product_id)
        .filter((id): id is string => !!id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] getFavoriteIds threw:', e);
      return [];
    }
  },

  async toggleFavorite(userId: ID, productId: ID): Promise<boolean> {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line no-console
      console.log('[catalog] toggleFavorite: SKIPPED (supabase not configured)');
      return false;
    }
    try {
      const { data: existing, error: readError } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

      // eslint-disable-next-line no-console
      console.log('[catalog] toggleFavorite read:', {
        userId,
        productId,
        existing: !!existing,
        readError: readError ?? null,
      });
      if (readError && readError.code !== 'PGRST116') return false;

      if (existing) {
        const { error: delError } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('product_id', productId);
        // eslint-disable-next-line no-console
        console.log('[catalog] toggleFavorite delete:', { delError: delError ?? null });
        return !delError;
      }

      const { error: insError } = await supabase
        .from('favorites')
        .insert({ user_id: userId, product_id: productId });
      // eslint-disable-next-line no-console
      console.log('[catalog] toggleFavorite insert:', { insError: insError ?? null });
      return !insError;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[catalog] toggleFavorite threw:', e);
      return false;
    }
  },
};
