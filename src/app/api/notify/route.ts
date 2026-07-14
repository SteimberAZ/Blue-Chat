import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No autorizado. Falta token.' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 });
    }

    const { senderName, recipientEmail, recipientName, type, code } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json({ error: 'Falta email del destinatario' }, { status: 400 });
    }
    
    if (type === 'transfer' && user.email !== recipientEmail) {
       return NextResponse.json({ error: 'No autorizado para enviar a otro correo' }, { status: 403 });
    }

    const isTransfer = type === 'transfer';

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

    // NOTA: Brevo requiere que el correo "from" esté verificado en tu cuenta.
    const info = await transporter.sendMail({
      from: `"BlueChat" <${process.env.SMTP_FROM_EMAIL || 'notificaciones@bluechat.com'}>`, 
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
    });

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error("SMTP Error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
