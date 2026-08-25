/**
 * install-service.js
 * Ejecuta este script UNA SOLA VEZ como Administrador para instalar
 * el agente de impresión como servicio de Windows.
 * 
 * Uso: node install-service.js
 */

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'POS Print Agent',
  description: 'Agente de impresión térmica para el POS del restaurante',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [],
  // Reiniciar automáticamente si falla
  grow: 0.25,
  wait: 1,
  maxRestarts: 5
});

svc.on('install', () => {
  svc.start();
  console.log('✅ Servicio "POS Print Agent" instalado e iniciado correctamente.');
  console.log('   El agente iniciará automáticamente con Windows.');
  console.log('   Corriendo en: http://localhost:4001');
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  El servicio ya está instalado. Para reinstalar, ejecuta primero uninstall-service.js');
});

svc.on('error', (err) => {
  console.error('❌ Error al instalar el servicio:', err);
});

svc.install();
