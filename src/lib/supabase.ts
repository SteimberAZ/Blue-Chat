import { createClient } from '@/utils/supabase/client';

export const supabase = createClient();

// ==========================================
// Mocks para simular la base de datos de Empleados y Equipos
// ==========================================
export const mockUsers = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    first_name: 'Julio',
    last_name: 'Herrera',
    role: 'Administrador'
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    first_name: 'Ana',
    last_name: 'García',
    role: 'Empleado'
  }
];

export const mockTeams = [
  { id: '33333333-3333-3333-3333-333333333333', name: 'Equipo de Desarrollo', unread: 2 },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Equipo de Soporte', unread: 0 },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Ventas', unread: 5 }
];

export const mockMessages = [
  { id: 'm1', team_id: '33333333-3333-3333-3333-333333333333', senderId: '22222222-2222-2222-2222-222222222222', senderName: 'Ana García', content: '¿Alguien revisó el último PR?', timestamp: '10:30 AM' },
  { id: 'm2', team_id: '33333333-3333-3333-3333-333333333333', senderId: '11111111-1111-1111-1111-111111111111', senderName: 'Julio Herrera', content: 'Sí, lo acabo de aprobar. Buen trabajo.', timestamp: '10:35 AM' },
  { id: 'm3', team_id: '33333333-3333-3333-3333-333333333333', senderId: '22222222-2222-2222-2222-222222222222', senderName: 'Ana García', content: '¡Genial! Despliego a staging entonces.', timestamp: '10:36 AM' }
];
