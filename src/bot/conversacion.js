require('dotenv').config();
const Groq = require('groq-sdk');
const supabase = require('../db/supabase');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Guardamos el historial de cada cliente en memoria
const conversaciones = {};

async function procesarMensaje(numero, mensaje) {
  // Buscar si el cliente ya existe en la base de datos
  let nombreCliente = null;
  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('nombre')
    .eq('whatsapp', numero)
    .single();

  if (clienteExistente) {
    nombreCliente = clienteExistente.nombre;
  }

  // Inicializar historial si es la primera vez
  if (!conversaciones[numero]) {
    conversaciones[numero] = [];
  }

  // Agregar mensaje del cliente al historial
  conversaciones[numero].push({
    role: 'user',
    content: mensaje
  });

  // Prompt del sistema
  const systemPrompt = `
Eres el asistente virtual de Manolo Gastrobar, un restaurante que hace domicilios en Neiva.
Tu trabajo es tomar pedidos por WhatsApp de manera amable y eficiente.

${nombreCliente ? `El cliente se llama ${nombreCliente}, ya ha pedido antes. Salúdalo por su nombre.` : 'Es un cliente nuevo, pregúntale su nombre al inicio.'}

HORARIO DE ATENCIÓN:
- Lunes, martes, jueves y viernes: 7am a 3pm
- Sábado y domingo: 8am a 4pm
- Miércoles: cerrado

DOMICILIO:
- El domiciliario cobra dependiendo de la distancia

MENÚ CON PRECIOS (consulta en: https://manologastrobar.com/):
- Usa este link si el cliente quiere ver el menú completo
- Los precios del menú están en la página web

DESECHABLES:
- Cada desechable donde va la comida tiene un costo adicional de $1.000
- Los cubiertos desechables NO tienen costo adicional

FLUJO DE LA CONVERSACIÓN:
1. Saluda al cliente y pregúntale su nombre (si es nuevo)
2. Pregúntale si ya sabe qué quiere pedir o si quiere ver el menú
3. Si quiere el menú, envíale este link: https://manologastrobar.com/
4. Toma el pedido completo (productos y cantidades)
5. Pregunta si necesita desechables (menciona que cada uno cuesta $1.000)
6. Pide la dirección de entrega
7. Confirma el pedido con un resumen incluyendo subtotal + desechables si aplica

IMPORTANTE:
- Cuando tengas el pedido completo con dirección, responde EXACTAMENTE en este formato al final:
PEDIDO_LISTO|nombre del cliente|dirección|producto1 x cantidad, producto2 x cantidad|total
- Sé amable, usa emojis ocasionalmente
- Si preguntan por el costo del domicilio di: "El domiciliario cobra dependiendo de la distancia 🛵"
- Si preguntan por el horario, informa el horario completo
`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversaciones[numero]
      ],
      max_tokens: 500
    });

    const respuesta = response.choices[0].message.content;

    // Agregar respuesta al historial
    conversaciones[numero].push({
      role: 'assistant',
      content: respuesta
    });

    // Detectar si el pedido está listo
    if (respuesta.includes('PEDIDO_LISTO')) {
      await guardarPedido(numero, respuesta, nombreCliente);
    }

    // Limpiar el tag antes de enviar al cliente
    return respuesta.replace(/PEDIDO_LISTO\|.*$/s, '').trim();

  } catch (error) {
    console.error('Error con Groq:', error);
    return 'Lo siento, tuve un problema. ¿Puedes repetir tu mensaje? 🙏';
  }
}

async function guardarPedido(numero, respuesta, nombreCliente) {
  try {
    // Extraer datos del formato PEDIDO_LISTO
    const match = respuesta.match(/PEDIDO_LISTO\|(.+)\|(.+)\|(.+)\|(.+)/);
    if (!match) return;

    const [, nombre, direccion, productos, total] = match;

    // Guardar o actualizar cliente
    let clienteId;
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('whatsapp', numero)
      .single();

    if (clienteExistente) {
      clienteId = clienteExistente.id;
    } else {
      const { data: nuevoCliente } = await supabase
        .from('clientes')
        .insert({ nombre: nombre.trim(), whatsapp: numero })
        .select('id')
        .single();
      clienteId = nuevoCliente.id;
    }

    // Guardar pedido
    const totalNumerico = parseFloat(total.replace(/[^0-9.]/g, '')) || 0;
    const { data: pedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_id: clienteId,
        direccion: direccion.trim(),
        estado: 'recibido',
        total: totalNumerico
      })
      .select('id')
      .single();

    // Guardar items del pedido
    const items = productos.split(',').map(item => {
      const partes = item.trim().split(' x ');
      return {
        pedido_id: pedido.id,
        nombre_producto: partes[0].trim(),
        cantidad: parseInt(partes[1]) || 1,
        precio_unitario: 0
      };
    });

    await supabase.from('items_pedido').insert(items);

    console.log('✅ Pedido guardado correctamente');
  } catch (error) {
    console.error('Error guardando pedido:', error);
  }
}

module.exports = { procesarMensaje };