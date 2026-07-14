"use client";

import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import { supabase } from '@/lib/supabase';
import { PaperPlaneRight, SignOut, MagnifyingGlass, Checks, Check, LockKey, EnvelopeSimple, User, CaretDown, UserPlus, CheckCircle, X, IdentificationCard, List, Bell, Users, Trash, DotsThreeVertical, Desktop, Plus, Smiley, Microphone, Image as ImageIcon, VideoCamera, FileText, File, DotsThree, Heart, ShareFat, ArrowUUpLeft, PushPin, Paperclip } from '@phosphor-icons/react';

const renderMessageText = (text: string, isMine: boolean) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline hover:opacity-80 transition-opacity font-bold ${isMine ? 'text-white' : 'text-blue-600'}`}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

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
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [editingMyProfileName, setEditingMyProfileName] = useState('');
  
  // Estado de Transferencia de Dispositivo
  const [loginStep, setLoginStep] = useState<'none' | 'checking' | 'transfer_code' | 'downloading'>('none');
  const [transferCode, setTransferCode] = useState('');
  const [transferStatusMsg, setTransferStatusMsg] = useState('');

  // Interfaz Menú
  const [showMenu, setShowMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<'pending' | 'sent' | 'profile' | 'contacts' | 'sessions' | 'image_viewer' | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  
  // Menús de Mensaje y Visor
  const [viewingImageIndex, setViewingImageIndex] = useState<number>(0);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [customModal, setCustomModal] = useState<any>({ isOpen: false });
  const showAlert = (title: string, message: string) => {
    setCustomModal({ isOpen: true, type: 'alert', title, message, onConfirm: () => {} });
  };
  const showConfirm = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setCustomModal({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  };

  const [forwardMessage, setForwardMessage] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  
  // Sesiones Activas
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [hiddenChats, setHiddenChats] = useState<string[]>([]);
  const [contactModalSearch, setContactModalSearch] = useState('');

  // Estado del Chat Activo
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Ref para prevenir múltiples verificaciones de dispositivo
  const hasCheckedDeviceRef = useRef(false);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadInChat, setUnreadInChat] = useState(0);
  const prevMessagesLength = useRef(0);
  const [isTyping, setIsTyping] = useState(false);
  
  // Multimedia y Adjuntos
  const TOP_EMOJIS = ['😂', '❤️', '👍', '😭', '🙏', '🥰', '🔥', '✨', '🥺', '🎉'];
  const [showEmojis, setShowEmojis] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentType, setAttachmentType] = useState<'image'|'video'|'document'|null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Presencia
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  
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

  const getE2EEKey = async (roomId: string) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(roomId), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("bluechat_secure_salt_v1"), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  };

  const encryptPayload = async (payload: any, roomId: string) => {
    try {
      const key = await getE2EEKey(roomId);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
      return btoa(JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) }));
    } catch (err) {
      console.error("Encryption error", err);
      return null;
    }
  };

  const decryptPayload = async (cipherTextBase64: string, roomId: string) => {
    try {
      const key = await getE2EEKey(roomId);
      const { iv, data } = JSON.parse(atob(cipherTextBase64));
      const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(data));
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (err) {
      console.error("Decryption error", err);
      return null;
    }
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
        if (!hasCheckedDeviceRef.current) {
           setLoginStep('checking');
           hasCheckedDeviceRef.current = true;
           
           const tempChannel = supabase.channel(`user-device-ping-${session.user.id}`);
           let otherDeviceFound = false;
           tempChannel.on('broadcast', { event: 'ping_reply' }, () => { otherDeviceFound = true; });
           tempChannel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                 setTimeout(() => tempChannel.send({ type: 'broadcast', event: 'ping', payload: {} }), 500);
                 setTimeout(async () => {
                    supabase.removeChannel(tempChannel);
                    if (otherDeviceFound) {
                        const code = Math.floor(100000 + Math.random() * 900000).toString();
                        await supabase.from('device_transfers').delete().eq('user_id', session.user.id);
                        await supabase.from('device_transfers').insert({ user_id: session.user.id, auth_code: code });
                        await fetch('/api/notify', {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
                          },
                          body: JSON.stringify({ recipientEmail: session.user.email, type: 'transfer', code })
                        });
                        setLoginStep('transfer_code');
                    } else {
                        setLoginStep('none');
                        fetchUserData(session.user);
                    }
                 }, 3000);
              }
           });
        } else if (loginStep === 'none') {
           fetchUserData(session.user);
        }
      } else {
        setCurrentUser(null);
        setContacts([]);
        hasCheckedDeviceRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          sendMessage(undefined, undefined, reader.result as string);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      showAlert("Micrófono", "No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (recordingTime < 1) {
        cancelRecording();
      } else {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
         mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processFileSelection = (file: File | undefined | null) => {
    if (!file || !currentUser) return;
    if (file.size > 50 * 1024 * 1024) {
      showAlert("Archivo grande", "El archivo excede el límite de 50MB.");
      return;
    }
    setShowAttachments(false);
    setPendingFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileSelection(e.target.files?.[0]);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      processFileSelection(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFileSelection(file);
    }
  };

  const confirmFileSend = async () => {
    if (!pendingFile || !currentUser) return;
    const file = pendingFile;
    setPendingFile(null);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;

    try {
      const { error } = await supabase.storage.from('chat_attachments').upload(filePath, file);
      if (error) throw error;
      
      const { data: publicUrlData } = supabase.storage.from('chat_attachments').getPublicUrl(filePath);
      
      sendMessage(undefined, {
         url: publicUrlData.publicUrl,
         mimeType: file.type || 'application/octet-stream',
         name: file.name,
         isStorage: true
      });
    } catch (err: any) {
      showAlert("Error", "No se pudo subir el archivo: " + err.message);
    }
  };

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

      // Sincronizar mensajes offline recibidos mientras estábamos desconectados
      if (userId) {
        const { data: offlineMsgs } = await supabase.from('offline_messages').select('*').eq('receiver_id', userId);
        if (offlineMsgs && offlineMsgs.length > 0) {
          for (const msg of offlineMsgs) {
            const roomId = getChatRoomId(msg.sender_id, userId);
            const decryptedMsg = await decryptPayload(msg.payload, roomId);
            if (decryptedMsg) {
               let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
               if (!history.find((m:any) => m.id === decryptedMsg.id)) {
                 history.push(decryptedMsg);
                 history.sort((a: any, b: any) => a.createdAt - b.createdAt);
                 await localforage.setItem(`chat_history_${roomId}`, history);
                 
                 if (selectedContactRef.current?.id === msg.sender_id) {
                    setMessages([...history]);
                    await localforage.setItem(`unread_${roomId}`, 0);
                    setChatMeta(prev => ({ ...prev, [msg.sender_id]: { lastMessage: decryptedMsg, unreadCount: 0 } }));
                 } else {
                    let unread: any = (await localforage.getItem(`unread_${roomId}`)) || 0;
                    await localforage.setItem(`unread_${roomId}`, unread + 1);
                    setChatMeta(prev => ({ ...prev, [msg.sender_id]: { lastMessage: decryptedMsg, unreadCount: unread + 1 } }));
                 }

                 if (channelsRef.current && channelsRef.current[roomId]) {
                    const encryptedAck = await encryptPayload({ messageId: decryptedMsg.id }, roomId);
                    channelsRef.current[roomId].send({ type: 'broadcast', event: 'ack', payload: { e2ee: true, data: encryptedAck } });
                 }
               }
            }
          }
          const idsToDelete = offlineMsgs.map(m => m.id);
          await supabase.from('offline_messages').delete().in('id', idsToDelete);
        }
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

  const registerDeviceSession = async (user: any) => {
     let savedSessionId = localStorage.getItem('bluechat_session_id');
     if (savedSessionId) {
        const { data } = await supabase.from('user_sessions').select('id').eq('id', savedSessionId).single();
        if (!data) savedSessionId = null;
     }

     if (!savedSessionId) {
        let ip = 'Desconocida';
        try {
           const res = await fetch('https://api.ipify.org?format=json');
           const data = await res.json();
           ip = data.ip;
        } catch(e) {}
        
        const ua = navigator.userAgent;
        let browser = "Desconocido";
        if (ua.includes("Chrome")) browser = "Chrome";
        else if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Edge")) browser = "Edge";
        
        const deviceName = `${browser} en ${navigator.platform}`;

        const { data } = await supabase.from('user_sessions').insert({
           user_id: user.id,
           device_name: deviceName,
           ip_address: ip
        }).select().single();
        
        if (data) {
           savedSessionId = data.id;
           localStorage.setItem('bluechat_session_id', data.id);
        }
     }
     
     setCurrentSessionId(savedSessionId);
     if (savedSessionId) {
        supabase.channel(`session-${savedSessionId}`)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'user_sessions', filter: `id=eq.${savedSessionId}` }, () => {
             showAlert("Sesión Cerrada", "Tu sesión ha sido cerrada remotamente.");
             handleLogout();
          }).subscribe();
     }
  };

  const fetchUserData = async (user: any) => {
    const userId = user.id;
    const { data: myProfile } = await supabase.from('employees').select('*').eq('id', userId).single();
    
    if (myProfile) {
      setCurrentUser(myProfile);
      registerDeviceSession(user);
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
        registerDeviceSession(user);
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

  const saveMyProfile = async () => {
    if (!editingMyProfileName.trim() || !currentUser) return;
    setIsLoading(true);
    const { error } = await supabase.from('employees').update({ first_name: editingMyProfileName.trim() }).eq('id', currentUser.id);
    if (!error) {
      setCurrentUser({ ...currentUser, first_name: editingMyProfileName.trim() });
      if (globalChannelRef.current) {
         globalChannelRef.current.send({ type: 'broadcast', event: 'profile_update', payload: { userId: currentUser.id, newName: editingMyProfileName.trim() } });
      }
      setShowMyProfile(false);
    }
    setIsLoading(false);
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
    });
    
    channel.on('broadcast', { event: 'profile_update' }, (payload) => {
      const { userId, newName } = payload.payload;
      setContacts(prev => prev.map(c => c.id === userId ? { ...c, first_name: newName } : c));
      setSelectedContact((prev: any) => (prev?.id === userId ? { ...prev, first_name: newName } : prev));
      setContactProfile((prev: any) => (prev?.id === userId ? { ...prev, first_name: newName } : prev));
    }).subscribe();
    
    globalChannelRef.current = channel;

    const interval = setInterval(() => fetchFriends(currentUser.id), 8000);

    const deviceChannel = supabase.channel(`user-device-ping-${currentUser.id}`);
    deviceChannel.on('broadcast', { event: 'ping' }, () => {
      deviceChannel.send({ type: 'broadcast', event: 'ping_reply', payload: {} });
    });
    deviceChannel.on('broadcast', { event: 'start_upload' }, async (payload) => {
      const transferId = payload.payload?.transferId;
      if (!transferId) return;
      const allKeys = await localforage.keys();
      const exportData: Record<string, any> = {};
      for (const key of allKeys) {
         if (key.startsWith('chat_history_') || key.startsWith('unread_')) {
            exportData[key] = await localforage.getItem(key);
         }
      }
      await supabase.from('device_transfers').update({ payload: exportData, status: 'ready' }).eq('id', transferId);
      deviceChannel.send({ type: 'broadcast', event: 'upload_ready', payload: { transferId } });
    });
    deviceChannel.subscribe();

    const presenceChannel = supabase.channel('global_presence');
    presenceChannel.on('presence', { event: 'sync' }, () => {
       const state = presenceChannel.presenceState();
       const onlineSet = new Set<string>();
       for (const id in state) {
          for (const presence of (state[id] as any[])) {
             if (presence.user_id) onlineSet.add(presence.user_id);
          }
       }
       setOnlineUsers(onlineSet);
    });
    presenceChannel.subscribe(async (status) => {
       if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: currentUser.id });
       }
    });

    const msgQueueChannel = supabase.channel(`offline-msgs-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'offline_messages', filter: `receiver_id=eq.${currentUser.id}` },
        async (payload) => {
          const dbMsg = payload.new as any;
          const roomId = getChatRoomId(dbMsg.sender_id, currentUser.id);
          
          let incomingMsg = await decryptPayload(dbMsg.payload, roomId);
          if (!incomingMsg) return;

          // Whatsapp-style: Eliminar de la cola inmediatamente (Store and Forward)
          await supabase.from('offline_messages').delete().eq('id', dbMsg.id);

          if (channelsRef.current[roomId]) {
             const encryptedAck = await encryptPayload({ messageId: incomingMsg.id }, roomId);
             channelsRef.current[roomId].send({ type: 'broadcast', event: 'ack', payload: { e2ee: true, data: encryptedAck } });
          }

          const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
          roomWritePromises.current[roomId] = prevPromise.then(async () => {
            let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
            if (history.find((m:any) => m.id === incomingMsg.id)) return;
            
            history = [...history, incomingMsg];
            history.sort((a: any, b: any) => a.createdAt - b.createdAt);
            
            setHiddenChats(prev => {
              if (prev.includes(dbMsg.sender_id)) {
                const updated = prev.filter(id => id !== dbMsg.sender_id);
                localforage.setItem('hidden_chats', updated);
                return updated;
              }
              return prev;
            });

            await localforage.setItem(`chat_history_${roomId}`, history);

            if (selectedContactRef.current?.id === dbMsg.sender_id) {
              setMessages(history);
              await localforage.setItem(`unread_${roomId}`, 0);
              setChatMeta(prev => ({ ...prev, [dbMsg.sender_id]: { lastMessage: incomingMsg, unreadCount: 0 } }));
            } else {
              const currentUnread: any = (await localforage.getItem(`unread_${roomId}`)) || 0;
              const newUnread = currentUnread + 1;
              await localforage.setItem(`unread_${roomId}`, newUnread);
              setChatMeta(prev => ({ ...prev, [dbMsg.sender_id]: { lastMessage: incomingMsg, unreadCount: newUnread } }));
            }
          });
        }
      ).subscribe();

    return () => { 
      supabase.removeChannel(channel);
      globalChannelRef.current = null;
      clearInterval(interval);
      supabase.removeChannel(deviceChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(msgQueueChannel);
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

      channel.on('broadcast', { event: 'new_message' }, async (payloadObj) => {
        let incomingMsg = payloadObj.payload;
        if (incomingMsg.e2ee) {
           incomingMsg = await decryptPayload(incomingMsg.data, roomId);
           if (!incomingMsg) return;
        }
        if (incomingMsg.senderId !== currentUser.id) {
          const encryptedAck = await encryptPayload({ messageId: incomingMsg.id }, roomId);
          channel.send({ type: 'broadcast', event: 'ack', payload: { e2ee: true, data: encryptedAck } });
        }

        const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
        roomWritePromises.current[roomId] = prevPromise.then(async () => {
          let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
          if (history.find((m:any) => m.id === incomingMsg.id)) return;
          
          history = [...history, incomingMsg];
          history.sort((a: any, b: any) => a.createdAt - b.createdAt);
          
          setHiddenChats(prev => {
            if (prev.includes(contact.id)) {
              const updated = prev.filter(id => id !== contact.id);
              localforage.setItem('hidden_chats', updated);
              return updated;
            }
            return prev;
          });

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
        });
      });

      channel.on('broadcast', { event: 'delete_message' }, async (payloadObj) => {
        let incomingReq = payloadObj.payload;
        if (incomingReq.e2ee) {
           incomingReq = await decryptPayload(incomingReq.data, roomId);
           if (!incomingReq) return;
        }

        const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
        roomWritePromises.current[roomId] = prevPromise.then(async () => {
          let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
          const msgToDelete = history.find((m: any) => m.id === incomingReq.messageId);
          if (!msgToDelete) return; 
          
          if (incomingReq.senderId !== contact.id) return; 
          
          const updatedHistory = history.filter((m: any) => m.id !== incomingReq.messageId);
          await localforage.setItem(`chat_history_${roomId}`, updatedHistory);
          
          if (selectedContactRef.current?.id === contact.id) {
             setMessages(updatedHistory);
          }
          const lastMsg = updatedHistory.length > 0 ? updatedHistory[updatedHistory.length - 1] : null;
          setChatMeta(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], lastMessage: lastMsg } }));
        });
      });

      channel.on('broadcast', { event: 'reaction' }, async (payloadObj) => {
        let payload = payloadObj.payload;
        if (payload.e2ee) {
           payload = await decryptPayload(payload.data, roomId);
           if (!payload) return;
        }
        const { msgId, emoji } = payload;
        const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
        roomWritePromises.current[roomId] = prevPromise.then(async () => {
          let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
          const updated = history.map((m:any) => m.id === msgId ? { ...m, reaction: emoji } : m);
          await localforage.setItem(`chat_history_${roomId}`, updated);
          
          if (selectedContactRef.current?.id === contact.id) {
            setMessages(updated);
          }
        });
      });

      channel.on('broadcast', { event: 'ack' }, async (payloadObj) => {
        let payload = payloadObj.payload;
        if (payload.e2ee) {
           payload = await decryptPayload(payload.data, roomId);
           if (!payload) return;
        }
        const { messageId } = payload;
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
              pending.forEach(async (pMsg: any) => {
               const enc = await encryptPayload(pMsg, roomId);
               channel.send({ type: 'broadcast', event: 'new_message', payload: { e2ee: true, data: enc } });
            });
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
              pending.forEach(async (pMsg: any) => {
               const enc = await encryptPayload(pMsg, roomId);
               channel.send({ type: 'broadcast', event: 'new_message', payload: { e2ee: true, data: enc } });
            });
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
    try {
      const { data: existing, error: selectError } = await supabase.from('contacts').select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`);
      
      if (selectError) throw selectError;

      if (existing && existing.length > 0) {
         showAlert("Aviso", "Ya existe una solicitud o amistad con este usuario.");
         return;
      }

      const { error: insertError } = await supabase.from('contacts').insert({ sender_id: currentUser.id, receiver_id: targetId, status: 'pending' });
      if (insertError) throw insertError;

      notifyNetwork();
      showAlert("Éxito", "Solicitud enviada!");
      setShowAddContact(false);
      setSearchUsername('');
      setSearchShortId('');
    } catch (err: any) {
      showAlert("Error", "Error al enviar solicitud: " + err.message);
      console.error(err);
    }
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
    if (!(await showConfirm("Eliminar Contacto", "¿Estás seguro de que quieres eliminar a este contacto? Ya no podrán enviarse mensajes."))) return;
    
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
    if (!(await showConfirm("Eliminar Chat", "¿Seguro que deseas borrar este chat? Desaparecerá de tu lista, pero seguirán siendo contactos."))) return;
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

  const lastContactId = useRef<string | null>(null);

  useEffect(() => {
    if (!chatContainerRef.current || messages.length === 0) return;

    const isInitialLoad = lastContactId.current !== selectedContact?.id;
    
    if (isInitialLoad) {
      lastContactId.current = selectedContact?.id || null;
      prevMessagesLength.current = messages.length;
      setTimeout(scrollToBottom, 100); 
      return;
    }

    const isNewMessage = messages.length > prevMessagesLength.current;
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
    }
  }, [messages, selectedContact, currentUser]);

  const sendMessage = async (text?: string, file?: any, audio?: string) => {
    let msgText = text !== undefined ? text : newMessage;
    msgText = msgText.slice(0, 1000);
    if (!msgText.trim() && !file && !audio) return;
    if (!selectedContact || !currentUser) return;

    const roomId = getChatRoomId(currentUser.id, selectedContact.id);
    const newMsgObj: any = {
      id: `m${Date.now()}`,
      senderId: currentUser.id,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      status: 'pending'
    };
    if (msgText.trim()) newMsgObj.content = msgText.trim();
    if (file) newMsgObj.file = file;
    if (audio) newMsgObj.audio = audio;
    if (replyingTo) {
       newMsgObj.replyTo = replyingTo;
       setReplyingTo(null);
    }

    setMessages((prev) => {
      const updatedMessages = [...prev, newMsgObj];
      localforage.setItem(`chat_history_${roomId}`, updatedMessages);
      return updatedMessages;
    });
    
    setChatMeta(prev => ({ ...prev, [selectedContact.id]: { ...prev[selectedContact.id], lastMessage: newMsgObj } }));
    if (!file && !audio) setNewMessage('');
    
    setHiddenChats(prev => {
      if (prev.includes(selectedContact.id)) {
        const updated = prev.filter(id => id !== selectedContact.id);
        localforage.setItem('hidden_chats', updated);
        return updated;
      }
      return prev;
    });

    // Enviar siempre a la base de datos (Store and Forward garantizado)
    const encryptedMsg = await encryptPayload(newMsgObj, roomId);
    await supabase.from('offline_messages').insert({
      sender_id: currentUser.id,
      receiver_id: selectedContact.id,
      payload: encryptedMsg
    });
    
    // Broadcast simultáneo para entrega instantánea (latencia cero) si el otro está conectado
    if (channelsRef.current && channelsRef.current[roomId]) {
      channelsRef.current[roomId].send({ type: 'broadcast', event: 'new_message', payload: { e2ee: true, data: encryptedMsg } });
    }
    if (!onlineUsersRef.current[roomId]) {
      const rateLimitKey = `email_throttle_${selectedContact.id}`;
      const lastSentTime: any = await localforage.getItem(rateLimitKey);
      const now = Date.now();
      if (!lastSentTime || (now - lastSentTime > 3600000)) {
        await localforage.setItem(rateLimitKey, now); 
        fetch('/api/notify', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ senderName: currentUser.first_name, recipientEmail: selectedContact.email, recipientName: selectedContact.first_name })
        }).catch(err => console.error(err));
      }
    }
  };

  const reactToMessage = async (msgId: string, emoji: string) => {
    if (!selectedContact || !currentUser) return;
    const roomId = getChatRoomId(currentUser.id, selectedContact.id);
    
    const updatedMessages = messages.map(m => m.id === msgId ? { ...m, reaction: emoji } : m);
    setMessages(updatedMessages);
    await localforage.setItem(`chat_history_${roomId}`, updatedMessages);
    
    if (channelsRef.current[roomId]) {
      const encryptedReaction = await encryptPayload({ msgId, emoji }, roomId);
      channelsRef.current[roomId].send({ type: 'broadcast', event: 'reaction', payload: { e2ee: true, data: encryptedReaction } });
    }
  };

  const deleteMessage = async (msgId: string, forEveryone: boolean) => {
    const confirmMessage = forEveryone 
      ? "¿Estás seguro de que deseas eliminar este mensaje para todos?"
      : "¿Estás seguro de que deseas eliminar este mensaje para ti?";
      
    if (!(await showConfirm("Confirmación", confirmMessage))) return;

    if (!selectedContact || !currentUser) return;
    const roomId = getChatRoomId(currentUser.id, selectedContact.id);
    
    if (forEveryone) {
      const encryptedPayload = await encryptPayload({ messageId: msgId, senderId: currentUser.id }, roomId);
      if (channelsRef.current[roomId]) {
        channelsRef.current[roomId].send({ type: 'broadcast', event: 'delete_message', payload: { e2ee: true, data: encryptedPayload } });
      }
    }

    const prevPromise = roomWritePromises.current[roomId] || Promise.resolve();
    roomWritePromises.current[roomId] = prevPromise.then(async () => {
      let history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
      const updatedHistory = history.filter((m: any) => m.id !== msgId);
      await localforage.setItem(`chat_history_${roomId}`, updatedHistory);
      
      if (selectedContactRef.current?.id === selectedContact.id) {
         setMessages(updatedHistory);
         const lastMsg = updatedHistory.length > 0 ? updatedHistory[updatedHistory.length - 1] : null;
         setChatMeta(prev => ({ ...prev, [selectedContact.id]: { ...prev[selectedContact.id], lastMessage: lastMsg } }));
      }
    });
    setMessageMenuId(null);
  };

  const executeForward = async (contact: any) => {
    if (!forwardMessage || !currentUser) return;
    const roomId = getChatRoomId(currentUser.id, contact.id);
    const newMsgObj = { 
      ...forwardMessage, 
      id: `m${Date.now()}`, 
      senderId: currentUser.id, 
      createdAt: Date.now(), 
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
      status: 'pending',
      reaction: null 
    };
    
    const history: any = await localforage.getItem(`chat_history_${roomId}`) || [];
    history.push(newMsgObj);
    await localforage.setItem(`chat_history_${roomId}`, history);
    
    const targetChannel = supabase.channel(`chat_${roomId}`);
        targetChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
         const encryptedMsg = await encryptPayload(newMsgObj, roomId);
         targetChannel.send({ type: 'broadcast', event: 'new_message', payload: { e2ee: true, data: encryptedMsg } });
         setTimeout(() => supabase.removeChannel(targetChannel), 1000);
      }
    });
    
    showAlert("Reenviado", "Mensaje reenviado a " + getDisplayName(contact));
    setForwardMessage(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsLoading(true);
    
    if (isLoginMode) {
      setLoginStep('checking');
      hasCheckedDeviceRef.current = false; // Reset to force check
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
        setIsLoading(false);
        setLoginStep('none');
      }
      return;
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

  const verifyTransferCode = async () => {
     setTransferStatusMsg('Verificando código...');
     if (!session) return;
     const { data } = await supabase.from('device_transfers').select('*').eq('user_id', session.user.id).eq('auth_code', transferCode).single();
     if (data) {
        setTransferStatusMsg('Solicitando historial al otro dispositivo... (Espera unos segundos)');
        await supabase.from('device_transfers').update({ status: 'uploading' }).eq('id', data.id);
        setLoginStep('downloading');
        
        const tempChannel = supabase.channel(`user-device-ping-${session.user.id}`);
        let processed = false;
        
        const processReady = async () => {
            if (processed) return;
            processed = true;
            setTransferStatusMsg('Descargando historial local...');
            const { data: updatedData } = await supabase.from('device_transfers').select('payload').eq('id', data.id).single();
            const exportData = updatedData?.payload;
            if (exportData) {
              for (const key in exportData) {
                 await localforage.setItem(key, exportData[key]);
              }
            }
            await supabase.from('device_transfers').delete().eq('id', data.id);
            supabase.removeChannel(tempChannel);
            setLoginStep('none');
            fetchUserData(session.user);
        };

        tempChannel.on('broadcast', { event: 'upload_ready' }, (payload) => {
             if (payload.payload?.transferId === data.id) processReady();
        });
        
        tempChannel.subscribe((status) => {
           if (status === 'SUBSCRIBED') {
              tempChannel.send({ type: 'broadcast', event: 'start_upload', payload: { transferId: data.id } });
           }
        });

        const fallback = setInterval(async () => {
            if (processed) { clearInterval(fallback); return; }
            const { data: pollData } = await supabase.from('device_transfers').select('status').eq('id', data.id).single();
            if (pollData?.status === 'ready') {
                clearInterval(fallback);
                processReady();
            }
        }, 3000);

     } else {
        setTransferStatusMsg('Código incorrecto.');
     }
  };

  const fetchActiveSessions = async () => {
     if (!currentUser) return;
     const { data } = await supabase.from('user_sessions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
     if (data) setActiveSessions(data);
  };

  const killSession = async (sessionId: string) => {
     if (!(await showConfirm("Cerrar Sesión", "¿Seguro que deseas cerrar esa sesión remotamente?"))) return;
     await supabase.from('user_sessions').delete().eq('id', sessionId);
     fetchActiveSessions();
  };

  const handleLogout = async () => {
    let sess = currentSessionId || localStorage.getItem('bluechat_session_id');
    if (sess) {
       await supabase.from('user_sessions').delete().eq('id', sess);
       localStorage.removeItem('bluechat_session_id');
    }

    await supabase.auth.signOut();
    setSelectedContact(null);
    setMessages([]);
    setIsLoading(false);
    setLoginStep('none');
  };

  const sortedContacts = [...contacts].sort((a, b) => {
    const metaA = chatMeta[a.id]?.lastMessage;
    const metaB = chatMeta[b.id]?.lastMessage;
    const timeA = metaA ? (metaA.createdAt || 0) : 0;
    const timeB = metaB ? (metaB.createdAt || 0) : 0;
    return timeB - timeA;
  });

  const filteredContacts = sortedContacts.filter(c => {
    const matchesSearch = getDisplayName(c).toLowerCase().includes(chatSearchQuery.toLowerCase());
    if (chatSearchQuery) return matchesSearch;
    return !hiddenChats.includes(c.id);
  });

  // UI: INTERCEPTORES DE TRANSFERENCIA
  if (loginStep === 'checking') {
    return (
      <div className="min-h-[100dvh] w-full bg-blue-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center">
           <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-slate-600 font-semibold">Verificando sesiones activas...</p>
        </div>
      </div>
    );
  }

  if (loginStep === 'transfer_code' || loginStep === 'downloading') {
    return (
      <div className="min-h-[100dvh] w-full bg-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 border border-blue-100 text-center">
           <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
             <LockKey size={32} weight="bold" />
           </div>
           <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Sesión Activa Detectada</h2>
           <p className="text-slate-500 text-sm mb-6">Hemos enviado un código a tu correo para autorizar la transferencia del historial de chats a este nuevo dispositivo.</p>
           
           {loginStep === 'transfer_code' ? (
             <div className="space-y-4">
               <input 
                 type="text" 
                 maxLength={6} 
                 value={transferCode} 
                 onChange={e => setTransferCode(e.target.value)} 
                 placeholder="000000" 
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-2xl font-bold tracking-[10px] focus:outline-none focus:border-blue-500"
               />
               <button onClick={verifyTransferCode} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30">
                 Verificar y Transferir
               </button>
               {transferStatusMsg && <p className="text-sm text-red-500 font-medium mt-2">{transferStatusMsg}</p>}
             </div>
           ) : (
             <div className="flex flex-col items-center py-6">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-blue-600 font-bold">{transferStatusMsg}</p>
             </div>
           )}
           <button onClick={() => { setLoginStep('none'); }} className="mt-6 text-sm text-slate-400 hover:text-slate-600 underline">Cancelar y Volver</button>
        </div>
      </div>
    );
  }

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
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID</label>
                  <div className="relative">
                    <IdentificationCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" maxLength={4} value={shortId} onChange={e => setShortId(e.target.value.toUpperCase())} placeholder="Ingresa 4 letras o números" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                  </div>
                </div>
              </>
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
      
      {/* Modal Mi Perfil */}
      {showMyProfile && currentUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all" onClick={() => setShowMyProfile(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs sm:max-w-sm p-6 sm:p-8 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowMyProfile(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors"><X size={20} weight="bold"/></button>
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-emerald-400 to-teal-600 text-white rounded-full flex items-center justify-center font-bold text-4xl sm:text-5xl shadow-xl shadow-emerald-500/30 uppercase mb-5 ring-4 ring-white">
               {currentUser.first_name?.[0] || 'U'}
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">Mi Perfil</h2>
            <p className="text-emerald-600 font-bold mb-4 bg-emerald-50 px-3 py-1 rounded-full mt-2 inline-block">#{currentUser.short_id || '0000'}</p>
            
            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 flex flex-col gap-2 text-left">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tu Nombre Visible</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={editingMyProfileName} 
                  onChange={e => setEditingMyProfileName(e.target.value)} 
                  placeholder="Ej: Juan Perez" 
                  className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button onClick={saveMyProfile} disabled={isLoading} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">Guardar</button>
              </div>
            </div>

            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
               <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm"><EnvelopeSimple size={18} /></div>
               <p className="text-sm text-slate-600 font-medium truncate flex-1 text-left">{currentUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Perfil de Contacto */}
      {contactProfile && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all" onClick={() => setContactProfile(null)}>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Bell className="text-orange-500" weight="fill"/> Solicitudes Pendientes
              {pendingRequests.length > 0 && <span className="bg-orange-100 text-orange-600 text-[12px] px-2.5 py-0.5 rounded-full font-bold ml-2">{pendingRequests.length}</span>}
            </h2>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <PaperPlaneRight className="text-blue-500" weight="fill"/> Solicitudes Enviadas
              {sentRequests.length > 0 && <span className="bg-blue-100 text-blue-600 text-[12px] px-2.5 py-0.5 rounded-full font-bold ml-2">{sentRequests.length}</span>}
            </h2>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users className="text-emerald-500" weight="fill"/> Todos los contactos
              {contacts.length > 0 && <span className="bg-emerald-100 text-emerald-600 text-[12px] px-2.5 py-0.5 rounded-full font-bold ml-2">{contacts.length}</span>}
            </h2>
            
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
                       <div className="relative">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xl uppercase shrink-0">
                          {contact.first_name?.[0]}
                        </div>
                        {onlineUsers.has(contact.id) && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>
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

      {activeModal === 'sessions' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Desktop className="text-blue-500" weight="fill"/> Sesiones Abiertas
              {activeSessions.length > 0 && <span className="bg-slate-100 text-slate-600 text-[12px] px-2.5 py-0.5 rounded-full font-bold ml-2">{activeSessions.length}</span>}
            </h2>
            
            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
               {activeSessions.length === 0 ? <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div> :
                  activeSessions.map(sess => (
                    <div key={sess.id} className={`p-4 rounded-xl border ${sess.id === currentSessionId ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                       <div className="flex justify-between items-start mb-1">
                          <p className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            {sess.device_name}
                            {sess.id === currentSessionId && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full uppercase font-black tracking-wider">Actual</span>}
                          </p>
                          {sess.id !== currentSessionId && (
                            <button onClick={() => killSession(sess.id)} className="text-xs text-red-500 hover:text-red-700 font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                               Cerrar
                            </button>
                          )}
                       </div>
                       <p className="text-xs text-slate-500 mb-1"><span className="font-semibold">IP:</span> {sess.ip_address}</p>
                       <p className="text-[10px] text-slate-400 font-medium">Iniciada el {new Date(sess.created_at).toLocaleString()}</p>
                    </div>
                  ))
               }
            </div>
          </div>
        </div>
      )}

      {/* Modales Extra: Reenvío y Visor */}
      {forwardMessage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setForwardMessage(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
             <button onClick={() => setForwardMessage(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24}/></button>
             <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ShareFat className="text-blue-500" weight="fill"/> Reenviar a...</h3>
             <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-2">
               {contacts.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No tienes contactos</p> : 
                 contacts.map(contact => (
                 <div key={contact.id} onClick={() => executeForward(contact)} className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-xl cursor-pointer transition-colors">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">{contact.first_name[0]}</div>
                    <span className="font-semibold text-slate-800 text-sm">{getDisplayName(contact)}</span>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}

      {activeModal === 'image_viewer' && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col animate-in fade-in">
          <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/60 to-transparent text-white absolute top-0 w-full z-10">
            <div className="flex flex-col">
              <span className="font-bold text-lg">{messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]?.senderId === currentUser?.id ? 'Tú' : selectedContact?.first_name}</span>
              <span className="text-sm text-white/70">{messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]?.timestamp || 'Reciente'}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-4">
              <button onClick={() => { setReplyingTo(messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]); setActiveModal(null); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors" title="Responder"><ArrowUUpLeft size={24}/></button>
              <button onClick={() => { setForwardMessage(messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]); setActiveModal(null); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors" title="Reenviar"><ShareFat size={24}/></button>
              <button onClick={() => { showAlert("Fijado", "Mensaje fijado en el chat"); setActiveModal(null); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors" title="Fijar"><PushPin size={24}/></button>
              <div className="w-px h-6 bg-white/20 mx-1 hidden sm:block"></div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 sm:p-2 hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"><X size={26} weight="bold"/></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            <img src={messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]?.file.url || messages.filter(m => m.file?.mimeType.startsWith('image/'))[viewingImageIndex]?.file.data} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
          </div>
          <div className="h-28 bg-black/50 p-4 flex items-center justify-center gap-3 overflow-x-auto border-t border-white/10 shrink-0">
            {messages.filter(m => m.file?.mimeType.startsWith('image/')).map((img, idx) => (
              <img 
                key={img.id} 
                src={img.file.url || img.file.data} 
                onClick={() => setViewingImageIndex(idx)}
                className={`h-full object-cover w-20 cursor-pointer rounded-lg border-2 transition-all shadow-lg ${idx === viewingImageIndex ? 'border-blue-500 scale-110 opacity-100 z-10' : 'border-transparent opacity-50 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal Añadir Contacto */}
      {showAddContact && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowAddContact(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-xl font-bold text-slate-800 mb-4">Añadir Contacto</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
               <div className="flex-[2]">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Usuario (opcional)</label>
                  <input type="text" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} placeholder="Ej: Alex" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-500" />
               </div>
               <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID</label>
                  <input type="text" maxLength={4} value={searchShortId} onChange={e => setSearchShortId(e.target.value.toUpperCase())} placeholder="Ingresa 4 letras o números" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-500" />
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
            <div onClick={() => { setEditingMyProfileName(currentUser.first_name); setShowMyProfile(true); }} className="flex items-center gap-3 cursor-pointer hover:bg-white/10 p-2 -ml-2 rounded-xl transition-colors truncate min-w-0 max-w-[250px]">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg backdrop-blur-sm shadow-inner uppercase flex-shrink-0">
                {currentUser.first_name?.[0] || 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold tracking-wide text-sm truncate">{currentUser.first_name} <span className="opacity-70 font-normal">#{currentUser.short_id || '0000'}</span></span>
                <span className="text-[10px] text-blue-200 truncate">{currentUser.email}</span>
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
                <button onClick={() => { setShowMenu(false); setActiveModal('contacts'); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 text-slate-700 transition-colors">
                  <Users size={18} className="text-slate-400" /> Todos los contactos
                </button>
                <button onClick={() => { setShowMenu(false); fetchActiveSessions(); setActiveModal('sessions'); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 text-slate-700 transition-colors border-t border-slate-100">
                  <Desktop size={18} className="text-blue-500" /> Sesiones Abiertas
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
                      className="relative w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-sm uppercase hover:ring-4 hover:ring-blue-200 transition-all"
                    >
                      <div className="w-12 h-12 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                        {contact.first_name?.[0] || 'U'}
                      </div>
                      {onlineUsers.has(contact.id) && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                      )}
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
                            {lastMsg ? (lastMsg.content || lastMsg.text || 'Archivo o audio enviado') : 'Toca para enviar un mensaje'}
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
              <header className="h-[72px] bg-white border-b border-slate-200 flex items-center px-4 md:px-6 gap-3 md:gap-4 z-50 shadow-sm shrink-0">
                <button className="md:hidden p-2 -ml-2 text-blue-600 hover:bg-blue-50 rounded-full" onClick={() => setSelectedContact(null)}>&larr;</button>
                <div 
                  onClick={() => setContactProfile(selectedContact)}
                  className="w-10 h-10 bg-gradient-to-tr from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-sm uppercase cursor-pointer hover:ring-4 hover:ring-blue-200 transition-all flex-shrink-0"
                >
                  {selectedContact.first_name?.[0] || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-lg leading-tight">{getDisplayName(selectedContact)}</span>
                    {onlineUsers.has(selectedContact.id) ? (
                      <span className="text-sm text-emerald-500 font-medium flex items-center gap-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        En línea
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400 font-medium flex items-center gap-1">
                        <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                        Desconectado
                      </span>
                    )}
                 </div>
                </div>
                
                <div className="relative">
                  <button onClick={() => setShowChatOptions(!showChatOptions)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors shrink-0">
                    <DotsThreeVertical size={24} weight="bold" />
                  </button>
                  {showChatOptions && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowChatOptions(false)}></div>
                      <div className="absolute right-0 top-14 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1 animate-in fade-in zoom-in-95">
                        <button 
                          onClick={() => { setShowChatOptions(false); clearChatHistory(selectedContact.id); }} 
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 font-semibold transition-colors"
                        >
                          <Trash size={18} weight="bold" /> Eliminar Chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </header>

              <div 
                ref={chatContainerRef} 
                onScroll={handleScroll} 
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#f0f4f8] relative"
              >
                
                {messageMenuId && (
                  <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-all cursor-pointer" onClick={() => setMessageMenuId(null)}></div>
                )}
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
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} relative group items-center ${messageMenuId === msg.id ? 'z-50' : 'z-10'} ${msg.reaction ? 'mb-5' : ''}`}>
                        {isMine && (
                          <div className={`opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity relative mr-2`}>
                             <button onClick={() => setMessageMenuId(msg.id)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 rounded-full transition-colors">
                               <DotsThree size={20} weight="bold"/>
                             </button>
                             {messageMenuId === msg.id && (
                               <div className="fixed bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-slate-100 z-50 animate-in slide-in-from-bottom-full p-4 pb-8 md:pb-2 md:p-2 md:absolute md:bottom-[110%] md:inset-x-auto md:right-0 md:rounded-2xl md:min-w-[220px] md:border md:shadow-2xl md:slide-in-from-bottom-2 md:zoom-in-95">
                                 <div className="flex justify-between items-center p-2 md:p-1 bg-slate-50 rounded-full mb-3 md:mb-1">
                                    {['👍','❤️','😂','😮','🙏'].map(emoji => (
                                      <button key={emoji} onClick={() => { reactToMessage(msg.id, emoji); setMessageMenuId(null); }} className="hover:scale-125 transition-transform text-3xl md:text-2xl p-1">{emoji}</button>
                                    ))}
                                 </div>
                                 <div className="flex flex-col text-sm font-medium gap-1 md:gap-0">
                                   <button onClick={() => { setReplyingTo(msg); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <ArrowUUpLeft size={20} className="md:w-[18px] md:h-[18px]" /> Responder
                                   </button>
                                   <button onClick={() => { setForwardMessage(msg); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <ShareFat size={20} className="md:w-[18px] md:h-[18px]" /> Reenviar
                                   </button>
                                   <button onClick={() => { deleteMessage(msg.id, false); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <Trash size={20} className="md:w-[18px] md:h-[18px]" /> Eliminar para mí
                                   </button>
                                   <button onClick={() => { deleteMessage(msg.id, true); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-red-500 hover:bg-red-50 rounded-xl flex items-center gap-3">
                                     <Trash size={20} weight="fill" className="md:w-[18px] md:h-[18px]" /> Eliminar para todos
                                   </button>
                                 </div>
                               </div>
                             )}
                          </div>
                        )}

                        <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative
                          ${isMine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'}
                        `}>
                          {msg.replyTo && (
                            <div className={`text-xs p-2 mb-1.5 rounded-lg border-l-4 ${isMine ? 'bg-blue-700/50 border-blue-300' : 'bg-slate-100 border-blue-500'}`}>
                               <p className="font-bold">{msg.replyTo.senderId === currentUser.id ? 'Tú' : selectedContact.first_name}</p>
                               <p className="truncate opacity-80">{msg.replyTo.text || msg.replyTo.content || 'Archivo multimedia'}</p>
                            </div>
                          )}
                          <div className="text-sm font-medium whitespace-pre-wrap break-words">
                            {msg.content && <p>{renderMessageText(msg.content, isMine)}</p>}
                            {msg.text && <p>{renderMessageText(msg.text, isMine)}</p>}
                            {msg.audio && (
                              <audio controls src={msg.audio} className="mt-1 max-w-full h-10 rounded-full" />
                            )}
                            {msg.file && (
                              <div className="mt-2">
                                {msg.file.mimeType.startsWith('image/') ? (
                                  <img 
                                    src={msg.file.url || msg.file.data} 
                                    alt="attachment" 
                                    onClick={() => {
                                      const allImages = messages.filter(m => m.file?.mimeType.startsWith('image/'));
                                      const idx = allImages.findIndex(m => m.id === msg.id);
                                      setViewingImageIndex(idx);
                                      setActiveModal('image_viewer');
                                    }}
                                    className="cursor-pointer max-w-[220px] max-h-[300px] object-cover rounded-lg border border-black/10 shadow-sm transition-transform hover:scale-[1.02]" 
                                  />
                                ) : msg.file.mimeType.startsWith('video/') ? (
                                  <video controls src={msg.file.url || msg.file.data} className="max-w-[220px] rounded-lg border border-black/10 shadow-sm" />
                                ) : (
                                  <a href={msg.file.url || msg.file.data} download={msg.file.name} className="flex items-center gap-2 bg-black/10 p-3 rounded-lg hover:bg-black/20 transition-colors">
                                    <File size={24} />
                                    <span className="truncate max-w-[150px]">{msg.file.name}</span>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                            <span className="text-[10px] font-medium">{msg.timestamp}</span>
                            {isMine && (
                              msg.status === 'delivered' ? <Checks size={14} weight="bold" className="text-blue-300" /> : <Check size={14} weight="bold" className="text-blue-300 opacity-70" />
                            )}
                          </div>
                          {msg.reaction && (
                            <div className={`absolute -bottom-5 ${isMine ? 'right-2' : 'left-2'} bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-base shadow-md z-10`}>
                               {msg.reaction}
                            </div>
                          )}
                        </div>

                        {!isMine && (
                          <div className={`opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity relative ml-2`}>
                             <button onClick={() => setMessageMenuId(msg.id)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 rounded-full transition-colors">
                               <DotsThree size={20} weight="bold"/>
                             </button>
                             {messageMenuId === msg.id && (
                               <div className="fixed bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-slate-100 z-50 animate-in slide-in-from-bottom-full p-4 pb-8 md:pb-2 md:p-2 md:absolute md:bottom-[110%] md:inset-x-auto md:left-0 md:rounded-2xl md:min-w-[220px] md:border md:shadow-2xl md:slide-in-from-bottom-2 md:zoom-in-95">
                                 <div className="flex justify-between items-center p-2 md:p-1 bg-slate-50 rounded-full mb-3 md:mb-1">
                                    {['👍','❤️','😂','😮','🙏'].map(emoji => (
                                      <button key={emoji} onClick={() => { reactToMessage(msg.id, emoji); setMessageMenuId(null); }} className="hover:scale-125 transition-transform text-3xl md:text-2xl p-1">{emoji}</button>
                                    ))}
                                 </div>
                                 <div className="flex flex-col text-sm font-medium gap-1 md:gap-0">
                                   <button onClick={() => { setReplyingTo(msg); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <ArrowUUpLeft size={20} className="md:w-[18px] md:h-[18px]" /> Responder
                                   </button>
                                   <button onClick={() => { setForwardMessage(msg); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <ShareFat size={20} className="md:w-[18px] md:h-[18px]" /> Reenviar
                                   </button>
                                   <button onClick={() => { deleteMessage(msg.id, false); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-3">
                                     <Trash size={20} className="md:w-[18px] md:h-[18px]" /> Eliminar para mí
                                   </button>
                                   <button onClick={() => { deleteMessage(msg.id, true); setMessageMenuId(null); }} className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-red-500 hover:bg-red-50 rounded-xl flex items-center gap-3">
                                     <Trash size={20} weight="fill" className="md:w-[18px] md:h-[18px]" /> Eliminar para todos
                                   </button>
                                 </div>
                               </div>
                             )}
                          </div>
                        )}
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
                {replyingTo && (
                  <div className="flex items-center justify-between bg-slate-50 p-2 md:px-4 md:py-3 border-b border-slate-100 rounded-t-xl mx-2 md:mx-4 -mt-16 absolute left-0 right-0 z-20 shadow-lg">
                     <div className="border-l-4 border-blue-500 pl-3">
                        <p className="text-xs font-bold text-blue-600">{replyingTo.senderId === currentUser.id ? 'Tú' : selectedContact.first_name}</p>
                        <p className="text-sm text-slate-600 truncate max-w-[200px] md:max-w-[400px]">{replyingTo.content || replyingTo.text || 'Archivo multimedia'}</p>
                     </div>
                     <button onClick={() => setReplyingTo(null)} className="p-1 text-slate-400 hover:text-slate-600 bg-slate-200/50 rounded-full"><X size={16}/></button>
                  </div>
                )}
                <div className="flex items-center gap-2 md:gap-3 relative z-30">
                  {/* Menú Adjuntos */}
                  <div className="relative">
                    <button onClick={() => { setShowAttachments(!showAttachments); setShowEmojis(false); }} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0">
                      <Paperclip size={24} weight="bold"/>
                    </button>
                    {showAttachments && (
                       <div className="fixed bottom-[80px] left-4 bg-white border border-slate-100 shadow-2xl rounded-2xl p-3 flex flex-col gap-2 z-[100] w-[200px] animate-in slide-in-from-bottom-4 md:absolute md:bottom-14 md:left-0 md:p-2 md:gap-1 md:w-48">
                          <button onClick={() => { if(fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click(); setShowAttachments(false); } }} className="flex items-center gap-3 px-4 py-3 md:px-3 md:py-2 hover:bg-slate-50 rounded-xl text-slate-700 font-medium transition-colors">
                             <ImageIcon className="text-blue-500" size={22} weight="fill"/> Foto
                          </button>
                          <button onClick={() => { if(fileInputRef.current) { fileInputRef.current.accept = 'video/*'; fileInputRef.current.click(); setShowAttachments(false); } }} className="flex items-center gap-3 px-4 py-3 md:px-3 md:py-2 hover:bg-slate-50 rounded-xl text-slate-700 font-medium transition-colors">
                             <VideoCamera className="text-purple-500" size={22} weight="fill"/> Video
                          </button>
                          <button onClick={() => { if(fileInputRef.current) { fileInputRef.current.accept = '*/*'; fileInputRef.current.click(); setShowAttachments(false); } }} className="flex items-center gap-3 px-4 py-3 md:px-3 md:py-2 hover:bg-slate-50 rounded-xl text-slate-700 font-medium transition-colors">
                             <FileText className="text-emerald-500" size={22} weight="fill"/> Documento
                          </button>
                       </div>
                    )}
                  </div>

                  {/* Menú Emojis */}
                  <div className="relative">
                     <button onClick={() => { setShowEmojis(!showEmojis); setShowAttachments(false); }} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0">
                       <Smiley size={24} weight="bold"/>
                     </button>
                     {showEmojis && (
                        <div className="fixed bottom-[80px] left-4 right-4 max-w-sm mx-auto bg-white border border-slate-100 shadow-2xl rounded-2xl p-4 grid grid-cols-5 gap-3 z-[100] animate-in slide-in-from-bottom-4 md:absolute md:bottom-14 md:left-0 md:right-auto md:w-[260px] md:p-3 md:gap-2 md:mx-0">
                           {TOP_EMOJIS.map(emoji => (
                              <button key={emoji} onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojis(false); }} className="text-3xl md:text-2xl hover:bg-slate-100 rounded-xl p-2 transition-colors flex items-center justify-center">
                                {emoji}
                              </button>
                           ))}
                        </div>
                     )}
                  </div>

                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />

                  {isRecording ? (
                    <div className="flex-1 bg-red-50 text-red-600 rounded-full h-12 flex items-center justify-between px-4 font-bold shadow-inner text-sm md:text-base">
                       <div className="flex items-center gap-2 animate-pulse">
                         <div className="w-2 h-2 bg-red-600 rounded-full animate-ping shrink-0"></div>
                         Grabando... {recordingTime}s
                       </div>
                       <button onClick={cancelRecording} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors" title="Cancelar"><X size={20} weight="bold"/></button>
                    </div>
                  ) : (
                    <div className="flex-1 bg-slate-100 rounded-full flex items-center px-4 h-12 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                      <input 
                        type="text" 
                        maxLength={1000}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        onPaste={handlePaste}
                        onFocus={() => setIsTyping(true)}
                        onBlur={() => setIsTyping(false)}
                        placeholder="Escribe un mensaje..." 
                        className="flex-1 bg-transparent border-none outline-none text-slate-700 text-sm md:text-base placeholder-slate-400"
                      />
                      {newMessage.length > 800 && (
                         <span className="text-xs text-slate-400 ml-2 font-medium">{newMessage.length}/1000</span>
                      )}
                    </div>
                  )}

                  {newMessage.trim() ? (
                    <button onClick={() => sendMessage()} className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors shadow-sm shrink-0">
                      <PaperPlaneRight size={20} weight="fill" />
                    </button>
                  ) : isRecording ? (
                    <button 
                       onClick={stopRecording}
                       className="w-10 h-10 md:w-12 md:h-12 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-200 scale-110 shrink-0 cursor-pointer select-none"
                    >
                      <PaperPlaneRight size={20} weight="fill" />
                    </button>
                  ) : (
                    <button 
                       onClick={startRecording}
                       className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer select-none"
                    >
                      <Microphone size={24} weight="bold" />
                    </button>
                  )}
                </div>
              </footer>
              {pendingFile && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl p-6 max-w-sm w-full flex flex-col items-center shadow-2xl animate-in zoom-in-95">
                    <div className="w-32 h-32 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 overflow-hidden border border-slate-100 shadow-sm relative">
                      {pendingFile.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(pendingFile)} alt="preview" className="w-full h-full object-cover" />
                      ) : pendingFile.type.startsWith('video/') ? (
                        <video src={URL.createObjectURL(pendingFile)} className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={48} weight="fill" />
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 text-center mb-1 w-full truncate px-4">{pendingFile.name}</h3>
                    <p className="text-sm text-slate-500 mb-6">{(pendingFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    
                    <div className="flex w-full gap-3">
                      <button onClick={() => setPendingFile(null)} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Cancelar</button>
                      <button onClick={confirmFileSend} className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">Enviar</button>
                    </div>
                  </div>
                </div>
              )}
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

          {customModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 relative flex flex-col items-center text-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">{customModal.title}</h3>
                <p className="text-slate-600 mb-8">{customModal.message}</p>
                <div className="flex w-full gap-3">
                  {customModal.type === 'confirm' && (
                    <button onClick={() => { setCustomModal({ isOpen: false }); customModal.onCancel?.(); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                  )}
                  <button onClick={() => { setCustomModal({ isOpen: false }); customModal.onConfirm?.(); }} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md">Aceptar</button>
                </div>
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
