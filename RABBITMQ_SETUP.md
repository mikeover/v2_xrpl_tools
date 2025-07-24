# RabbitMQ Setup Instructions

## Quick Start with Docker

To enable RabbitMQ queue functionality, you can start RabbitMQ using Docker:

```bash
# Start RabbitMQ with management interface
docker run -d \
  --name xrpl-rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=rabbitmq \
  -e RABBITMQ_DEFAULT_PASS=rabbitmq \
  rabbitmq:3-management-alpine

# Or use the docker-compose setup
docker-compose up rabbitmq -d
```

## Access RabbitMQ Management Interface

Once RabbitMQ is running, you can access the management interface at:
- URL: http://localhost:15672
- Username: `rabbitmq`
- Password: `rabbitmq`

## Application Behavior

- **With RabbitMQ**: Full event-driven functionality with message queues
- **Without RabbitMQ**: Application runs in degraded mode - events are logged but not queued

## Queue Structure

The application creates these exchanges and queues:
- **Exchanges**: `xrpl.events`, `notifications`, `dead-letter`
- **Queues**: `ledger.events`, `transaction.events`, `nft.events`, `notifications`, `dead-letter`

## Environment Configuration

Set the RabbitMQ connection URL in your `.env` file:
```env
QUEUE_URL=amqp://rabbitmq:rabbitmq@localhost:5672
```