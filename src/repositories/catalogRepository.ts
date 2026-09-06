import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { queryProducts } from '../core/logic';
import { uid } from '../core/security';
import type { Category, ID, Product, ProductQuery, Review } from '../core/types';

/** Catalog repository — categories, products, reviews, favorites. */
export const catalogRepository = {
  async getCategories(): Promise<Category[]> {
    await latency(180);
    const db = await localDatabase.read();
    return db.categories
      .filter((c) => c.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async getAllCategories(): Promise<Category[]> {
    await latency(120);
    const db = await localDatabase.read();
    return [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async getProducts(query: ProductQuery = {}): Promise<Product[]> {
    await latency(260);
    const db = await localDatabase.read();
    return queryProducts(db.products, query);
  },

  async countProducts(query: ProductQuery = {}): Promise<number> {
    const db = await localDatabase.read();
    return queryProducts(db.products, { ...query, page: 1, pageSize: undefined }).length;
  },

  async getProduct(id: ID): Promise<Product> {
    await latency(220);
    const db = await localDatabase.read();
    const product = db.products.find((p) => p.id === id);
    if (!product) throw ERR.notFound('المنتج');
    return product;
  },

  async getProductsByIds(ids: ID[]): Promise<Product[]> {
    await latency(120);
    const db = await localDatabase.read();
    return db.products.filter((p) => ids.includes(p.id));
  },

  async getReviews(productId: ID): Promise<Review[]> {
    await latency(160);
    const db = await localDatabase.read();
    return db.reviews
      .filter((r) => r.productId === productId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async addReview(
    productId: ID,
    user: { id: ID; name: string },
    rating: number,
    comment: string,
  ): Promise<Review[]> {
    const clean = Math.min(5, Math.max(1, Math.round(rating)));
    const text = comment.trim();
    if (!text) throw ERR.generic('يرجى كتابة رأيكِ في المنتج.');
    await latency(280);
    let reviews: Review[] = [];
    await localDatabase.mutate((db) => {
      const product = db.products.find((p) => p.id === productId);
      if (!product) throw ERR.notFound('المنتج');
      const review: Review = {
        id: uid(),
        productId,
        userId: user.id,
        userName: user.name,
        rating: clean,
        comment: text,
        createdAt: new Date().toISOString(),
      };
      db.reviews.unshift(review);
      const mine = db.reviews.filter((r) => r.productId === productId);
      product.reviewsCount = mine.length;
      product.rating =
        Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10;
      reviews = mine;
    });
    return reviews;
  },

  async getFavoriteIds(userId: ID): Promise<ID[]> {
    await latency(140);
    const db = await localDatabase.read();
    return db.favorites.filter((f) => f.userId === userId).map((f) => f.productId);
  },

  async toggleFavorite(userId: ID, productId: ID): Promise<boolean> {
    await latency(160);
    let isNowFavorite = false;
    await localDatabase.mutate((db) => {
      const existing = db.favorites.find((f) => f.userId === userId && f.productId === productId);
      if (existing) {
        db.favorites = db.favorites.filter((f) => f !== existing);
      } else {
        db.favorites.push({ id: uid(), userId, productId, createdAt: new Date().toISOString() });
        isNowFavorite = true;
      }
    });
    return isNowFavorite;
  },
};
