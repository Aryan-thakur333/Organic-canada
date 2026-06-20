const WISHLIST_KEY = 'eatsie_wishlist';

export const wishlistService = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
    } catch {
      return [];
    }
  },

  add: (product) => {
    const list = wishlistService.get();
    if (!list.find(p => p.id === product.id)) {
      list.push(product);
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
    }
    return list;
  },

  remove: (productId) => {
    const list = wishlistService.get().filter(p => p.id !== productId);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
    return list;
  },

  clear: () => {
    localStorage.removeItem(WISHLIST_KEY);
  }
};
