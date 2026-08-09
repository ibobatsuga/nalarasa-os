import type { CatalogItem } from '../lib/store';

/** Fallback menu: lets a brand-new till sell before it has ever reached the server. */
export const FALLBACK_MENU: CatalogItem[] = [
  { code: 'MENU-NASI', name: 'Nasi Goreng Spesial', category: 'Makanan', price: 45_000 },
  { code: 'MENU-AYAM', name: 'Ayam Bakar Madu', category: 'Makanan', price: 65_000 },
  { code: 'MENU-SATE', name: 'Sate Ayam (10 tusuk)', category: 'Makanan', price: 45_000 },
  { code: 'MENU-SOTO', name: 'Soto Ayam Kampung', category: 'Makanan', price: 38_000 },
  { code: 'MENU-GURAME', name: 'Gurame Bakar', category: 'Makanan', price: 95_000 },
  { code: 'MENU-CAPCAY', name: 'Capcay Seafood', category: 'Makanan', price: 52_000 },
  { code: 'MENU-NASGOR-K', name: 'Nasi Goreng Kampung', category: 'Makanan', price: 38_000 },
  { code: 'MENU-MIEGOR', name: 'Mie Goreng Jawa', category: 'Makanan', price: 36_000 },

  { code: 'MENU-ESTEH', name: 'Es Teh Manis', category: 'Minuman', price: 8_000 },
  { code: 'MENU-ESJERUK', name: 'Es Jeruk Peras', category: 'Minuman', price: 15_000 },
  { code: 'MENU-KOPI', name: 'Kopi Tubruk', category: 'Minuman', price: 12_000 },
  { code: 'MENU-LATTE', name: 'Es Kopi Susu', category: 'Minuman', price: 25_000 },
  { code: 'MENU-JUS-ALP', name: 'Jus Alpukat', category: 'Minuman', price: 28_000 },
  { code: 'MENU-AIR', name: 'Air Mineral', category: 'Minuman', price: 6_000 },

  { code: 'MENU-PISANG', name: 'Pisang Goreng Keju', category: 'Dessert', price: 28_000 },
  { code: 'MENU-PUDING', name: 'Puding Coklat', category: 'Dessert', price: 22_000 },
  { code: 'MENU-ESKRIM', name: 'Es Krim Vanila', category: 'Dessert', price: 18_000 },

  { code: 'MENU-KERUPUK', name: 'Kerupuk Udang', category: 'Tambahan', price: 8_000 },
  { code: 'MENU-NASI-P', name: 'Nasi Putih', category: 'Tambahan', price: 7_000 },
  { code: 'MENU-SAMBAL', name: 'Sambal Ekstra', category: 'Tambahan', price: 5_000 },
];
