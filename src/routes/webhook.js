const express = require('express');
const router = express.Router();
const { procesarMensaje } = require('../bot/conversacion');
const twilio = require('twilio');

router.post('/', async (req, res) => {
  const { Body, From } = req.body;
  const numeroCliente = From.replace('whatsapp:', '');
  console.log(`📩 Mensaje de ${numeroCliente}: ${Body}`);
  
  try {
    const respuesta = await procesarMensaje(numeroCliente, Body);

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(respuesta);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).send('Error interno');
  }
});

module.exports = router;