const fs = require('fs');

// Leer logo y convertir a base64
const img = fs.readFileSync('src/public/logo.jpg');
const b64 = 'data:image/jpeg;base64,' + img.toString('base64');

// Leer el HTML
let html = fs.readFileSync('src/public/panel.html', 'utf8');

// Nuevo header con logo a la derecha
const nuevoHeader = `<header>
  <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:1200px;margin:0 auto;">
    <div style="flex:1"></div>
    <div style="text-align:center">
      <h1>Manolo Gastrobar</h1>
      <p>Panel de pedidos del día</p>
    </div>
    <div style="flex:1;display:flex;justify-content:flex-end">
      <img src="${b64}" style="height:90px;width:90px;border-radius:50%;border:2px solid #c8a84b;">
    </div>
  