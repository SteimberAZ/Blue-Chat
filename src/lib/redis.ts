/**
 * Servicio Simulado de Redis
 * En producción usarías 'redis' o 'ioredis'
 * Se encarga de la caché en memoria (Ej. almacenar el estado en línea de los usuarios, sesiones, mensajes recientes)
 */
class RedisClient {
  private cache = new Map<string, any>();

  async set(key: string, value: any, ttlSeconds?: number) {
    console.log(`[Redis] SET ${key}`);
    this.cache.set(key, value);
    if (ttlSeconds) {
      setTimeout(() => this.cache.delete(key), ttlSeconds * 1000);
    }
  }

  async get(key: string) {
    console.log(`[Redis] GET ${key}`);
    return this.cache.get(key) || null;
  }

  async publish(channel: string, message: string) {
    console.log(`[Redis PubSub] Publicado en '${channel}': ${message}`);
  }
}

export const redis = new RedisClient();
