import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Inicializa Resend con la variable de entorno.
// Si no existe, usamos una key falsa (mock) para evitar que crashee en desarrollo.
const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key_12345');

export async function POST(request: Request) {
  try {
    const { senderName, recipientEmail, recipientName } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json({ error: 'Falta email del destinatario' }, { status: 400 });
    }

    // Modo Mock: Si el usuario no ha puesto su RESEND_API_KEY en Vercel, simulamos el envío en consola.
    if (!process.env.RESEND_API_KEY) {
      console.log(`[MOCK EMAIL] Para: ${recipientEmail} | De: ${senderName} | Asunto: Tienes mensajes nuevos en BlueChat`);
      return NextResponse.json({ success: true, mock: true, message: 'Correo simulado (Falta RESEND_API_KEY)' });
    }

    const { data, error } = await resend.emails.send({
      from: 'BlueChat Notificaciones <onboarding@resend.dev>', // Correo de prueba de Resend
      to: recipientEmail,
      subject: `¡Tienes nuevos mensajes de ${senderName}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">BlueChat</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">¡Hola, ${recipientName}!</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">
              <strong>${senderName}</strong> te acaba de enviar mensajes privados mientras estabas desconectado.
            </p>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">
              Entra a la aplicación para leerlos y responder de forma cifrada y segura.
            </p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://blue-chat-lemon.vercel.app/" style="background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">Abrir Chat</a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
            Este es un correo automático. Por tu privacidad, BlueChat no guarda el contenido de tus mensajes en la nube.
          </div>
        </div>
      `
    });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
