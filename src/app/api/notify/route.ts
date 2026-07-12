import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Inicializa Resend con la variable de entorno.
// Si no existe, usamos una key falsa (mock) para evitar que crashee en desarrollo.
const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key_12345');

export async function POST(request: Request) {
  try {
    const { senderName, recipientEmail, recipientName, type, code } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json({ error: 'Falta email del destinatario' }, { status: 400 });
    }

    const isTransfer = type === 'transfer';

    // Modo Mock: Si el usuario no ha puesto su RESEND_API_KEY en Vercel, simulamos el envío en consola.
    if (!process.env.RESEND_API_KEY) {
      console.log(`[MOCK EMAIL] Para: ${recipientEmail} | Asunto: ${isTransfer ? 'Transferencia' : 'Mensaje'}`);
      return NextResponse.json({ success: true, mock: true, message: 'Correo simulado (Falta RESEND_API_KEY)' });
    }

    const subject = isTransfer 
      ? `Tu código de transferencia BlueChat es: ${code}` 
      : `¡Tienes nuevos mensajes de ${senderName}!`;

    const htmlContent = isTransfer ? `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">BlueChat Seguridad</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff; text-align: center;">
            <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">Transferencia de Sesión</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">
              Se ha detectado un inicio de sesión en un nuevo dispositivo. Usa el siguiente código para transferir todos tus chats a tu nueva sesión:
            </p>
            <div style="margin: 30px 0;">
              <span style="background-color: #f1f5f9; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0f172a; border-radius: 12px;">${code}</span>
            </div>
            <p style="color: #ef4444; font-size: 13px;">Si no solicitaste esto, ignora este correo.</p>
          </div>
        </div>
    ` : `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">BlueChat</h1>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">¡Hola, ${recipientName}!</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">
              <strong>${senderName}</strong> te acaba de enviar mensajes privados mientras estabas desconectado.
            </p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://blue-chat-lemon.vercel.app/" style="background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">Abrir Chat</a>
            </div>
          </div>
        </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'BlueChat Seguridad <onboarding@resend.dev>',
      to: recipientEmail,
      subject: subject,
      html: htmlContent
    });

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
