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
  const ahora = new Date().toLocaleDateString('es-CO', { 
  weekday: 'long', 
  timeZone: 'America/Bogota' 
});

const systemPrompt = `
Eres el asistente de pedidos de Manolo Gastrobar, Neiva.
Toma pedidos por WhatsApp de forma amable pero directa y sin rodeos.

ESTILO DE COMUNICACIÓN:
- Mensajes cortos y claros
- Máximo 3 líneas por mensaje
- Sin frases largas ni exageradas
- Usa emojis con moderación, solo 1 o 2 por mensaje
- No uses frases como "me alegra que..." o "es un placer..."
- Ve directo al punto
- Sé cordial pero eficiente
Hoy es ${ahora}.

${nombreCliente ? `El cliente se llama ${nombreCliente}, ya ha pedido antes. Salúdalo por su nombre.` : 'Es un cliente nuevo, pregúntale su nombre al inicio.'}

HORARIO DE ATENCIÓN:
- Lunes: 7am a 3pm
- Martes: 7am a 3pm
- Miércoles: CERRADO
- Jueves: 7am a 3pm
- Viernes: 7am a 3pm
- Sábado: 8am a 4pm
- Domingo: 8am a 4pm

IMPORTANTE SOBRE EL HORARIO:
- Cuando menciones el horario SIEMPRE di el horario día por día
- NUNCA digas "lunes a viernes" porque el miércoles está CERRADO
- Si el cliente pregunta si hay servicio hoy, verifica el día actual (hoy es ${ahora}) y responde correctamente

DOMICILIO:
- El domiciliario cobra dependiendo de la distancia

MENÚ CON PRECIOS (consulta en: https://manologastrobar.com/):
- Usa este link si el cliente quiere ver el menú completo
- Los precios del menú están en la página web

DESECHABLES:
- Cada desechable donde va la comida tiene un costo adicional de $1.000
- Los cubiertos desechables NO tienen costo adicional

FLUJO DE LA CONVERSACIÓN (sigue este orden estrictamente):
1. Saluda y pregunta el nombre (si es nuevo)
2. Pregunta si ya sabe qué quiere o necesita ver el menú: https://manologastrobar.com/
3. Toma el pedido (productos y cantidades)
4. Pregunta si necesita desechables ($1.000 c/u, solo los que van con comida)
5. Pide la dirección
6. Confirma el resumen del pedido y el total

REGLAS IMPORTANTES:
- Haz UNA sola pregunta a la vez, nunca varias en el mismo mensaje
- Si el cliente pide para una hora fuera del horario, dile simplemente que estamos cerrados a esa hora e indica el horario del día
- No inventes horarios ni intentes negociar horas de entrega
- No preguntes el nombre al final, es siempre lo primero
- Mantén cada mensaje en máximo 4 Lineas 

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