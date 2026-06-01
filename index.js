require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('src/public'));

// Rutas
const webhookRoutes = require('./src/routes/webhook');
const panelRoutes = require('./src/routes/panel');

app.use('/webhook', webhookRoutes);
app.use('/panel', panelRoutes);

// Cron
require('./src/cron/notificaciones');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Manolo Bot corriendo en puerto ${PORT}`);
});