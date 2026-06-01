const cron = require('node-cron');
const supabase = require('../db/supabase');
const twilio = require('twilio');

const cliente = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Mensajes según el estado
const mensajesEstado = {
  'en preparación': '👨‍🍳 ¡Tu pedido está siendo preparado! En breve estará listo.',
  'en camino': '🛵 ¡Tu pedido ya va en camino! Pronto llegará a tu puerta.',
  'entregado': '✅ ¡Tu pedido fue entregado! Gracias por pedir en Manolo Gastrobar. 🍽️'
};

// Revisar cada minuto si hay pedidos con estado cambiado
cron.schedule('* * * * *', async () => {
  try {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        estado,
        notificado,
        clientes (nombre, whatsapp)
      `)
      .in('estado', ['en preparación', 'en camino', 'entregado'])
      .eq('notificado', false);

    if (error || !pedidos) return;

    for (const pedido of pedidos) {
      const mensaje = mensajesEstado[pedido.estado];
      const numero = `whatsapp:+${pedido.clientes.whatsapp}`;

      await cliente.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: numero,
        body: `Hola ${pedido.clientes.nombre}! ${mensaje}`
      });

      // Marcar como notificado
      await supabase
        .from('pedidos')
        .update({ notificado: true })
        .eq('id', pedido.id);

      console.log(`📱 Notificación enviada a ${pedido.clientes.nombre}`);
    }
  } catch (error) {
    console.error('Error en cron:', error);
  }
});