// Importaciones necesarias
import {
  onValue, // escucha cambios en tiempo real
  ref, // referencia a una ruta en la base de datos
  set // establece datos en una ruta
} from 'firebase/database';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid'; // para generar IDs únicos
import { db } from '../firebase'; // tu configuración de Firebase

// Definición de tipos de datos

// Categoría de productos
export interface Category {
  id: string;
  name: string;
  description: string;
}

// Producto en inventario
export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  sku: string;
  minStock: number;
  image: string;
  price: number;
  barcode?: string;
}

// Transacción (entrada o salida de productos)
export interface InventoryTransaction {
  id: string;
  productId: string;
  type: 'entry' | 'exit'; // tipo de movimiento
  quantity: number;
  unitCost: number;
  date: string;
  notes: string;
}

// Tipos de métodos de valoración de inventario
export type InventoryMethod = 'UEPS' | 'PEPS' | 'weighted';

// Interfaz del contexto para usar en toda la app
interface InventoryContextType {
  categories: Category[];
  products: Product[];
  transactions: InventoryTransaction[];

  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;

  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;

  addTransaction: (transaction: Omit<InventoryTransaction, 'id'>) => void;

  getProductStock: (productId: string) => number;
  getCategoryStock: (categoryId: string) => { productId: string; stock: number }[];
  getLowStockProducts: () => Product[];

  getProductTransactions: (productId: string, startDate: string, endDate: string) => InventoryTransaction[];
  calculateInventoryCost: (
    productId: string,
    method: InventoryMethod,
    startDate: string,
    endDate: string
  ) => {
    entries: InventoryTransaction[];
    exits: InventoryTransaction[];
    remainingStock: number;
    totalCost: number;
    averageCost: number;
  };
}

// Creación del contexto de inventario
const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

