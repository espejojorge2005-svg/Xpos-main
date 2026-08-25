/**
 * uninstall-service.js
 * Ejecuta este script para desinstalar el servicio de Windows.
 * 
 * Uso: node uninstall-service.js
 */

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'POS Print Agent',
  script: path.join(__dirname, 'index.js'),
});

svc.on('uninstall', () => {
  console.log('✅ Servicio "POS Print Agent" desinstalado correctamente.');
});

svc.on('error', (err) => {
  console.error('❌ Error al desinstalar el servicio:', err);
});

svc.uninstall();
