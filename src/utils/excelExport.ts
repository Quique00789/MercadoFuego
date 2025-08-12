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
  
  // Crear worksheet vacío
  const ws: any = {};
  
  // Título principal
  ws['A1'] = { v: `REPORTE DE INVENTARIO - ${reportData.productName.toUpperCase()}`, t: 's' };
  ws['A2'] = { v: `Método: ${reportData.method}`, t: 's' };
  ws['A3'] = { v: `Período: ${reportData.startDate} al ${reportData.endDate}`, t: 's' };
  
  // SECCIÓN 1: TABLA PRINCIPAL
  // Fila 5: Headers principales
  ws['A5'] = { v: 'FECHA', t: 's' };
  ws['B5'] = { v: 'COMPRAS', t: 's' };
  ws['E5'] = { v: 'VENTAS', t: 's' };
  ws['H5'] = { v: 'SALDOS', t: 's' };
  
  // Fila 6: Sub-headers
  ws['B6'] = { v: 'Cantidad', t: 's' };
  ws['C6'] = { v: 'Costo Unidad', t: 's' };
  ws['D6'] = { v: 'Costo Total', t: 's' };
  ws['E6'] = { v: 'Cantidad', t: 's' };
  ws['F6'] = { v: 'Costo Unidad', t: 's' };
  ws['G6'] = { v: 'Costo Total', t: 's' };
  ws['H6'] = { v: 'Cantidad', t: 's' };
  ws['I6'] = { v: 'Costo Unidad', t: 's' };
  ws['J6'] = { v: 'Costo Total', t: 's' };
  
  // Preparar datos para llenar la tabla
  const allDates = new Set<string>();
  reportData.entries.forEach(entry => allDates.add(entry.date));
  reportData.exits.forEach(exit => allDates.add(exit.date));
  const sortedDates = Array.from(allDates).sort();
  
  // Crear mapas para acceso rápido
  const entriesMap = new Map<string, typeof reportData.entries[0]>();
  const exitsMap = new Map<string, typeof reportData.exits[0]>();
  
  reportData.entries.forEach(entry => entriesMap.set(entry.date, entry));
  reportData.exits.forEach(exit => exitsMap.set(exit.date, exit));
  
  // Variables para calcular saldos acumulados
  let runningQuantity = 0;
  let runningCost = 0;
  let totalPurchases = 0;
  let totalSales = 0;
  
  // Llenar datos por fecha
  sortedDates.forEach((date, index) => {
    const row = 7 + index; // Empezar en fila 7
    const entry = entriesMap.get(date);
    const exit = exitsMap.get(date);
    
    // Fecha
    ws[`A${row}`] = { v: new Date(date).toLocaleDateString(), t: 's' };
    
    // COMPRAS
    const purchaseQty = entry?.quantity || 0;
    const purchaseUnit = entry?.unitCost || 0;
    const purchaseTotal = purchaseQty * purchaseUnit;
    
    if (purchaseQty > 0) {
      ws[`B${row}`] = { v: purchaseQty, t: 'n' };
      ws[`C${row}`] = { v: purchaseUnit, t: 'n' };
      ws[`D${row}`] = { v: purchaseTotal, t: 'n' };
      totalPurchases += purchaseTotal;
    }
    
    // VENTAS
    const saleQty = exit?.quantity || 0;
    const saleUnit = reportData.averageCost;
    const saleTotal = saleQty * saleUnit;
    
    if (saleQty > 0) {
      ws[`E${row}`] = { v: saleQty, t: 'n' };
      ws[`F${row}`] = { v: saleUnit, t: 'n' };
      ws[`G${row}`] = { v: saleTotal, t: 'n' };
      totalSales += saleTotal;
    }
    
    // Actualizar saldos acumulados
    if (entry) {
      runningQuantity += purchaseQty;
      runningCost += purchaseTotal;
    }
    if (exit) {
      runningQuantity -= saleQty;
      runningCost -= saleTotal;
    }
    
    // SALDOS
    const balanceUnit = runningQuantity > 0 ? runningCost / runningQuantity : 0;
    ws[`H${row}`] = { v: runningQuantity, t: 'n' };
    ws[`I${row}`] = { v: balanceUnit, t: 'n' };
    ws[`J${row}`] = { v: runningCost, t: 'n' };
  });
  
  // Fila de totales
  const totalRow = 7 + sortedDates.length + 1;
  ws[`A${totalRow}`] = { v: 'TOTALES', t: 's' };
  ws[`D${totalRow}`] = { v: totalPurchases, t: 'n' };
  ws[`G${totalRow}`] = { v: totalSales, t: 'n' };
  
  // SECCIÓN 2: SUPUESTOS (parte inferior izquierda)
  const assumptionsStartRow = totalRow + 3;
  ws[`A${assumptionsStartRow}`] = { v: 'SUPUESTOS', t: 's' };
  ws[`A${assumptionsStartRow + 1}`] = { v: 'Cantidad Vendida', t: 's' };
  ws[`B${assumptionsStartRow + 1}`] = { v: assumptions.quantitySold, t: 'n' };
  ws[`A${assumptionsStartRow + 2}`] = { v: 'Precio de Venta', t: 's' };
  ws[`B${assumptionsStartRow + 2}`] = { v: assumptions.salePrice, t: 'n' };
  ws[`A${assumptionsStartRow + 3}`] = { v: 'Ingresos Operacionales', t: 's' };
  ws[`B${assumptionsStartRow + 3}`] = { v: assumptions.operationalIncome, t: 'n' };
  ws[`A${assumptionsStartRow + 4}`] = { v: 'Egresos No Operacionales', t: 's' };
  ws[`B${assumptionsStartRow + 4}`] = { v: assumptions.nonOperationalExpenses, t: 'n' };
  ws[`A${assumptionsStartRow + 5}`] = { v: 'Tasa Impositiva (%)', t: 's' };
  ws[`B${assumptionsStartRow + 5}`] = { v: assumptions.taxRate, t: 'n' };
  
  // SECCIÓN 3: ESTADO DE RESULTADOS (parte inferior derecha)
  const resultsStartRow = assumptionsStartRow;
  const grossSales = assumptions.quantitySold * assumptions.salePrice;
  const costOfSales = assumptions.quantitySold * reportData.averageCost;
  const grossProfit = grossSales - costOfSales;
  const profitBeforeTax = grossProfit + assumptions.operationalIncome - assumptions.nonOperationalExpenses;
  const taxes = profitBeforeTax * (assumptions.taxRate / 100);
  const netProfit = profitBeforeTax - taxes;
  
  ws[`E${resultsStartRow}`] = { v: 'ESTADO DE RESULTADOS - MÉTODO PROMEDIO PONDERADO', t: 's' };
  ws[`E${resultsStartRow + 1}`] = { v: 'Ventas Brutas', t: 's' };
  ws[`F${resultsStartRow + 1}`] = { v: grossSales, t: 'n' };
  ws[`E${resultsStartRow + 2}`] = { v: 'Costo de Ventas', t: 's' };
  ws[`F${resultsStartRow + 2}`] = { v: costOfSales, t: 'n' };
  ws[`E${resultsStartRow + 3}`] = { v: 'Utilidad Bruta en Ventas', t: 's' };
  ws[`F${resultsStartRow + 3}`] = { v: grossProfit, t: 'n' };
  ws[`E${resultsStartRow + 4}`] = { v: 'Ingresos No-Operacionales', t: 's' };
  ws[`F${resultsStartRow + 4}`] = { v: assumptions.operationalIncome, t: 'n' };
  ws[`E${resultsStartRow + 5}`] = { v: 'Gastos No-Operacionales', t: 's' };
  ws[`F${resultsStartRow + 5}`] = { v: assumptions.nonOperationalExpenses, t: 'n' };
  ws[`E${resultsStartRow + 6}`] = { v: '= Utilidad antes de Impuestos', t: 's' };
  ws[`F${resultsStartRow + 6}`] = { v: profitBeforeTax, t: 'n' };
  ws[`E${resultsStartRow + 7}`] = { v: 'Impuestos', t: 's' };
  ws[`F${resultsStartRow + 7}`] = { v: taxes, t: 'n' };
  ws[`E${resultsStartRow + 8}`] = { v: 'UTILIDAD NETA', t: 's' };
  ws[`F${resultsStartRow + 8}`] = { v: netProfit, t: 'n' };
  
  // Establecer el rango de la hoja
  const lastRow = Math.max(totalRow, resultsStartRow + 8);
  ws['!ref'] = `A1:J${lastRow}`;
  
  // Configurar anchos de columna
  ws['!cols'] = [
    { width: 12 }, // A - Fecha
    { width: 10 }, // B - Compras Cantidad
    { width: 12 }, // C - Compras Costo Unit
    { width: 12 }, // D - Compras Costo Total
    { width: 10 }, // E - Ventas Cantidad
    { width: 12 }, // F - Ventas Costo Unit
    { width: 12 }, // G - Ventas Costo Total
    { width: 10 }, // H - Saldos Cantidad
    { width: 12 }, // I - Saldos Costo Unit
    { width: 12 }  // J - Saldos Costo Total
  ];
  
  // Aplicar estilos a los headers
  const headerStyle = {
    font: { bold: true },
    fill: { fgColor: { rgb: "D3D3D3" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    }
  };
  
  // Aplicar estilos a headers principales
  ['A5', 'B5', 'E5', 'H5'].forEach(cell => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });
  
  // Aplicar estilos a sub-headers
  ['B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6', 'I6', 'J6'].forEach(cell => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });
  
  // Aplicar estilos a títulos de secciones
  [`A${assumptionsStartRow}`, `E${resultsStartRow}`].forEach(cell => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });
  
  // Aplicar formato de número a celdas monetarias
  const numberFormat = '#,##0.00';
  for (let row = 7; row <= 7 + sortedDates.length; row++) {
    ['C', 'D', 'F', 'G', 'I', 'J'].forEach(col => {
      const cellRef = `${col}${row}`;
      if (ws[cellRef]) {
        ws[cellRef].z = numberFormat;
      }
    });
  }
  
  // Formato para totales
  [`D${totalRow}`, `G${totalRow}`].forEach(cell => {
    if (ws[cell]) ws[cell].z = numberFormat;
  });
  
  // Formato para supuestos y estado de resultados
  for (let i = 1; i <= 8; i++) {
    [`B${assumptionsStartRow + i}`, `F${resultsStartRow + i}`].forEach(cell => {
      if (ws[cell]) ws[cell].z = numberFormat;
    });
  }
  
  // Agregar worksheet al workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Inventario');
  
  // Generar archivo Excel
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  // Descargar archivo
  const fileName = `Reporte_Inventario_${reportData.productName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(data, fileName);
};