// Proveedor del contexto que envuelve a la app
export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Estados locales para almacenar datos
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  // Sincronización en tiempo real de categorías desde Firebase
  useEffect(() => {
    const categoriesRef = ref(db, 'categories');
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        setCategories(data.filter(Boolean)); // elimina nulls
      } else if (data) {
        setCategories(Object.values(data));
      } else {
        setCategories([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sincronización de productos
  useEffect(() => {
    const productsRef = ref(db, 'products');
    const unsubscribe = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        setProducts(data.filter(Boolean));
      } else if (data) {
        setProducts(Object.values(data));
      } else {
        setProducts([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sincronización de transacciones
  useEffect(() => {
    const transactionsRef = ref(db, 'transactions');
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        setTransactions(data.filter(Boolean));
      } else if (data) {
        setTransactions(Object.values(data));
      } else {
        setTransactions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Agregar una nueva categoría
  const addCategory = (category: Omit<Category, 'id'>) => {
    const id = uuidv4(); // genera un id único
    const newCategory = { ...category, id };
    const newCategories = [...categories, newCategory];
    set(ref(db, 'categories'), newCategories); // guarda en Firebase
  };

  // Actualizar una categoría existente
  const updateCategory = (category: Category) => {
    const idx = categories.findIndex(c => c.id === category.id);
    if (idx === -1) return;
    const newCategories = [...categories];
    newCategories[idx] = category;
    set(ref(db, 'categories'), newCategories);
  };

  // Eliminar una categoría (solo si no hay productos que la usen)
  const deleteCategory = (id: string) => {
    if (products.some((p) => p.categoryId === id)) {
      throw new Error('Cannot delete category that is in use by products');
    }
    const newCategories = categories.filter(c => c.id !== id);
    set(ref(db, 'categories'), newCategories);
  };

  // Agregar un nuevo producto
  const addProduct = (product: Omit<Product, 'id'>) => {
    const id = product.sku || uuidv4(); // usa SKU como ID si existe
    const newProduct = { ...product, id };
    const newProducts = [...products, newProduct];
    set(ref(db, 'products'), newProducts);
  };

  // Actualizar un producto
  const updateProduct = (product: Product) => {
    const idx = products.findIndex(p => p.id === product.id);
    if (idx === -1) return;
    const newProducts = [...products];
    newProducts[idx] = product;
    set(ref(db, 'products'), newProducts);
  };

  // Eliminar producto (si no tiene transacciones)
  const deleteProduct = (id: string) => {
    if (transactions.some((t) => t.productId === id)) {
      throw new Error('Cannot delete product that has transactions');
    }
    const newProducts = products.filter(p => p.id !== id);
    set(ref(db, 'products'), newProducts);
  };

  // Agregar una transacción (entrada o salida de stock)
  const addTransaction = (transaction: Omit<InventoryTransaction, 'id'>) => {
    // Validar que haya stock suficiente si es salida
    if (transaction.type === 'exit') {
      const currentStock = getProductStock(transaction.productId);
      if (currentStock < transaction.quantity) {
        throw new Error('Not enough stock for this transaction');
      }
    }

    const id = uuidv4();
    const newTransaction = { ...transaction, id };
    const newTransactions = [...transactions, newTransaction];
    set(ref(db, 'transactions'), newTransactions);
  };

  // Calcular el stock de un producto específico
  const getProductStock = (productId: string): number => {
    const productTransactions = transactions.filter((t) => t.productId === productId);
    return productTransactions.reduce((stock, transaction) => {
      return transaction.type === 'entry'
        ? stock + transaction.quantity
        : stock - transaction.quantity;
    }, 0);
  };

  // Calcular el stock de una categoría (por producto)
  const getCategoryStock = (categoryId: string) => {
    const categoryProducts = products.filter((p) => p.categoryId === categoryId);
    return categoryProducts.map((product) => ({
      productId: product.id,
      stock: getProductStock(product.id),
    }));
  };

  // Obtener productos con stock bajo
  const getLowStockProducts = () => {
    return products.filter((product) => {
      const stock = getProductStock(product.id);
      return stock <= product.minStock;
    });
  };

  // Obtener transacciones de un producto entre fechas
  const getProductTransactions = (
    productId: string,
    startDate: string,
    endDate: string
  ): InventoryTransaction[] => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return (
        t.productId === productId &&
        transactionDate >= start &&
        transactionDate <= end
      );
    });
  };

  // Calcular el costo del inventario según método
  const calculateInventoryCost = (
  productId: string,
  method: InventoryMethod, // PEPS, UEPS o promedio ponderado
  startDate: string,
  endDate: string
) => {
  // Filtra solo las transacciones del producto y entre el rango de fechas dado
  const filteredTransactions = getProductTransactions(productId, startDate, endDate);
  const entries = filteredTransactions.filter((t) => t.type === 'entry'); // entradas al inventario
  const exits = filteredTransactions.filter((t) => t.type === 'exit');   // salidas del inventario

  let remainingStock = 0;  // Stock final
  let totalCost = 0;       // Costo total del stock final
  let averageCost = 0;     // Costo unitario promedio del stock final

  if (method === 'PEPS') {
    // ----------- PEPS: Primeras Entradas, Primeras Salidas -----------
    const entriesQueue = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let remainingEntries = entriesQueue.map(e => ({ ...e })); // copia para modificar

    for (const exit of exits) {
      let qty = exit.quantity;
      while (qty > 0 && remainingEntries.length > 0) {
        const oldest = remainingEntries[0];
        if (oldest.quantity <= qty) {
          qty -= oldest.quantity;
          remainingEntries.shift(); // consumir lote completo
        } else {
          oldest.quantity -= qty; // consumir parcialmente
          qty = 0;
        }
      }
    }

    remainingStock = remainingEntries.reduce((sum, e) => sum + e.quantity, 0);
    totalCost = remainingEntries.reduce((sum, e) => sum + (e.quantity * e.unitCost), 0);
    averageCost = remainingStock > 0 ? totalCost / remainingStock : 0;
  }

  else if (method === 'UEPS') {
    // ----------- UEPS: Últimas Entradas, Primeras Salidas -----------
    const entriesStack = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let remainingEntries = entriesStack.map(e => ({ ...e }));

    for (const exit of exits) {
      let qty = exit.quantity;
      while (qty > 0 && remainingEntries.length > 0) {
        const newest = remainingEntries[0];
        if (newest.quantity <= qty) {
          qty -= newest.quantity;
          remainingEntries.shift(); // consumir lote completo
        } else {
          newest.quantity -= qty; // consumir parcialmente
          qty = 0;
        }
      }
    }

    remainingStock = remainingEntries.reduce((sum, e) => sum + e.quantity, 0);
    totalCost = remainingEntries.reduce((sum, e) => sum + (e.quantity * e.unitCost), 0);
    averageCost = remainingStock > 0 ? totalCost / remainingStock : 0;
  }

  else if (method === 'weighted') {
    // ----------- Costo Promedio Ponderado -----------
    let totalUnits = 0;
    let totalValue = 0;

    for (const entry of entries) {
      totalUnits += entry.quantity;
      totalValue += entry.quantity * entry.unitCost;
    }

    for (const exit of exits) {
      if (totalUnits > 0) {
        const currentAverage = totalValue / totalUnits;
        totalValue -= exit.quantity * currentAverage;
        totalUnits -= exit.quantity;
      }
    }

    remainingStock = totalUnits;
    totalCost = totalValue;
    averageCost = remainingStock > 0 ? totalCost / remainingStock : 0;
  }

  return {
    entries,
    exits,
    remainingStock,
    totalCost,
    averageCost,
  };
};


  // Valor que se expone en el contexto
  const value = {
    categories,
    products,
    transactions,
    addCategory,
    updateCategory,
    deleteCategory,
    addProduct,
    updateProduct,
    deleteProduct,
    addTransaction,
    getProductStock,
    getCategoryStock,
    getLowStockProducts,
    getProductTransactions,
    calculateInventoryCost,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

// Hook personalizado para usar el contexto fácilmente
export const useInventory = (): InventoryContextType => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};

