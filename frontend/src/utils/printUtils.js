import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { printStyles } from '../components/PlantillaImpresion';
import { formatFecha } from './fechas';

/**
 * Creates a hidden iframe, writes HTML content, and triggers the browser print dialog.
 * Cleans up the iframe after printing.
 */
export const printViaIframe = (title, htmlContent) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>${printStyles}</style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `);
  iframeDoc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    } catch (printError) {
      console.error('Error al imprimir desde iframe:', printError);
      document.body.removeChild(iframe);
    }
  };
};

/**
 * Renders the delivery sheet HTML for a single order.
 */
export const renderPlantillaRepartidor = (pedido) => {
  return `
    <div class="print-template">
      <div class="header">
        <h1>HOJA DE REPARTO</h1>
        <div class="order-info">
          <p><strong>Pedido #:</strong> ${pedido.id}</p>
          <p><strong>Fecha:</strong> ${formatFecha(pedido.fecha)}</p>
          <p><strong>Período:</strong> ${pedido.periodo}</p>
        </div>
      </div>
      
      <div class="client-info">
        <h2>INFORMACIÓN DEL CLIENTE</h2>
        <p><strong>Cliente:</strong> ${pedido.cliente_nombre}</p>
        <p><strong>Dirección:</strong> ${pedido.direccion || 'No especificada'}</p>
        <p><strong>Teléfono:</strong> ${pedido.telefono || 'No especificado'}</p>
      </div>
      
      <div class="products">
        <h2>PRODUCTOS A ENTREGAR</h2>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Precio Unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${(pedido.detalles || []).map(detalle => `
              <tr>
                <td>${detalle.producto_nombre}</td>
                <td>${detalle.cantidad}</td>
                <td>$${detalle.precio_unitario.toFixed(2)}</td>
                <td>$${detalle.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3"><strong>TOTAL:</strong></td>
              <td><strong>$${parseFloat(pedido.total || 0).toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <div class="notes">
        <h2>NOTAS ESPECIALES</h2>
        <p>${pedido.notas || 'Sin notas especiales'}</p>
      </div>
      
      <div class="signature">
        <div class="signature-box">
          <p>Firma del Cliente:</p>
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          <p>Firma del Repartidor:</p>
          <div class="signature-line"></div>
        </div>
      </div>
    </div>
  `;
};

/**
 * Renders the production sheet HTML for a single order.
 */
export const renderPlantillaPreparador = (pedido) => {
  return `
    <div class="print-template">
      <div class="header">
        <h1>HOJA DE PRODUCCIÓN</h1>
        <div class="order-info">
          <p><strong>Pedido #:</strong> ${pedido.id}</p>
          <p><strong>Fecha:</strong> ${formatFecha(pedido.fecha)}</p>
          <p><strong>Período:</strong> ${pedido.periodo}</p>
          <p><strong>Cliente:</strong> ${pedido.cliente_nombre}</p>
        </div>
      </div>
      
      <div class="products">
        <h2>PRODUCTOS A PREPARAR</h2>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Notas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${(pedido.detalles || []).map(detalle => `
              <tr>
                <td>${detalle.producto_nombre}</td>
                <td class="cantidad">${detalle.cantidad}</td>
                <td>${detalle.notas || '-'}</td>
                <td class="checkbox">☐</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="notes">
        <h2>INSTRUCCIONES ESPECIALES</h2>
        <p>${pedido.notas || 'Sin instrucciones especiales'}</p>
      </div>
      
      <div class="checklist">
        <h2>CONTROL DE CALIDAD</h2>
        <div class="checklist-item">☐ Productos verificados</div>
        <div class="checklist-item">☐ Cantidades correctas</div>
        <div class="checklist-item">☐ Empaque adecuado</div>
        <div class="checklist-item">☐ Listo para entrega</div>
      </div>
      
      <div class="signature">
        <div class="signature-box">
          <p>Preparado por:</p>
          <div class="signature-line"></div>
          <p>Fecha: ___/___/______</p>
        </div>
      </div>
    </div>
  `;
};

/**
 * Aggregates products across multiple orders for summary tables.
 */
export const getProductosSummary = (pedidos) => {
  const productosMap = new Map();
  
  pedidos.forEach(pedido => {
    (pedido.detalles || []).forEach(detalle => {
      const key = detalle.producto_nombre;
      if (productosMap.has(key)) {
        const existing = productosMap.get(key);
        existing.cantidadTotal += detalle.cantidad;
        existing.pedidos.push(`#${pedido.id}`);
      } else {
        productosMap.set(key, {
          nombre: detalle.producto_nombre,
          cantidadTotal: detalle.cantidad,
          pedidos: [`#${pedido.id}`]
        });
      }
    });
  });
  
  return Array.from(productosMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
};

