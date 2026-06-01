const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// Obtener todos los pedidos del día
router.get('/pedidos', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        direccion,
        estado,
        total,
        fecha,
        clientes (nombre, whatsapp),
        items_pedido (nombre_producto, cantidad, precio_unitario)
      `)
      .gte('fecha', hoy.toISOString())
      .order('fecha', { ascending: false });

    if (error) throw error;

    res.json(pedidos);
  } catch (error) {
    console.error('Error obteniendo pedidos:', error);
    res.status(500).json({ error: 'Error obteniendo pedidos' });
  }
});

// Actualizar estado de un pedido
router.patch('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const estadosValidos = ['recibido', 'en preparación', 'en camino', 'entregado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  try {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

module.exports = router;