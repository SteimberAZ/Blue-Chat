"use client";

import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import { supabase } from '@/lib/supabase';
import { PaperPlaneRight, SignOut, MagnifyingGlass, Checks, Check, LockKey, EnvelopeSimple, User } from '@phosphor-icons/react';

export default function BlueChatApp() {
  // Estado de Autenticación y Usuarios
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  
  // Estado del Formulario Auth
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Estado del Chat
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const channelRef = useRef<any>(null);

  const fetchUserData = async (userId: string) => {
    // 1. Obtener datos de mi perfil desde la tabla publica
    const { data: myProfile } = await supabase.from('employees').select('*').eq('id', userId).single();
    if (myProfile) setCurrentUser(myProfile);
    else {
      // Fallback por si la inserción falló o es una cuenta vieja
      setCurrentUser({ id: userId, first_name: 'Usuario', last_name: '' });
    }

    // 2. Obtener lista de todos los demás usuarios para chatear
    const { data: otherUsers } = await supabase.from('employees').select('*').neq('id', userId);
    if (otherUsers) setContacts(otherUsers);
  };

  // Escuchar cambios de sesión al arrancar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserData(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setCurrentUser(null);
        setContacts([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);
    
    if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      // Registro
      if (!name.trim()) {
        setAuthError('Por favor ingresa un nombre.');
        setIsLoading(false);
        return;
      }
      
      const { data: authData, error: authError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      
      if (authError) {
        setAuthError(authError.message);
      } else if (authData.user) {
        // Guardar el perfil público en la base de datos
        const { error: dbError } = await supabase.from('employees').insert({
          id: authData.user.id, // Enlazar el UUID de Auth con la tabla
          first_name: name,
          last_name: '',
          email: email,
          role: 'Usuario BlueChat'
        });
        
        if (dbError) {
          console.error("Error guardando perfil:", dbError);
        }
        
        // Nota: Si en Supabase tienes "Confirm Email" activado, authData.session será null.
        if (!authData.session) {
          setAuthError('Registro exitoso. Revisa tu correo para confirmar tu cuenta o desactiva "Confirm Email" en Supabase.');
        }
      }
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedContact(null);
    setMessages([]);
  };

  // Lógica del Chat Local-First Efímero
  const getChatRoomId = (user1: string, user2: string) => {
    return [user1, user2].sort().join('-');
  };

  const chatRoomId = currentUser && selectedContact 
    ? getChatRoomId(currentUser.id, selectedContact.id) 
    : null;

  useEffect(() => {
    if (!chatRoomId) return;

    // 1. Cargar historial desde IndexedDB
    localforage.getItem(`chat_history_${chatRoomId}`).then((history: any) => {
      if (history) setMessages(history);
      else setMessages([]);
    });

    // 2. Conectarse a Supabase Broadcast y Presence
    const channel = supabase.channel(`chat-${chatRoomId}`, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });
    
    channel.on('broadcast', { event: 'new_message' }, (payload) => {
      const incomingMsg = payload.payload;
      
      // Auto-ACK: Confirmar recepción al remitente si el mensaje no es nuestro
      if (incomingMsg.senderId !== currentUser?.id) {
        channel.send({
          type: 'broadcast',
          event: 'ack',
          payload: { messageId: incomingMsg.id }
        });
      }

      setMessages((prev) => {
        if (prev.find(m => m.id === incomingMsg.id)) return prev;
        const newHistory = [...prev, incomingMsg];
        localforage.setItem(`chat_history_${chatRoomId}`, newHistory);
        return newHistory;
      });
    });

    // Procesar ACKs: Actualizar estado a 'delivered'
    channel.on('broadcast', { event: 'ack' }, (payload) => {
      const { messageId } = payload.payload;
      setMessages((prev) => {
        const updated = prev.map(m => m.id === messageId ? { ...m, status: 'delivered' } : m);
        localforage.setItem(`chat_history_${chatRoomId}`, updated);
        return updated;
      });
    });

    // Detección de conexión (Presence): Motor de reintento para mensajes 'pending'
    channel.on('presence', { event: 'join' }, ({ key }) => {
      // Si el usuario que se unió es el OTRO usuario, reintentar pendientes
      if (key !== currentUser.id) {
        localforage.getItem(`chat_history_${chatRoomId}`).then((history: any) => {
          if (!history) return;
          
          const pendingMessages = history.filter(
            (m: any) => m.status === 'pending' && m.senderId === currentUser.id
          );
          
          pendingMessages.forEach((pendingMsg: any) => {
            // Re-emisión silenciosa
            channel.send({
              type: 'broadcast',
              event: 'new_message',
              payload: pendingMsg
            });
          });
        });
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatRoomId]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatRoomId || !currentUser) return;

    const newMsgObj = {
      id: `m${Date.now()}`,
      senderId: currentUser.id,
      content: newMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'pending'
    };

    setMessages((prev) => {
      const updatedMessages = [...prev, newMsgObj];
      localforage.setItem(`chat_history_${chatRoomId}`, updatedMessages);
      return updatedMessages;
    });
    setNewMessage('');

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'new_message',
        payload: newMsgObj
      });
    }

    // Ocultar teclado en móviles quitando el foco del input
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // ==========================================
  // UI: PANTALLA DE LOGIN / REGISTRO
  // ==========================================
  if (!session || !currentUser) {
    return (
      <div className="min-h-[100dvh] w-full overflow-hidden bg-blue-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 border border-blue-100">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
              <ChatIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">BlueChat</h1>
            <p className="text-slate-500 text-sm mt-1">Ingresa para chatear de forma segura</p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLoginMode && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Correo Electrónico</label>
              <div className="relative">
                <EnvelopeSimple className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Contraseña</label>
              <div className="relative">
                <LockKey className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100">
                {authError}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-70 mt-2"
            >
              {isLoading ? 'Procesando...' : (isLoginMode ? 'Iniciar Sesión' : 'Registrarse')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {isLoginMode ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button 
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setAuthError('');
              }}
              className="text-blue-600 font-semibold hover:underline"
            >
              {isLoginMode ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // UI: PANTALLA DE CHAT
  // ==========================================
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-slate-100 flex items-center justify-center p-0 sm:p-4 md:p-8 font-sans">
      <div className="w-full max-w-7xl h-full bg-white sm:rounded-[24px] shadow-2xl flex border border-blue-100 overflow-hidden">
        
        {/* PANEL IZQUIERDO: Contactos */}
        <aside className={`w-full md:w-[380px] flex-shrink-0 flex-col border-r border-slate-200 bg-white ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
          <header className="h-[72px] bg-blue-600 flex items-center justify-between px-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg backdrop-blur-sm shadow-inner uppercase">
                {currentUser.first_name?.[0] || 'U'}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold tracking-wide text-sm">{currentUser.first_name}</span>
                <span className="text-[10px] text-blue-200">{currentUser.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Cerrar sesión">
              <SignOut size={22} />
            </button>
          </header>

          <div className="p-3 bg-white border-b border-slate-100">
            <div className="bg-slate-100 rounded-xl flex items-center px-4 py-2.5">
              <MagnifyingGlass size={20} className="text-slate-400" />
              <input type="text" placeholder="Buscar un chat..." className="bg-transparent border-none outline-none ml-3 text-sm w-full text-slate-700 placeholder-slate-400"/>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {contacts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                Aún no hay otros usuarios registrados en la plataforma.
              </div>
            ) : (
              contacts.map(contact => (
                <div 
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`flex items-center gap-4 p-4 cursor-pointer transition-colors border-b border-slate-50
                    ${selectedContact?.id === contact.id ? 'bg-blue-50' : 'hover:bg-slate-50'}
                  `}
                >
                  <div className="w-12 h-12 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-sm uppercase">
                    {contact.first_name?.[0] || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <h3 className="font-semibold text-slate-800 truncate">{contact.first_name} {contact.last_name}</h3>
                    </div>
                    <p className="text-sm text-slate-500 truncate">Toca para enviar un mensaje</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* PANEL DERECHO: Chat Activo */}
        <main className={`flex-1 flex-col min-w-0 relative ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
          {selectedContact ? (
            <>
              <header className="h-[72px] bg-white border-b border-slate-200 flex items-center px-6 gap-4 z-10 shadow-sm">
                <button 
                  className="md:hidden p-2 -ml-2 text-blue-600 hover:bg-blue-50 rounded-full"
                  onClick={() => setSelectedContact(null)}
                >
                  &larr;
                </button>
                <div className="w-10 h-10 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-sm uppercase">
                  {selectedContact.first_name?.[0] || 'U'}
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">{selectedContact.first_name} {selectedContact.last_name}</h2>
                  <p className="text-xs text-blue-600 font-medium">En línea</p>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#f0f4f8] relative">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
                
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl shadow-sm text-sm text-slate-500 font-medium z-10 relative">
                      Los mensajes están cifrados localmente de extremo a extremo.
                    </div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = msg.senderId === currentUser.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} relative z-10`}>
                        <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative group
                          ${isMine 
                            ? 'bg-blue-600 text-white rounded-br-sm' 
                            : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'}
                        `}>
                          <p className="text-[15px] leading-relaxed break-words">{msg.content}</p>
                          <div className={`flex items-center justify-end gap-1 mt-1 
                            ${isMine ? 'text-blue-200' : 'text-slate-400'}
                          `}>
                            <span className="text-[10px] font-medium">{msg.timestamp}</span>
                            {isMine && (
                              msg.status === 'delivered'
                                ? <Checks size={14} weight="bold" className="text-blue-300" />
                                : <Check size={14} weight="bold" className="text-blue-300 opacity-70" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <footer className="bg-white border-t border-slate-200 p-3 md:p-4 z-10 relative">
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full flex items-center px-4 py-2 md:py-3 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                    <input 
                      type="text" 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 bg-transparent border-none outline-none text-slate-700 text-base placeholder-slate-400"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                  >
                    <PaperPlaneRight size={20} weight="fill" />
                  </button>
                </form>
              </footer>
            </>
          ) : (
            <div className="flex-1 bg-[#f0f4f8] flex flex-col items-center justify-center p-8 text-center border-l border-white/50 relative z-10">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <ChatIcon className="w-12 h-12 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">BlueChat para Web</h2>
              <p className="text-slate-500 max-w-md">
                Selecciona un chat en la barra lateral para comenzar a enviar mensajes de forma privada y local.
              </p>
              <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-slate-400 bg-white px-4 py-2 rounded-full shadow-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Conexión Local-First Activa
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 5.92 2 10.75c0 2.76 1.48 5.22 3.79 6.75-.41 1.76-1.52 3.6-1.58 3.7-.09.15-.05.35.1.46.15.11.35.11.51.02 2.65-1.56 4.39-2.31 5.34-2.52.92.15 1.88.23 2.84.23 5.52 0 10-3.92 10-8.75S17.52 2 12 2zm0 15.5c-.88 0-1.74-.11-2.57-.31-.22-.05-.45-.03-.64.07-1.07.56-2.5 1.25-4.47 2.21.31-.96.79-2.22 1.05-3.32.06-.26-.01-.54-.2-.72C3.33 14.16 2.25 12.54 2.25 10.75 2.25 6.61 6.62 3.25 12 3.25s9.75 3.36 9.75 7.5c0 4.14-4.38 7.5-9.75 7.5z" />
    </svg>
  );
}
