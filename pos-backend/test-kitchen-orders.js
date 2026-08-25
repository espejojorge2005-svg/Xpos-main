const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: 'CANCELLED' },
        {
          status: 'OPEN',
          items: {
            some: { status: 'ACTIVE' }
          }
        }
      ],
      updatedAt: { gte: twelveHoursAgo }
    },
    include: {
      table: true,
      items: {
        include: { product: true },
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const allOrderTxs = await prisma.order.findMany({
    where: { createdAt: { gte: twelveHoursAgo } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });

  console.log("All Order Txs:", allOrderTxs.map(o => ({ id: o.id, time: o.createdAt })));

  const tickets = [];

  for (const order of orders) {
    if (!order.items || order.items.length === 0) continue;

    let currentTicketItems = [];
    let currentTicketCreatedAt = order.createdAt;
    let ticketIndex = 0;

    for (const item of order.items) {
      const intervened = allOrderTxs.some(other => 
          other.id !== order.id && 
          other.createdAt.getTime() > currentTicketCreatedAt.getTime() && 
          other.createdAt.getTime() < item.createdAt.getTime()
      );

      console.log(`Checking item ${item.product?.name} at ${item.createdAt}. Intervened? ${intervened}`);

      if (intervened && currentTicketItems.length > 0) {
          tickets.push({
            ...order,
            id: ticketIndex === 0 ? order.id : `${order.id}-adic-${ticketIndex}`,
            table: ticketIndex === 0 ? order.table : { ...order.table, name: `${order.table?.name || ('MESA ' + order.table?.number)} - ADICIONAL` },
            createdAt: currentTicketCreatedAt,
            items: currentTicketItems
          });
          
          ticketIndex++;
          currentTicketItems = [item];
          currentTicketCreatedAt = item.createdAt;
      } else {
          currentTicketItems.push(item);
      }
    }

    if (currentTicketItems.length > 0) {
        tickets.push({
            ...order,
            id: ticketIndex === 0 ? order.id : `${order.id}-adic-${ticketIndex}`,
            table: ticketIndex === 0 ? order.table : { ...order.table, name: `${order.table?.name || ('MESA ' + order.table?.number)} - ADICIONAL` },
            createdAt: currentTicketCreatedAt,
            items: currentTicketItems
        });
    }
  }

  console.log("Total tickets generated:", tickets.length);
  for (const t of tickets) {
    console.log(`Ticket: ${t.table?.name || 'MESA ' + t.table?.number} - id: ${t.id} - items: ${t.items.map(i=>i.product?.name).join(', ')}`);
  }

  prisma.$disconnect();
}

test();

