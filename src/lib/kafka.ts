/**
 * Servicio Simulado de Kafka
 * En producción usarías 'kafkajs'
 * Se encarga del event sourcing (Ej. almacenar un registro inmutable de todos los eventos del chat para analítica/auditoría)
 */
export class KafkaService {
  static produce(topic: string, message: any) {
    console.log(`[Kafka Producer] Mensaje enviado al topic '${topic}':`, message);
    // Simular escritura en log distribuido
  }

  static consume(topic: string, callback: (message: any) => void) {
    console.log(`[Kafka Consumer] Suscrito al topic '${topic}'`);
    // Simular recepción de eventos históricos o analytics
  }
}