/**
 * Renders the daily delivery sheet HTML for multiple orders.
 */
export const renderPlanillaRepartoDiaria = (pedidos, filtroFecha, filtroPeriodo) => {
  const totalGeneral = pedidos.reduce((sum, pedido) => sum + parseFloat(pedido.total || 0), 0);
  const fechaFormateada = filtroFecha && !isNaN(new Date(filtroFecha)) ? format(new Date(filtroFecha), 'dd/MM/yyyy', { locale: es }) : 'Todas las fechas';
  
  return `
    <div class="print-template">
      <div class="header">
        <h1>PLANILLA DE REPARTO DIARIA</h1>
        <div class="order-info">
          <p><strong>Fecha:</strong> ${fechaFormateada}</p>
          <p><strong>Período:</strong> ${filtroPeriodo === 'todos' ? 'Mañana y Tarde' : filtroPeriodo.charAt(0).toUpperCase() + filtroPeriodo.slice(1)}</p>
          <p><strong>Total de Pedidos:</strong> ${pedidos.length}</p>
          <p><strong>Total General:</strong> $${totalGeneral.toFixed(2)}</p>
        </div>
      </div>
      
      <div class="orders-summary">
        <h2>RESUMEN DE ENTREGAS</h2>
        <table>
          <thead>
            <tr>
              <th>Pedido #</th>
              <th>Cliente</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Período</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${pedidos.map(pedido => `
              <tr>
                <td>${pedido.id}</td>
                <td>${pedido.cliente_nombre}</td>
                <td>${pedido.direccion || 'No especificada'}</td>
                <td>${pedido.telefono || 'No especificado'}</td>
                <td>${pedido.periodo}</td>
                <td>$${parseFloat(pedido.total || 0).toFixed(2)}</td>
                <td>☐</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"><strong>TOTAL GENERAL:</strong></td>
              <td><strong>$${totalGeneral.toFixed(2)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <div class="products-summary">
        <h2>PRODUCTOS POR ENTREGAR</h2>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad Total</th>
              <th>Pedidos</th>
            </tr>
          </thead>
          <tbody>
            ${getProductosSummary(pedidos).map(producto => `
              <tr>
                <td>${producto.nombre}</td>
                <td>${producto.cantidadTotal}</td>
                <td>${producto.pedidos.join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="signature">
        <div class="signature-box">
          <p>Repartidor:</p>
          <div class="signature-line"></div>
          <p>Fecha: ___/___/______</p>
        </div>
        <div class="signature-box">
          <p>Supervisor:</p>
          <div class="signature-line"></div>
          <p>Hora de salida: ___:___</p>
        </div>
      </div>
    </div>
  `;
};

/**
 * Renders the daily production sheet HTML for multiple orders.
 */
export const renderPlanillaProduccionDiaria = (pedidos, filtroFecha, filtroPeriodo) => {
  const fechaFormateada = filtroFecha && !isNaN(new Date(filtroFecha)) ? format(new Date(filtroFecha), 'dd/MM/yyyy', { locale: es }) : 'Todas las fechas';
  
  // Filter for specific product types
  const todosLosProductos = new Set();
  pedidos.forEach(pedido => {
    (pedido.detalles || []).forEach(detalle => {
      const nombreProducto = detalle.producto_nombre.toLowerCase();
      if (nombreProducto.includes('ciabatta') || 
          nombreProducto.includes('dobla') || 
          nombreProducto.includes('empanada') ||
          nombreProducto.includes('valdiviano') ||
          nombreProducto.includes('amarillo')) {
        todosLosProductos.add(detalle.producto_nombre);
      }
    });
  });
  
  const productosArray = Array.from(todosLosProductos).sort();
  
  // Build data matrix: client -> product -> quantity
  const matrizDatos = {};
  pedidos.forEach(pedido => {
    (pedido.detalles || []).forEach(detalle => {
      const nombreProducto = detalle.producto_nombre.toLowerCase();
      if (nombreProducto.includes('ciabatta') || 
          nombreProducto.includes('dobla') || 
          nombreProducto.includes('empanada') ||
          nombreProducto.includes('valdiviano') ||
          nombreProducto.includes('amarillo')) {
        
        if (!matrizDatos[pedido.cliente_nombre]) {
          matrizDatos[pedido.cliente_nombre] = {};
        }
        
        const producto = detalle.producto_nombre;
        if (!matrizDatos[pedido.cliente_nombre][producto]) {
          matrizDatos[pedido.cliente_nombre][producto] = 0;
        }
        matrizDatos[pedido.cliente_nombre][producto] += detalle.cantidad;
      }
    });
  });
  
  const clientes = Object.keys(matrizDatos).sort();
  
  // Calculate totals per product
  const totalesProductos = {};
  productosArray.forEach(producto => {
    totalesProductos[producto] = clientes.reduce((sum, cliente) => {
      return sum + (matrizDatos[cliente][producto] || 0);
    }, 0);
  });
  
  // Calculate "dobladas" kilos per period
  const calcularKilosDobladas = (periodo) => {
    const pedidosPeriodo = pedidos.filter(p => periodo === 'todos' || p.periodo === periodo);
    let totalDobladas = 0;
    
    pedidosPeriodo.forEach(pedido => {
      (pedido.detalles || []).forEach(detalle => {
        if (detalle.producto_nombre.toLowerCase().includes('dobla')) {
          totalDobladas += detalle.cantidad;
        }
      });
    });
    
    return {
      total: totalDobladas,
      latas: (totalDobladas / 3.8).toFixed(2)
    };
  };
  
  const dobladasMañana = calcularKilosDobladas('mañana');
  const dobladasTarde = calcularKilosDobladas('tarde');
  const dobladasTotal = calcularKilosDobladas('todos');
  
  return `
    <div class="print-template" style="font-size: 14px; max-width: 297mm; margin: 0 auto; padding: 25px; background: white;">
      <!-- ENCABEZADO DE PRODUCCIÓN -->
      <div class="produccion-header" style="border: 3px solid #2c3e50; padding: 20px; margin-bottom: 25px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="empresa-info" style="flex: 1;">
            <h1 style="margin: 0; font-size: 26px; font-weight: bold; color: #2c3e50; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">DONDE LA ELI</h1>
            <p style="margin: 8px 0; font-size: 14px; color: #495057; font-weight: 500;">📍 Dirección: Altamira 70, La Florida</p>
            <p style="margin: 8px 0; font-size: 14px; color: #495057; font-weight: 500;">📞 Teléfono: +56 9 1234 5678</p>
            <p style="margin: 8px 0; font-size: 14px; color: #495057; font-weight: 500;">✉️ Email: contacto@panaderia.cl</p>
          </div>
          <div class="produccion-datos" style="text-align: right; border: 2px solid #27ae60; padding: 15px; background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-radius: 8px;">
            <h2 style="margin: 0; font-size: 20px; color: #155724; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">📋 PLANILLA DE PRODUCCIÓN</h2>
            <p style="margin: 8px 0; font-size: 14px; color: #155724; font-weight: 600;">📅 Fecha: ${fechaFormateada}</p>
            <p style="margin: 8px 0; font-size: 14px; color: #155724; font-weight: 600;">⏰ Período: ${filtroPeriodo === 'todos' ? 'Mañana y Tarde' : filtroPeriodo.charAt(0).toUpperCase() + filtroPeriodo.slice(1)}</p>
          </div>
        </div>
      </div>
      
      <!-- DATOS DEL CLIENTE -->
      <div class="cliente-info" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 15px; background: #f9f9f9;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #2c3e50;">DATOS DE PRODUCCIÓN</h3>
        <p style="margin: 3px 0; font-size: 11px;"><strong>Fecha de Producción:</strong> ${fechaFormateada}</p>
        <p style="margin: 3px 0; font-size: 11px;"><strong>Tipo de Documento:</strong> Planilla de Producción Diaria</p>
        <p style="margin: 3px 0; font-size: 11px;"><strong>Estado:</strong> En Proceso</p>
      </div>
      
      <!-- DETALLE DE PRODUCTOS -->
      <div class="tabla-productos" style="margin: 25px 0;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 8px; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">🍞 MATRIZ DE PRODUCCIÓN POR CLIENTE</h3>
      </div>
      
      <table class="produccion-table" style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; border: 2px solid #2c3e50; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); color: white;">
            <th style="border: 2px solid #2c3e50; padding: 12px; text-align: left; font-weight: bold; font-size: 14px;">👥 CLIENTE</th>
             ${productosArray.map(producto => {
               return `<th style="border: 2px solid #2c3e50; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white;">🥖 ${producto}</th>`;
             }).join('')}
             <th style="border: 2px solid #2c3e50; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white;">📊 TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${clientes.map(cliente => {
            const totalCliente = productosArray.reduce((sum, producto) => {
              return sum + (matrizDatos[cliente][producto] || 0);
            }, 0);
            
            return `
              <tr style="${clientes.indexOf(cliente) % 2 === 0 ? 'background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);' : 'background: white;'}">
                <td style="border: 2px solid #2c3e50; padding: 12px; font-weight: bold; background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); color: #155724; font-size: 14px;">🏪 ${cliente}</td>
                ${productosArray.map(producto => {
                  const cantidad = matrizDatos[cliente][producto] || 0;
                  return `<td style="border: 2px solid #2c3e50; padding: 12px; text-align: center; font-size: 13px; font-weight: 500;">${cantidad > 0 ? cantidad : '-'}</td>`;
                }).join('')}
                <td style="border: 2px solid #2c3e50; padding: 12px; text-align: center; font-weight: bold; background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); color: #856404; font-size: 14px;">${totalCliente}</td>
              </tr>
            `;
          }).join('')}
          <tr style="background: linear-gradient(135deg, #2c3e50 0%, #1a252f 100%); color: white; font-weight: bold; border: 3px solid #e74c3c;">
            <td style="border: 2px solid #e74c3c; padding: 15px; text-align: center; font-weight: bold; font-size: 16px; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);">🎯 TOTAL GENERAL</td>
            ${productosArray.map(producto => {
              return `<td style="border: 2px solid #e74c3c; padding: 15px; text-align: center; font-weight: bold; font-size: 15px; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);">${totalesProductos[producto]}</td>`;
            }).join('')}
            <td style="border: 2px solid #e74c3c; padding: 15px; text-align: center; font-weight: bold; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); font-size: 18px; color: white;">🔥 ${clientes.reduce((sum, cliente) => {
              return sum + productosArray.reduce((clienteSum, producto) => {
                return clienteSum + (matrizDatos[cliente][producto] || 0);
              }, 0);
            }, 0)}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="resumen-productos" style="margin: 25px 0; padding: 20px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border: 3px solid #3498db; border-radius: 12px; box-shadow: 0 6px 12px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 20px; color: #2c3e50; text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 12px; font-size: 20px; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">⚙️ CÁLCULOS DE PRODUCCIÓN</h3>
        
        <div class="calculo-dobladas" style="background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); padding: 20px; border-radius: 12px; border: 3px solid #27ae60; margin-bottom: 20px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
          <h4 style="margin: 0 0 15px 0; color: #155724; text-align: center; font-size: 18px; background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); padding: 10px; border-radius: 8px; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">🥖 CÁLCULO DE LATAS - DOBLADAS</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            ${filtroPeriodo === 'todos' || filtroPeriodo === 'mañana' ? `
              <div style="text-align: center; padding: 15px; background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); border-radius: 8px; border: 2px solid #f39c12; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <strong style="color: #856404; font-size: 16px;">🌅 MAÑANA</strong><br>
                <span style="color: #495057; font-size: 14px;">Total dobladas: ${dobladasMañana.total}</span><br>
                <span style="font-size: 20px; font-weight: bold; color: #27ae60;">${dobladasMañana.latas} latas</span><br>
                <small style="color: #6c757d;">(÷ 3.8)</small>
              </div>
            ` : ''}
            ${filtroPeriodo === 'todos' || filtroPeriodo === 'tarde' ? `
              <div style="text-align: center; padding: 15px; background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%); border-radius: 8px; border: 2px solid #17a2b8; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <strong style="color: #0c5460; font-size: 16px;">🌆 TARDE</strong><br>
                <span style="color: #495057; font-size: 14px;">Total dobladas: ${dobladasTarde.total}</span><br>
                <span style="font-size: 20px; font-weight: bold; color: #f39c12;">${dobladasTarde.latas} latas</span><br>
                <small style="color: #6c757d;">(÷ 3.8)</small>
              </div>
            ` : ''}
            ${filtroPeriodo === 'todos' ? `
              <div style="text-align: center; padding: 15px; background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); border-radius: 8px; border: 2px solid #e74c3c; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <strong style="color: #721c24; font-size: 16px;">🎯 TOTAL GENERAL</strong><br>
                <span style="color: #495057; font-size: 14px;">Total dobladas: ${dobladasTotal.total}</span><br>
                <span style="font-size: 22px; font-weight: bold; color: #e74c3c;">${dobladasTotal.latas} latas</span><br>
                <small style="color: #6c757d;">(÷ 3.8)</small>
              </div>
            ` : ''}
          </div>
        </div>

      </div>
      
      <!-- PIE DE FACTURA -->
      <div class="pie-factura" style="margin-top: 30px; border-top: 2px solid #333; padding-top: 15px;">
      </div>
    </div>
  `;
};
