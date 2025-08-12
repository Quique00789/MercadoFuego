import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface ExcelReportData {
  productName: string;
  method: string;
  startDate: string;
  endDate: string;
  entries: Array<{
    id: string;
    date: string;
    quantity: number;
    unitCost: number;
  }>;
  exits: Array<{
    id: string;
    date: string;
    quantity: number;
  }>;
  remainingStock: number;
  totalCost: number;
  averageCost: number;
}

interface Assumptions {
  quantitySold: number;
  salePrice: number;
  operationalIncome: number;
  nonOperationalExpenses: number;
  taxRate: number; // percentage
}

export const exportToExcel = (reportData: ExcelReportData, assumptions: Assumptions) => {
  // Crear un nuevo workbook
  const wb = XLSX.utils.book_new();
  
  // Crear worksheet
  const ws = XLSX.utils.aoa_to_sheet([]);
  
  // Título del reporte
  XLSX.utils.sheet_add_aoa(ws, [
    [`REPORTE DE INVENTARIO - ${reportData.productName.toUpperCase()}`],
    [`Método: ${reportData.method}`],
    [`Período: ${reportData.startDate} al ${reportData.endDate}`],
    [''], // Línea vacía
  ], { origin: 'A1' });

  // Preparar datos para las tablas principales
  const allDates = new Set<string>();
  
  // Recopilar todas las fechas
  reportData.entries.forEach(entry => allDates.add(entry.date));
  reportData.exits.forEach(exit => allDates.add(exit.date));
  
  const sortedDates = Array.from(allDates).sort();
  
  // Crear mapas para acceso rápido
  const entriesMap = new Map<string, typeof reportData.entries[0]>();
  const exitsMap = new Map<string, typeof reportData.exits[0]>();
  
  reportData.entries.forEach(entry => entriesMap.set(entry.date, entry));
  reportData.exits.forEach(exit => exitsMap.set(exit.date, exit));

  // Headers de las tablas principales (fila 6)
  const mainHeaders = [
    'FECHA',
    'COMPRAS', '', '', // Cantidad, Costo Unit., Costo Total
    'VENTAS', '', '', // Cantidad, Costo Unit., Costo Total  
    'SALDOS', '', '' // Cantidad, Costo Unit., Costo Total
  ];
  
  const subHeaders = [
    '',
    'Cantidad', 'Costo Unit.', 'Costo Total',
    'Cantidad', 'Costo Unit.', 'Costo Total',
    'Cantidad', 'Costo Unit.', 'Costo Total'
  ];

  XLSX.utils.sheet_add_aoa(ws, [mainHeaders], { origin: 'A6' });
  XLSX.utils.sheet_add_aoa(ws, [subHeaders], { origin: 'A7' });

  // Datos de las transacciones
  let currentRow = 8;
  let runningQuantity = 0;
  let runningCost = 0;

  sortedDates.forEach(date => {
    const entry = entriesMap.get(date);
    const exit = exitsMap.get(date);
    
    // Calcular compras
    const purchaseQty = entry?.quantity || 0;
    const purchaseUnit = entry?.unitCost || 0;
    const purchaseTotal = purchaseQty * purchaseUnit;
    
    // Calcular ventas
    const saleQty = exit?.quantity || 0;
    const saleUnit = reportData.averageCost; // Usar costo promedio para salidas
    const saleTotal = saleQty * saleUnit;
    
    // Actualizar saldos
    if (entry) {
      runningQuantity += purchaseQty;
      runningCost += purchaseTotal;
    }
    if (exit) {
      runningQuantity -= saleQty;
      runningCost -= saleTotal;
    }
    
    const balanceUnit = runningQuantity > 0 ? runningCost / runningQuantity : 0;
    
    const rowData = [
      new Date(date).toLocaleDateString(),
      purchaseQty || '',
      purchaseUnit || '',
      purchaseTotal || '',
      saleQty || '',
      saleUnit || '',
      saleTotal || '',
      runningQuantity,
      balanceUnit,
      runningCost
    ];
    
    XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${currentRow}` });
    currentRow++;
  });

  // Agregar líneas vacías
  currentRow += 2;

  // Tabla de Supuestos
  XLSX.utils.sheet_add_aoa(ws, [
    ['SUPUESTOS'],
    ['Cantidad Vendida', assumptions.quantitySold],
    ['Precio de Venta', assumptions.salePrice],
    ['Ingresos Operacionales', assumptions.operationalIncome],
    ['Egresos No Operacionales', assumptions.nonOperationalExpenses],
    ['Tasa Impositiva (%)', assumptions.taxRate]
  ], { origin: `A${currentRow}` });

  currentRow += 8;

  // Estado de Resultados - Método Promedio Ponderado
  const grossSales = assumptions.quantitySold * assumptions.salePrice;
  const costOfSales = assumptions.quantitySold * reportData.averageCost;
  const grossProfit = grossSales - costOfSales;
  const profitBeforeTax = grossProfit + assumptions.operationalIncome - assumptions.nonOperationalExpenses;
  const taxes = profitBeforeTax * (assumptions.taxRate / 100);
  const netProfit = profitBeforeTax - taxes;

  XLSX.utils.sheet_add_aoa(ws, [
    ['ESTADO DE RESULTADOS - MÉTODO PROMEDIO PONDERADO'],
    [''],
    ['Ventas Brutas', grossSales.toFixed(2)],
    ['Costo de Ventas', costOfSales.toFixed(2)],
    ['Utilidad Bruta en Ventas', grossProfit.toFixed(2)],
    ['+ Ingresos No Operacionales', assumptions.operationalIncome.toFixed(2)],
    ['- Gastos No Operacionales', assumptions.nonOperationalExpenses.toFixed(2)],
    ['= Utilidad Antes de Impuestos', profitBeforeTax.toFixed(2)],
    ['- Impuestos', taxes.toFixed(2)],
    ['UTILIDAD NETA', netProfit.toFixed(2)]
  ], { origin: `A${currentRow}` });

  // Aplicar estilos y formato
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // Establecer anchos de columna
  ws['!cols'] = [
    { width: 12 }, // Fecha
    { width: 10 }, // Compras Cantidad
    { width: 12 }, // Compras Costo Unit
    { width: 12 }, // Compras Costo Total
    { width: 10 }, // Ventas Cantidad
    { width: 12 }, // Ventas Costo Unit
    { width: 12 }, // Ventas Costo Total
    { width: 10 }, // Saldos Cantidad
    { width: 12 }, // Saldos Costo Unit
    { width: 12 }  // Saldos Costo Total
  ];

  // Agregar worksheet al workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Inventario');
  
  // Generar archivo Excel
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // Descargar archivo
  const fileName = `Reporte_Inventario_${reportData.productName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(data, fileName);
};