"use client";

import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import { supabase } from '@/lib/supabase';
import { PaperPlaneRight, SignOut, MagnifyingGlass, Checks, Check, LockKey, EnvelopeSimple, User, CaretDown, UserPlus, CheckCircle, X, IdentificationCard, List, Bell, Users, Trash } from '@phosphor-icons/react';

export default function BlueChatApp() {
  // Estado de Autenticación y Usuarios
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [chatMeta, setChatMeta] = useState<Record<string, any>>({});
  
  // Estado del Formulario Auth
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [shortId, setShortId] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Estado del modal de amigos
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactProfile, setContactProfile] = useState<any>(null); // Perfil clickeado
  const [searchUsername, setSearchUsername] = useState('');
  const [searchShortId, setSearchShortId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [editingNickname, setEditingNickname] = useState('');
  
  // Interfaz Menú
  const [showMenu, setShowMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<'pending' | 'sent' | 'profile' | 'contacts' | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [hiddenChats, setHiddenChats] = useState<string[]>([]);
  const [contactModalSearch, setContactModalSearch] = useState('');

  // Estado del Chat Activo
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadInChat, setUnreadInChat] = useState(0);
  const prevMessagesLength = useRef(0);
  
  // Refs para evitar problemas de stale-closures en los listeners globales
  const selectedContactRef = useRef<any>(null);
  useEffect(() => { selectedContactRef.current = selectedContact; }, [selectedContact]);
  
  const channelsRef = useRef<Record<string, any>>({});
  const roomWritePromises = useRef<Record<string, Promise<void>>>({}); 
  const onlineUsersRef = useRef<Record<string, boolean>>({}); 
  const globalChannelRef = useRef<any>(null);

  const getChatRoomId = (user1: string, user2: string) => {
    return [user1, user2].sort().join('-');
  };

  // Escuchar cambios de sesión al arrancar
  useEffect(() => {
    localforage.getItem('user_nicknames').then((data: any) => {
      if (data) setNicknames(data);
    });
    localforage.getItem('hidden_chats').then((data: any) => {
      if (data) setHiddenChats(data);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserData(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user);
      } else {
        setCurrentUser(null);
        setContacts([]);
        setPendingRequests([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchFriends = async (userId: string) => {
    const { data: contactLinks } = await supabase.from('contacts').select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    
    if (contactLinks) {
      const acceptedIds = contactLinks.filter((c:any) => c.status === 'accepted').map((c:any) => c.sender_id === userId ? c.receiver_id : c.sender_id);
      const pendingSenderIds = contactLinks.filter((c:any) => c.status === 'pending' && c.receiver_id === userId).map((c:any) => c.sender_id);
      const pendingSentIds = contactLinks.filter((c:any) => c.status === 'pending' && c.sender_id === userId).map((c:any) => c.receiver_id);

      let acceptedUsers: any[] = [];
      if (acceptedIds.length > 0) {
        const { data } = await supabase.from('employees').select('*').in('id', acceptedIds);
        acceptedUsers = data || [];
        setContacts(prev => {
          const prevIds = prev.map(p => p.id).sort().join(',');
          const newIds = acceptedUsers.map(n => n.id).sort().join(',');
          return prevIds !== newIds ? acceptedUsers : prev;
        });
      } else {
        setContacts([]);
      }

      if (pendingSenderIds.length > 0) {
        const { data: pendingUsers } = await supabase.from('employees').select('*').in('id', pendingSenderIds);
        if (pendingUsers) {
          setPendingRequests(prev => {
            const prevIds = prev.map(p => p.id).sort().join(',');
            const newIds = pendingUsers.map(n => n.id).sort().join(',');
            return prevIds !== newIds ? pendingUsers : prev;
          });
        }
      } else {
        setPendingRequests([]);
      }

      if (pendingSentIds.length > 0) {
        const { data: sentUsers } = await supabase.from('employees').select('*').in('id', pendingSentIds);
        if (sentUsers) {
          setSentRequests(prev => {
            const prevIds = prev.map(p => p.id).sort().join(',');
            const newIds = sentUsers.map(n => n.id).sort().join(',');
            return prevIds !== newIds ? sentUsers : prev;
          });
        }
      } else {
        setSentRequests([]);
      }

      // Cargar metadatos para la bandeja de entrada de los usuarios aceptados
      const metaObj: Record<string, any> = {};
      for (const user of acceptedUsers) {
        const roomId = getChatRoomId(userId, user.id);
        const history: any = await localforage.getItem(`chat_history_${roomId}`);
        const unread: any = await localforage.getItem(`unread_${roomId}`);
        
        metaObj[user.id] = {
          lastMessage: history && history.length > 0 ? history[history.length - 1] : null,
          unreadCount: unread || 0
        };
      }
      setChatMeta(metaObj);
    }
  };

  const fetchUserData = async (user: any) => {
    const userId = user.id;
    const { data: myProfile } = await supabase.from('employees').select('*').eq('id', userId).single();
    
    if (myProfile) {
      setCurrentUser(myProfile);
    } else {
      const firstName = user.user_metadata?.first_name || 'Usuario';
      const userShortId = user.user_metadata?.short_id || '0000';
      const newProfile = {
        id: userId,
        first_name: firstName,
        last_name: '',
        email: user.email,
        role: 'Usuario BlueChat',
        short_id: userShortId
      };
      
      const { error } = await supabase.from('employees').insert(newProfile);
      
      if (!error) {
        setCurrentUser(newProfile);
      } else {
        setCurrentUser({ id: userId, first_name: firstName, last_name: '', short_id: userShortId });
      }
    }

    await fetchFriends(userId);
  };

  // Autocompletado de Búsqueda
  useEffect(() => {
    if (!showAddContact || !currentUser) return;
    if (searchUsername.length < 1 && searchShortId.length === 0) {
      setSearchResults([]);
      return;
    }
    
    const doSearch = async () => {
      let query = supabase.from('employees').select('*').neq('id', currentUser.id);
      if (searchUsername) query = query.ilike('first_name', `%${searchUsername}%`);
      if (searchShortId) query = query.eq('short_id', searchShortId);
      
      const { data } = await query.limit(5);
      setSearchResults(data || []);
    };
    
    const timeout = setTimeout(doSearch, 300);
    return () => clearTimeout(timeout);
  }, [searchUsername, searchShortId, showAddContact, currentUser]);

  useEffect(() => {
    if (contactProfile) {
      setEditingNickname(nicknames[contactProfile.id] || '');
    }
  }, [contactProfile, nicknames]);

  const saveNickname = async () => {
    if (!contactProfile) return;
    const updated: Record<string, string> = { ...nicknames, [contactProfile.id]: editingNickname.trim() };
    if (!editingNickname.trim()) delete updated[String(contactProfile.id)];
    setNicknames(updated);
    await localforage.setItem('user_nicknames', updated);
  };

  const getDisplayName = (contact: any) => {
    if (!contact) return '';
    return nicknames[contact.id] || contact.first_name;
  };

  // Escuchar a actualizaciones de la red (Polling fallback + WebSocket)
  useEffect(() => {
    if (!currentUser) return;
    
    const channel = supabase.channel('global_notifications');
    channel.on('broadcast', { event: 'network_update' }, () => {
      fetchFriends(currentUser.id);
    }).subscribe();
    
    globalChannelRef.current = channel;

    const interval = setInterval(() => fetchFriends(currentUser.id), 8000);

    return () => { 
      supabase.removeChannel(channel);
      globalChannelRef.current = null;
      clearInterval(interval);
    };
  }, [currentUser]);

  const notifyNetwork = () => {
    if (globalChannelRef.current) {
      globalChannelRef.current.send({ type: 'broadcast', event: 'network_update', payload: {} });
    }
  };

  // Suscripción Global a canales de chat
  useEffect(() => {
    if (!currentUser || contacts.length === 0) return;

    contacts.forEach(contact => {
      const roomId = getChatRoomId(currentUser.id, contact.id);
      if (channelsRef.current[roomId]) return;

      const channel = supabase.channel(`chat-${roomId}`, {
        config: { presence: { key: currentUser.id } }
      });

      channel.on('broadcast', { event: 'new_message' }, (payload) => {
        const incomingMsg = payload.payload;
        if (incomingMsg.senderId !== currentUser.id) {
          channel.send({ type: 'broadcast', event: 'ack', payload: { messageId: incomingMsg.id } });
        }

        const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
        roomWritePromises.current[roomId] = prevPromise.then(async () => {
          let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
          if (history.find((m:any) => m.id === incomingMsg.id)) return;
          
          history = [...history, incomingMsg];
          history.sort((a: any, b: any) => a.createdAt - b.createdAt);
          
          await localforage.setItem(`chat_history_${roomId}`, history);

          if (selectedContactRef.current?.id === contact.id) {
            setMessages(history);
            await localforage.setItem(`unread_${roomId}`, 0);
            setChatMeta(prev => ({ ...prev, [contact.id]: { lastMessage: incomingMsg, unreadCount: 0 } }));
          } else {
            const currentUnread: any = (await localforage.getItem(`unread_${roomId}`)) || 0;
            const newUnread = incomingMsg.senderId !== currentUser.id ? currentUnread + 1 : currentUnread;
            await localforage.setItem(`unread_${roomId}`, newUnread);
            setChatMeta(prev => ({ ...prev, [contact.id]: { lastMessage: incomingMsg, unreadCount: newUnread } }));
          }
          
          setHiddenChats(prev => {
            if (prev.includes(contact.id)) {
              const updated = prev.filter(id => id !== contact.id);
              localforage.setItem('hidden_chats', updated);
              return updated;
            }
            return prev;
          });
        });
      });

      channel.on('broadcast', { event: 'ack' }, (payload) => {
        const { messageId } = payload.payload;
        const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
        roomWritePromises.current[roomId] = prevPromise.then(async () => {
          let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
          const updated = history.map((m:any) => m.id === messageId ? { ...m, status: 'delivered' } : m);
          await localforage.setItem(`chat_history_${roomId}`, updated);
          
          if (selectedContactRef.current?.id === contact.id) setMessages(updated);
          
          const lastMsg = updated[updated.length - 1];
          setChatMeta(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], lastMessage: lastMsg } }));
        });
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        onlineUsersRef.current[roomId] = Object.keys(state).includes(contact.id);
      });

      channel.on('presence', { event: 'join' }, ({ key }) => {
        if (key !== currentUser.id) {
          setTimeout(() => {
            localforage.getItem(`chat_history_${roomId}`).then((history: any) => {
              if (!history) return;
              const pending = history.filter((m: any) => m.status === 'pending' && m.senderId === currentUser.id);
              pending.forEach((pMsg: any) => channel.send({ type: 'broadcast', event: 'new_message', payload: pMsg }));
            });
          }, 800);
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
          setTimeout(() => {
            localforage.getItem(`chat_history_${roomId}`).then((history: any) => {
              if (!history) return;
              const pending = history.filter((m: any) => m.status === 'pending' && m.senderId === currentUser.id);
              pending.forEach((pMsg: any) => channel.send({ type: 'broadcast', event: 'new_message', payload: pMsg }));
            });
          }, 800);
        }
      });

      channelsRef.current[roomId] = channel;
    });

    return () => {
      Object.values(channelsRef.current).forEach((ch: any) => supabase.removeChannel(ch));
      channelsRef.current = {};
    };
  }, [currentUser, contacts]);



  const sendFriendRequest = async (targetId: string) => {
    const { data: existing } = await supabase.from('contacts').select('*')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`);
    
    if (existing && existing.length > 0) {
       alert("Ya existe una solicitud o amistad con este usuario.");
       return;
    }

    await supabase.from('contacts').insert({ sender_id: currentUser.id, receiver_id: targetId, status: 'pending' });
    notifyNetwork();
    alert("Solicitud enviada!");
    setShowAddContact(false);
    setSearchUsername('');
    setSearchShortId('');
  };

  const acceptRequest = async (senderId: string) => {
    await supabase.from('contacts').update({ status: 'accepted' }).match({ sender_id: senderId, receiver_id: currentUser.id });
    notifyNetwork();
    fetchFriends(currentUser.id);
  };

  const rejectRequest = async (senderId: string) => {
    await supabase.from('contacts').delete().match({ sender_id: senderId, receiver_id: currentUser.id });
    setPendingRequests(prev => prev.filter(u => u.id !== senderId));
  };

  const cancelSentRequest = async (targetId: string) => {
    await supabase.from('contacts').delete().match({ sender_id: currentUser.id, receiver_id: targetId });
    setSentRequests(prev => prev.filter(u => u.id !== targetId));
    notifyNetwork();
  };

  const deleteContact = async (contactId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar a este contacto? Ya no podrán enviarse mensajes.")) return;
    
    await supabase.from('contacts').delete()
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${currentUser.id})`);
    
    notifyNetwork();
    fetchFriends(currentUser.id);
    setContactProfile(null);
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
    }
  };

  const clearChatHistory = async (contactId: string) => {
    if (!confirm("¿Seguro que deseas borrar este chat? Desaparecerá de tu lista, pero seguirán siendo contactos.")) return;
    const roomId = getChatRoomId(currentUser.id, contactId);
    await localforage.removeItem(`chat_history_${roomId}`);
    await localforage.removeItem(`unread_${roomId}`);
    
    setChatMeta(prev => {
      const updated = { ...prev };
      delete updated[contactId];
      return updated;
    });
    
    const newHidden = [...hiddenChats, contactId];
    setHiddenChats(newHidden);
    await localforage.setItem('hidden_chats', newHidden);
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
    }
  };


  const handleSelectContact = async (contact: any) => {
    setSelectedContact(contact);
    const roomId = getChatRoomId(currentUser.id, contact.id);
    const history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
    
    prevMessagesLength.current = 0; 
    setMessages(history);
    setShowScrollButton(false);
    setUnreadInChat(0);
    
    await localforage.setItem(`unread_${roomId}`, 0);
    setChatMeta(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], unreadCount: 0 } }));
  };

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNotAtBottom = scrollHeight - scrollTop - clientHeight > 150;
    setShowScrollButton(isNotAtBottom);
    if (!isNotAtBottom) setUnreadInChat(0);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
      setUnreadInChat(0);
      setShowScrollButton(false);
    }
  };

  useEffect(() => {
    if (!chatContainerRef.current || messages.length === 0) return;
    const isNewMessage = messages.length > prevMessagesLength.current && prevMessagesLength.current > 0;
    prevMessagesLength.current = messages.length;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.senderId === currentUser?.id;

    if (isNewMessage) {
      if (isMine || (scrollHeight - scrollTop - clientHeight < 400)) {
        setTimeout(scrollToBottom, 50); 
      } else {
        setUnreadInChat(prev => prev + 1);
        setShowScrollButton(true);
      }
    } else if (messages.length > 0 && scrollTop === 0) {
      chatContainerRef.current.scrollTop = scrollHeight;
    }
  }, [messages, currentUser]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact || !currentUser) return;

    const roomId = getChatRoomId(currentUser.id, selectedContact.id);
    const newMsgObj = {
      id: `m${Date.now()}`,
      senderId: currentUser.id,
      content: newMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(), 
      status: 'pending'
    };

    setMessages((prev) => {
      const updatedMessages = [...prev, newMsgObj];
      localforage.setItem(`chat_history_${roomId}`, updatedMessages);
      return updatedMessages;
    });
    
    setChatMeta(prev => ({ ...prev, [selectedContact.id]: { ...prev[selectedContact.id], lastMessage: newMsgObj } }));
    setNewMessage('');
    
    setHiddenChats(prev => {
      if (prev.includes(selectedContact.id)) {
        const updated = prev.filter(id => id !== selectedContact.id);
        localforage.setItem('hidden_chats', updated);
        return updated;
      }
      return prev;
    });

    if (channelsRef.current[roomId]) {
      channelsRef.current[roomId].send({ type: 'broadcast', event: 'new_message', payload: newMsgObj });
    }

    if (!onlineUsersRef.current[roomId]) {
      const rateLimitKey = `email_throttle_${selectedContact.id}`;
      const lastSentTime: any = await localforage.getItem(rateLimitKey);
      const now = Date.now();
      if (!lastSentTime || (now - lastSentTime > 3600000)) {
        await localforage.setItem(rateLimitKey, now); 
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderName: currentUser.first_name, recipientEmail: selectedContact.email, recipientName: selectedContact.first_name })
        }).catch(err => console.error(err));
      }
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsLoading(true);
    
    if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      if (!name.trim()) {
        setAuthError('Por favor ingresa un nombre.');
        setIsLoading(false);
        return;
      }
      if (shortId.length !== 4) {
        setAuthError('El ID de usuario debe tener exactamente 4 caracteres.');
        setIsLoading(false);
        return;
      }
      
      const { data: authData, error: authError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { 
          emailRedirectTo: `${window.location.origin}/`,
          data: { first_name: name, short_id: shortId } 
        }
      });
      
      if (authError) setAuthError(authError.message);
      else if (authData.user) {
        if (!authData.session) {
          setAuthSuccess('Registro exitoso. Revisa tu bandeja de entrada o SPAM para confirmar tu correo.');
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

  const sortedContacts = [...contacts].sort((a, b) => {
    const metaA = chatMeta[a.id]?.lastMessage;
    const metaB = chatMeta[b.id]?.lastMessage;
    const timeA = metaA ? (metaA.createdAt || 0) : 0;
    const timeB = metaB ? (metaB.createdAt || 0) : 0;
    return timeB - timeA;
  });

  const filteredContacts = sortedContacts.filter(c => 
    !hiddenChats.includes(c.id) && getDisplayName(c).toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  // UI: LOGIN
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
              <div className="flex gap-2">
                <div className="flex-[2]">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID (4 chars)</label>
                  <div className="relative">
                    <IdentificationCard className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" maxLength={4} value={shortId} onChange={e => setShortId(e.target.value)} placeholder="e.g. 1A2B" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-2 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors text-center uppercase" />
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Correo Electrónico</label>
              <div className="relative">
                <EnvelopeSimple className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ejemplo@correo.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Contraseña</label>
              <div className="relative">
                <LockKey className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
              </div>
            </div>
            {authError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100">{authError}</div>}
            {authSuccess && <div className="p-3 bg-emerald-50 text-emerald-600 text-xs rounded-xl border border-emerald-100">{authSuccess}</div>}
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-70 mt-2">
              {isLoading ? 'Procesando...' : (isLoginMode ? 'Iniciar Sesión' : 'Registrarse')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {isLoginMode ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }} className="text-blue-600 font-semibold hover:underline">
              {isLoginMode ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // UI: CHAT
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-slate-100 flex items-center justify-center p-0 sm:p-4 md:p-8 font-sans">
      
      {/* Modal Perfil de Contacto */}
      {contactProfile && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all" onClick={() => setContactProfile(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs sm:max-w-sm p-6 sm:p-8 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setContactProfile(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors"><X size={20} weight="bold"/></button>
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-4xl sm:text-5xl shadow-xl shadow-blue-500/30 uppercase mb-5 ring-4 ring-white">
               {contactProfile.first_name?.[0] || 'U'}
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">{contactProfile.first_name} {contactProfile.last_name}</h2>
            <p className="text-blue-600 font-bold mb-4 bg-blue-50 px-3 py-1 rounded-full mt-2 inline-block">#{contactProfile.short_id || '0000'}</p>
            
            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 flex flex-col gap-2 text-left">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asignar Apodo</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={editingNickname} 
                  onChange={e => setEditingNickname(e.target.value)} 
                  placeholder="Ej: Jefe, Amor..." 
                  className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button onClick={saveNickname} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">Guardar</button>
              </div>
            </div>

            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 mb-6 flex items-center gap-3">
               <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm"><EnvelopeSimple size={18} /></div>
               <p className="text-sm text-slate-600 font-medium truncate flex-1 text-left">{contactProfile.email}</p>
            </div>
            
            <button 
              onClick={() => deleteContact(contactProfile.id)}
              className="w-full py-3.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <X weight="bold" size={18} /> Eliminar Contacto
            </button>
          </div>
        </div>
      )}

      {/* Modals de Menú */}
      {activeModal === 'profile' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2"><X size={20} weight="bold"/></button>
            <div className="w-24 h-24 bg-gradient-to-tr from-purple-400 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-4xl shadow-xl shadow-purple-500/30 uppercase mb-4 ring-4 ring-white">
               {currentUser.first_name?.[0] || 'U'}
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">{currentUser.first_name} {currentUser.last_name}</h2>
            <p className="text-purple-600 font-bold mb-4 bg-purple-50 px-3 py-1 rounded-full mt-2 inline-block">#{currentUser.short_id || '0000'}</p>
            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
               <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm"><EnvelopeSimple size={18} /></div>
               <p className="text-sm text-slate-600 font-medium truncate flex-1 text-left">{currentUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'pending' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Bell className="text-orange-500" weight="fill"/> Solicitudes Pendientes</h2>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
               {pendingRequests.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No tienes solicitudes pendientes.</p> :
                  pendingRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold">{req.first_name?.[0]}</div>
                          <div>
                             <p className="text-sm font-semibold text-slate-800">{req.first_name}</p>
                             <p className="text-xs text-slate-500">#{req.short_id || '0000'}</p>
                          </div>
                       </div>
                       <div className="flex gap-2">
                          <button onClick={() => acceptRequest(req.id)} className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors"><CheckCircle weight="fill" size={20} /></button>
                          <button onClick={() => rejectRequest(req.id)} className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"><X weight="bold" size={16} /></button>
                       </div>
                    </div>
                  ))
               }
            </div>
          </div>
        </div>
      )}

      {activeModal === 'sent' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><PaperPlaneRight className="text-blue-500" weight="fill"/> Solicitudes Enviadas</h2>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
               {sentRequests.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No has enviado solicitudes.</p> :
                  sentRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">{req.first_name?.[0]}</div>
                          <div>
                             <p className="text-sm font-semibold text-slate-800">{req.first_name}</p>
                             <p className="text-xs text-slate-500">#{req.short_id || '0000'}</p>
                          </div>
                       </div>
                       <button onClick={() => cancelSentRequest(req.id)} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-100 hover:text-red-600 transition-colors">Cancelar</button>
                    </div>
                  ))
               }
            </div>
          </div>
        </div>
      )}

      {activeModal === 'contacts' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Users className="text-emerald-500" weight="fill"/> Todos los contactos</h2>
            
            <div className="bg-slate-100 rounded-xl flex items-center px-4 py-2 mb-4 shrink-0">
              <MagnifyingGlass size={18} className="text-slate-400" />
              <input type="text" value={contactModalSearch} onChange={e => setContactModalSearch(e.target.value)} placeholder="Buscar contacto..." className="bg-transparent border-none outline-none ml-2 text-sm w-full text-slate-700"/>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-[100px] scrollbar-thin">
               {contacts.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Aún no tienes contactos.</p> :
                  [...contacts]
                    .filter(c => getDisplayName(c).toLowerCase().includes(contactModalSearch.toLowerCase()))
                    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
                    .map(contact => (
                    <div key={contact.id} onClick={() => { setActiveModal(null); setContactProfile(contact); }} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                       <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold uppercase shrink-0">{contact.first_name?.[0]}</div>
                       <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{getDisplayName(contact)}</p>
                          <p className="text-xs text-slate-500 truncate">#{contact.short_id || '0000'}</p>
                       </div>
                    </div>
                  ))
               }
            </div>
          </div>
        </div>
      )}

      {/* Modal Añadir Contacto */}
      {showAddContact && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowAddContact(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4">Añadir Contacto</h2>
            <div className="flex gap-2 mb-4">
               <div className="flex-[2]">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Usuario (opcional)</label>
                  <input type="text" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} placeholder="Ej: Alex" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-500" />
               </div>
               <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID (4 chars)</label>
                  <input type="text" maxLength={4} value={searchShortId} onChange={e => setSearchShortId(e.target.value)} placeholder="1A2B" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-500 text-center uppercase" />
               </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
               {searchResults.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Escribe un nombre o ID para buscar.</p>
               ) : (
                  searchResults.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">{user.first_name?.[0]}</div>
                          <div>
                             <p className="text-sm font-semibold text-slate-800">{user.first_name}</p>
                             <p className="text-xs text-slate-500">#{user.short_id || '0000'}</p>
                          </div>
                       </div>
                       <button onClick={() => sendFriendRequest(user.id)} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors">
                          <UserPlus size={18} />
                       </button>
                    </div>
                  ))
               )}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-7xl h-full bg-white sm:rounded-[24px] shadow-2xl flex border border-blue-100 overflow-hidden relative">
        <aside className={`w-full md:w-[380px] flex-shrink-0 flex-col border-r border-slate-200 bg-white ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
          <header className="h-[72px] bg-blue-600 flex items-center justify-between px-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg backdrop-blur-sm shadow-inner uppercase">
                {currentUser.first_name?.[0] || 'U'}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold tracking-wide text-sm">{currentUser.first_name} <span className="opacity-70 font-normal">#{currentUser.short_id || '0000'}</span></span>
                <span className="text-[10px] text-blue-200">{currentUser.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Cerrar sesión">
              <SignOut size={22} />
            </button>
          </header>

          <div className="p-3 bg-white border-b border-slate-100 flex items-center gap-2 relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors relative"
            >
              <List size={22} weight="bold" />
              {pendingRequests.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-white"></span>}
            </button>

            {showMenu && (
              <div className="absolute top-14 left-3 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2">
                <button onClick={() => { setShowMenu(false); setActiveModal('pending'); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3 font-medium"><Bell size={18} className="text-orange-500" weight="fill" /> Pendientes</div>
                  {pendingRequests.length > 0 && <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{pendingRequests.length}</span>}
                </button>
                <button onClick={() => { setShowMenu(false); setActiveModal('sent'); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-medium">
                  <PaperPlaneRight size={18} className="text-blue-500" weight="fill"/> Enviadas
                </button>
                <button onClick={() => { setShowMenu(false); setActiveModal('contacts'); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-medium">
                  <Users size={18} className="text-emerald-500" weight="fill"/> Todos los contactos
                </button>
                <div className="my-1 border-t border-slate-100"></div>
                <button onClick={() => { setShowMenu(false); setActiveModal('profile'); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-medium">
                  <User size={18} className="text-purple-500" weight="fill" /> Mi Perfil
                </button>
              </div>
            )}

            <div className="flex-1 bg-slate-100 rounded-xl flex items-center px-4 py-2.5">
              <MagnifyingGlass size={20} className="text-slate-400" />
              <input type="text" value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)} placeholder="Buscar un chat..." className="bg-transparent border-none outline-none ml-3 text-sm w-full text-slate-700 placeholder-slate-400"/>
            </div>
          </div>
          
          <div className="px-3 pb-3 border-b border-slate-100">
             <button onClick={() => setShowAddContact(true)} className="w-full py-2 bg-blue-50 text-blue-600 font-semibold rounded-lg text-sm hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors">
               <UserPlus size={18} weight="bold" /> Añadir Contacto
             </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                 <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><UserPlus size={32} className="text-slate-400"/></div>
                 <p className="text-sm text-slate-500 font-medium">{chatSearchQuery ? 'No se encontraron chats.' : 'Aún no tienes contactos.'}</p>
                 {!chatSearchQuery && <p className="text-xs text-slate-400 mt-1">Añade amigos para empezar a chatear.</p>}
              </div>
            ) : (
              filteredContacts.map(contact => {
                const meta = chatMeta[contact.id];
                const lastMsg = meta?.lastMessage;
                const unreadCount = meta?.unreadCount || 0;
                
                return (
                  <div key={contact.id} onClick={() => handleSelectContact(contact)} className={`flex items-center gap-4 p-4 cursor-pointer transition-colors border-b border-slate-50 ${selectedContact?.id === contact.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div 
                      onClick={(e) => { e.stopPropagation(); setContactProfile(contact); }}
                      className="w-12 h-12 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-sm uppercase hover:ring-4 hover:ring-blue-200 transition-all"
                    >
                      {contact.first_name?.[0] || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <h3 className={`font-semibold truncate ${unreadCount > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                          {getDisplayName(contact)} <span className="text-slate-400 text-xs font-normal">#{contact.short_id || '0000'}</span>
                        </h3>
                        {lastMsg && <span className={`text-[11px] font-medium whitespace-nowrap ml-2 ${unreadCount > 0 ? 'text-green-600' : 'text-slate-400'}`}>{lastMsg.timestamp}</span>}
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {lastMsg && lastMsg.senderId === currentUser.id && (
                            lastMsg.status === 'delivered' ? <Checks size={14} weight="bold" className="text-blue-500 flex-shrink-0" /> : <Check size={14} weight="bold" className="text-slate-400 flex-shrink-0" />
                          )}
                          <p className={`text-[13px] truncate ${unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                            {lastMsg ? lastMsg.content : 'Toca para enviar un mensaje'}
                          </p>
                        </div>
                        {unreadCount > 0 && (
                          <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                            <span className="text-[10px] text-white font-bold">{unreadCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <main className={`flex-1 flex-col min-w-0 relative ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
          {selectedContact ? (
            <>
              <header className="h-[72px] bg-white border-b border-slate-200 flex items-center px-4 md:px-6 gap-3 md:gap-4 z-10 shadow-sm shrink-0">
                <button className="md:hidden p-2 -ml-2 text-blue-600 hover:bg-blue-50 rounded-full" onClick={() => setSelectedContact(null)}>&larr;</button>
                <div 
                  onClick={() => setContactProfile(selectedContact)}
                  className="w-10 h-10 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-sm uppercase cursor-pointer hover:ring-4 hover:ring-blue-200 transition-all flex-shrink-0"
                >
                  {selectedContact.first_name?.[0] || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-800 truncate">{getDisplayName(selectedContact)} <span className="text-slate-400 text-sm font-normal">#{selectedContact.short_id || '0000'}</span></h2>
                  <p className="text-xs text-blue-600 font-medium">En línea</p>
                </div>
                <button onClick={() => clearChatHistory(selectedContact.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors shrink-0" title="Eliminar Chat de Bandeja">
                  <Trash size={22} weight="bold" />
                </button>
              </header>

              <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#f0f4f8] relative">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
                
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl shadow-sm text-sm text-slate-500 font-medium z-10 relative">
                      Has iniciado un chat seguro y privado con {selectedContact.first_name}.
                    </div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = msg.senderId === currentUser.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} relative z-10`}>
                        <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative group
                          ${isMine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'}
                        `}>
                          <p className="text-[15px] leading-relaxed break-words">{msg.content}</p>
                          <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                            <span className="text-[10px] font-medium">{msg.timestamp}</span>
                            {isMine && (
                              msg.status === 'delivered' ? <Checks size={14} weight="bold" className="text-blue-300" /> : <Check size={14} weight="bold" className="text-blue-300 opacity-70" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {showScrollButton && (
                <button onClick={scrollToBottom} className="absolute bottom-28 right-4 md:right-8 w-10 h-10 bg-white border border-slate-200 text-slate-500 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-50 transition-all z-20 group" aria-label="Ir al último mensaje">
                  <CaretDown size={22} weight="bold" className="group-hover:text-blue-600 transition-colors" />
                  {unreadInChat > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center border-2 border-white shadow-sm animate-bounce">{unreadInChat}</span>}
                </button>
              )}

              <footer className="bg-white border-t border-slate-200 p-3 md:p-4 z-10 relative">
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full flex items-center px-4 py-2 md:py-3 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 bg-transparent border-none outline-none text-slate-700 text-base placeholder-slate-400" />
                  </div>
                  <button type="submit" disabled={!newMessage.trim()} className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none">
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
              <p className="text-slate-500 max-w-md">Selecciona un chat en la barra lateral para comenzar a enviar mensajes de forma privada y local.</p>
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
