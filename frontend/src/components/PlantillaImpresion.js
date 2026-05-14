import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Paper,
} from '@mui/material';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Plantilla para repartidores
export const PlantillaRepartidor = ({ pedido }) => {
  return (
    <Paper sx={{ p: 3, maxWidth: '210mm', margin: 'auto' }} className="print-template">
      <Box textAlign="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          HOJA DE REPARTO
        </Typography>
        <Typography variant="h6" color="primary">
          Pedido #{pedido.id}
        </Typography>
      </Box>

      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" mb={1}>
          INFORMACIÓN DE ENTREGA
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Box display="flex" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Cliente:
            </Typography>
            <Typography variant="h6">{pedido.cliente_nombre}</Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="subtitle1" fontWeight="bold">
              Fecha de Entrega:
            </Typography>
            <Typography variant="h6">
              {format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}
            </Typography>
          </Box>
        </Box>

        <Box mb={2}>
          <Typography variant="subtitle1" fontWeight="bold">
            Período:
          </Typography>
          <Typography variant="h6" color="primary">
            {pedido.periodo === 'mañana' ? 'MAÑANA' : 'TARDE'}
          </Typography>
        </Box>

        {pedido.cliente_direccion && (
          <Box mb={2}>
            <Typography variant="subtitle1" fontWeight="bold">
              Dirección:
            </Typography>
            <Typography variant="body1">{pedido.cliente_direccion}</Typography>
          </Box>
        )}

        {pedido.cliente_telefono && (
          <Box mb={2}>
            <Typography variant="subtitle1" fontWeight="bold">
              Teléfono:
            </Typography>
            <Typography variant="body1">{pedido.cliente_telefono}</Typography>
          </Box>
        )}
      </Box>

      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" mb={1}>
          PRODUCTOS A ENTREGAR
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Producto</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Cantidad</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Precio</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedido.detalles?.map((detalle, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ fontSize: '0.95rem' }}>
                    {detalle.producto_nombre}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {detalle.cantidad}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.95rem' }}>
                    ${detalle.precio_unitario.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" color="primary">
          TOTAL A COBRAR: ${pedido.total.toFixed(2)}
        </Typography>
      </Box>

      {pedido.notas && (
        <Box mb={3}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notas Especiales:
          </Typography>
          <Typography variant="body1" sx={{ fontStyle: 'italic' }}>
            {pedido.notas}
          </Typography>
        </Box>
      )}

      <Box mt={4} pt={2} borderTop={1} borderColor="grey.300">
        <Box display="flex" justifyContent="space-between">
          <Box>
            <Typography variant="body2">
              Firma del Cliente: ___________________
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2">
              Firma del Repartidor: ___________________
            </Typography>
          </Box>
        </Box>
        <Box mt={2}>
          <Typography variant="body2">
            Hora de Entrega: ___________________
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

// Plantilla para preparadores
export const PlantillaPreparador = ({ pedido }) => {
  return (
    <Paper sx={{ p: 3, maxWidth: '210mm', margin: 'auto' }} className="print-template">
      <Box textAlign="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          HOJA DE PRODUCCIÓN
        </Typography>
        <Typography variant="h6" color="primary">
          Pedido #{pedido.id}
        </Typography>
      </Box>

      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" mb={1}>
          INFORMACIÓN DEL PEDIDO
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Box display="flex" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Cliente:
            </Typography>
            <Typography variant="body1">{pedido.cliente_nombre}</Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="subtitle1" fontWeight="bold">
              Fecha de Preparación:
            </Typography>
            <Typography variant="body1">
              {format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}
            </Typography>
          </Box>
        </Box>

        <Box display="flex" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Período:
            </Typography>
            <Typography variant="h6" color="primary">
              {pedido.periodo === 'mañana' ? 'MAÑANA' : 'TARDE'}
            </Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="subtitle1" fontWeight="bold">
              Estado:
            </Typography>
            <Typography variant="body1">{pedido.estado}</Typography>
          </Box>
        </Box>
      </Box>

      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" mb={1}>
          PRODUCTOS A PREPARAR
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Producto</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Cantidad</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Preparado</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>Observaciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedido.detalles?.map((detalle, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
                    {detalle.producto_nombre}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'primary.main' }}>
                    {detalle.cantidad}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: 20, height: 20, border: 2, borderColor: 'grey.400' }} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ borderBottom: 1, borderColor: 'grey.300', minHeight: 20 }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {pedido.notas && (
        <Box mb={3}>
          <Typography variant="subtitle1" fontWeight="bold">
            Notas Especiales de Preparación:
          </Typography>
          <Typography variant="body1" sx={{ fontStyle: 'italic', color: 'error.main' }}>
            {pedido.notas}
          </Typography>
        </Box>
      )}

      <Box mb={3}>
        <Typography variant="subtitle1" fontWeight="bold">
          Notas Adicionales del Preparador:
        </Typography>
        <Box sx={{ border: 1, borderColor: 'grey.300', minHeight: 60, p: 1, mt: 1 }} />
      </Box>

      <Box mt={4} pt={2} borderTop={1} borderColor="grey.300">
        <Box display="flex" justifyContent="center">
          <Box>
            <Typography variant="body2">
              Preparado por: ___________________
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

// Estilos CSS para impresión
export const printStyles = `
  .print-template {
    max-width: 216mm;
    margin: auto;
    padding: 30px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.5;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    min-height: 100vh;
  }

  .header {
    text-align: center;
    margin-bottom: 35px;
    border-bottom: 3px solid #2c3e50;
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  }

  .header h1 {
    font-size: 2.2rem;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: white;
    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }

  .order-info {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    margin-top: 18px;
  }

  .order-info p {
    margin: 6px;
    font-size: 1.1rem;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }

  .client-info, .products, .notes, .orders-summary, .products-summary, .production-summary, .orders-detail, .resumen-tiempo, .control-final {
    margin-bottom: 30px;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }

  .client-info h2, .products h2, .notes h2, .orders-summary h2, .products-summary h2, .production-summary h2, .orders-detail h2, .resumen-tiempo h2, .control-final h2 {
    font-size: 1.4rem;
    font-weight: 600;
    margin-bottom: 12px;
    color: #2c3e50;
    border-bottom: 2px solid #3498db;
    padding-bottom: 8px;
  }

  /* Estilos para tabla tipo Excel */
  .excel-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin: 4px 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  
  .excel-table th, .excel-table td {
    border: 1px solid #bdc3c7;
    padding: 4px;
    text-align: center;
    font-size: 10px;
    line-height: 1.2;
  }
  
  .cliente-header {
    background: linear-gradient(135deg, #3498db, #2980b9);
    color: white;
    font-weight: 600;
    text-align: left;
    width: 140px;
    font-size: 9px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  
  .producto-header {
        background: linear-gradient(135deg, #e74c3c, #c0392b);
        color: white;
        font-weight: 600;
        text-align: center;
        width: 75px;
        font-size: 10px;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        padding: 6px 3px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }
  
  .total-header {
    background: linear-gradient(135deg, #27ae60, #229954);
    color: white;
    font-weight: 600;
    text-align: center;
    width: 60px;
    font-size: 9px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  
  .cliente-cell {
    text-align: left;
    font-size: 8px;
    font-weight: 500;
    padding-left: 6px;
    background: linear-gradient(135deg, #ecf0f1, #bdc3c7);
    color: #2c3e50;
  }
  
  .cantidad-cell {
    text-align: center;
    font-size: 9px;
    width: 40px;
    background-color: #fafafa;
    transition: background-color 0.3s ease;
  }
  
  .total-cell {
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    background: linear-gradient(135deg, #f39c12, #e67e22);
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  
  .firmas-section {
    margin-top: 15px;
    font-size: 12px;
    border-top: 1px solid #000;
    padding-top: 8px;
  }
  
  .totales-info {
    text-align: center;
    margin-bottom: 12px;
    font-size: 12px;
    font-weight: bold;
  }
  
  .firmas-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
    margin-bottom: 12px;
  }
  
  .firma-item {
    text-align: center;
    font-size: 12px;
  }
  
  .firma-label {
    font-weight: bold;
    margin-bottom: 4px;
    font-size: 12px;
  }
  
  .firma-linea {
    border-bottom: 1px solid #000;
    height: 20px;
    margin-bottom: 4px;
  }
  
  .firma-fecha {
    font-size: 10px;
    color: #666;
  }
  


  .producto-nombre {
    font-weight: bold;
    color: #333;
  }

  .cantidad-cell {
    text-align: center;
    font-weight: bold;
    font-size: 1.2rem;
    color: #1976D2;
    background-color: #E3F2FD;
  }

  .notas-cell {
    font-style: italic;
    color: #666;
  }

  .checkbox-cell {
    text-align: center;
    font-size: 1.3rem;
    width: 50px;
  }

  .pedido-notas {
    background-color: #FFF9C4;
    padding: 10px;
    border-radius: 5px;
    margin: 10px 0;
    border-left: 4px solid #FBC02D;
  }

  .control-final {
    background-color: #E8F5E8;
    padding: 20px;
    border-radius: 8px;
    border: 2px solid #4CAF50;
  }

  .checklist-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 15px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
  }

  th, td {
    border: 1px solid #333;
    padding: 8px;
    text-align: left;
    font-size: 0.9rem;
  }

  th {
    background-color: #f5f5f5;
    font-weight: bold;
    text-align: center;
  }

  .cantidad {
    text-align: center;
    font-weight: bold;
    font-size: 1.1rem;
  }

  .checkbox {
    text-align: center;
    font-size: 1.2rem;
    width: 40px;
  }

  .signature {
    display: flex;
    justify-content: space-around;
    margin-top: 40px;
    page-break-inside: avoid;
  }

  .signature-box {
    text-align: center;
    width: 200px;
  }

  .signature-line {
    border-bottom: 1px solid #333;
    margin: 20px 0 10px 0;
    height: 40px;
  }

  .checklist {
    margin: 25px 0;
  }

  .checklist h2 {
    font-size: 1.3rem;
    font-weight: bold;
    margin-bottom: 15px;
    color: #333;
  }

  .checklist-item {
    margin: 8px 0;
    font-size: 1rem;
    padding: 5px;
  }

  .order-section {
    margin-bottom: 20px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 5px;
    background-color: white;
  }

  .order-section h3 {
    font-size: 1.1rem;
    font-weight: bold;
    margin-bottom: 10px;
    color: #333;
  }

  .order-detail-table {
    margin-bottom: 10px;
  }

  .order-detail-table th {
    background-color: #e8f4f8;
  }

  tfoot td {
    font-weight: bold;
    background-color: #f0f0f0;
  }

  @media print {
    .print-template {
      box-shadow: none !important;
      margin: 0 !important;
      padding: 20px !important;
      background: white !important;
    }

    @page {
      margin: 15mm;
      size: legal;
    }

    body {
      -webkit-print-color-adjust: exact;
      color-adjust: exact;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .order-section {
      page-break-inside: avoid;
      background: white !important;
    }

    .periodo-section {
      page-break-inside: avoid;
    }

    .signature {
      page-break-inside: avoid;
    }

    .checklist-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
    }

    .client-info, .products, .notes, .orders-summary, .products-summary, .production-summary, .orders-detail, .resumen-tiempo, .control-final {
      background: white !important;
      box-shadow: none !important;
    }
  }
`;