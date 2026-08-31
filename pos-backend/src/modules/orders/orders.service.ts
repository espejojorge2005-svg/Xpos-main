import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  private async resolveTenantRestaurantId(reqUser?: any, restaurantIdParam?: string | null): Promise<string | null> {
    if (restaurantIdParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantIdParam)) {
      return restaurantIdParam;
    }
    const clsId = this.cls.get('restaurantId');
    if (clsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clsId)) {
      return clsId;
    }
    const userRestId = reqUser?.restaurantId;
    if (userRestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userRestId)) {
      return userRestId;
    }
    const defaultRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
    return defaultRest ? defaultRest.id : null;
  }

  async createOrder(data: CreateOrderDto, reqUser?: any, restaurantIdParam?: string | null) {
    const totalAmount = data.items.reduce((total, item) => {
      const subItemsTotal = item.subItems ? item.subItems.reduce((sTotal: number, sub: any) => sTotal + (sub.quantity * sub.unitPrice), 0) : 0;
      return total + (item.quantity * item.unitPrice) + subItemsTotal;
    }, 0);

    const restaurantId = await this.resolveTenantRestaurantId(reqUser, restaurantIdParam);

    // Validar y encontrar la mesa en la base de datos (por UUID, nombre o número)
    let validTableId: string | null = null;
    let effectiveCustomerName = data.customerName || data.tableName || (data.tableId ? `Mesa ${data.tableId}` : 'Mostrador');

    if (data.tableId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.tableId);
      const parsedNum = parseInt(data.tableId.replace(/\D/g, ''));
      const numStr = !isNaN(parsedNum) ? String(parsedNum) : null;
      
      const dbTable = await this.prisma.table.findFirst({
        where: {
          ...(restaurantId ? { zone: { restaurantId } } : {}),
          OR: [
            ...(isUuid ? [{ id: data.tableId }] : []),
            { number: data.tableId },
            ...(numStr ? [{ number: numStr }] : [])
          ]
        }
      });
      if (dbTable) {
        validTableId = dbTable.id;
      }
    }

    // Usamos una transacción para crear la orden explicitamente con subItems
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tableId: validTableId,
          customerName: effectiveCustomerName,
          totalAmount: totalAmount,
          status: 'OPEN',
          restaurantId: restaurantId,
        }
      });

      for (const item of data.items) {
        const parent = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            notes: item.notes,
            status: 'ACTIVE',
          }
        });

        if ((item as any).subItems && (item as any).subItems.length > 0) {
          await tx.orderItem.createMany({
            data: (item as any).subItems.map((sub: any) => ({
              orderId: order.id,
              parentItemId: parent.id,
              productId: sub.productId,
              quantity: sub.quantity,
              unitPrice: sub.unitPrice,
              subtotal: sub.quantity * sub.unitPrice,
              notes: sub.notes,
              status: 'ACTIVE'
            }))
          });
        }
      }

      if (validTableId) {
        await tx.table.update({
          where: { id: validTableId },
          data: { status: 'OCCUPIED' },
        });
      }

      const createdOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { 
          table: true,
          items: { include: { product: true, subItems: { include: { product: true } } } } 
        }
      });

      return createdOrder;
    });
  }

  async getOpenOrderForTable(tableId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
    const parsedNum = parseInt(tableId.replace(/\D/g, ''));
    const numStr = !isNaN(parsedNum) ? String(parsedNum) : null;

    const order = await this.prisma.order.findFirst({
      where: {
        status: 'OPEN',
        OR: [
          ...(isUuid ? [{ tableId: tableId }] : []),
          { table: { id: tableId } },
          { table: { number: tableId } },
          { customerName: { contains: tableId, mode: 'insensitive' as const } },
          ...(numStr ? [
            { table: { number: numStr } },
            { customerName: { contains: `Mesa ${numStr}`, mode: 'insensitive' as const } },
            { customerName: { contains: `${numStr}`, mode: 'insensitive' as const } }
          ] : [])
        ],
      },
      include: {
        items: {
          include: {
            product: true,
          }
        },
        payments: true,
        table: true,
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    if (!order) {
      throw new NotFoundException(`No open order found for table ${tableId}`);
    }

    return order;
  }

  async addItemsToOrder(orderId: string, data: { items: any[] }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== 'OPEN') {
      throw new BadRequestException(`Order ${orderId} is not open`);
    }

    const newItemsTotal = data.items.reduce((total, item) => {
      const subItemsTotal = item.subItems ? item.subItems.reduce((sTotal: number, sub: any) => sTotal + (sub.quantity * sub.unitPrice), 0) : 0;
      return total + (item.quantity * item.unitPrice) + subItemsTotal;
    }, 0);
    const newTotalAmount = Number(order.totalAmount) + newItemsTotal;

    return this.prisma.$transaction(async (tx) => {
      // 1. Agregar los nuevos items jerárquicos
      for (const item of data.items) {
        const parent = await tx.orderItem.create({
          data: {
            orderId: orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            notes: item.notes,
            status: 'ACTIVE', // Los nuevos ítems nacen activos
          }
        });

        if (item.subItems && item.subItems.length > 0) {
          await tx.orderItem.createMany({
            data: item.subItems.map((sub: any) => ({
              orderId: orderId,
              parentItemId: parent.id,
              productId: sub.productId,
              quantity: sub.quantity,
              unitPrice: sub.unitPrice,
              subtotal: sub.quantity * sub.unitPrice,
              notes: sub.notes,
              status: 'ACTIVE'
            }))
          });
        }
      }

      // 2. Actualizar el total de la orden
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { totalAmount: newTotalAmount },
        include: {
          items: {
            include: {
              product: true,
              subItems: { include: { product: true } }
            }
          },
        },
      });

      return updatedOrder;
    });
  }

  async cancelOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        // Estado 'CANCELLED' para que el KDS lo reconozca y muestre la alerta roja
        data: { status: 'CANCELLED' } 
      });

      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: 'FREE' }
        });
      }

      return updatedOrder;
    });
  }

  async changeTable(orderId: string, newTableId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== 'OPEN') throw new BadRequestException(`Order ${orderId} is not open`);

    const newTable = await this.prisma.table.findUnique({
      where: { id: newTableId }
    });

    if (!newTable) throw new NotFoundException(`Table ${newTableId} not found`);
    if (newTable.status !== 'FREE' && newTable.id !== order.tableId) {
      throw new BadRequestException(`Table ${newTableId} is not free`);
    }

    if (newTable.id === order.tableId) {
      return order; // No change needed
    }

    // Determine old table name
    const oldTableName = order.table ? `MESA ${order.table.number}` : 'MOSTRADOR';

    return this.prisma.$transaction(async (tx) => {
      // 1. Update Order: tableId, previousTableName
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          tableId: newTableId,
          previousTableName: oldTableName
        }
      });

      // 2. Liberate old table if it has no other OPEN orders
      if (order.tableId) {
        const otherOrders = await tx.order.count({
          where: {
            tableId: order.tableId,
            status: 'OPEN',
            id: { not: orderId }
          }
        });
        if (otherOrders === 0) {
          await tx.table.update({
             where: { id: order.tableId },
             data: { status: 'FREE' }
          });
        }
      }

      // 3. Occupy new table
      await tx.table.update({
         where: { id: newTableId },
         data: { status: 'OCCUPIED' }
      });

      return updatedOrder;
    });
  }

  async removeOrderItem(orderId: string, itemId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== 'OPEN') throw new BadRequestException(`Order ${orderId} is not open`);

    const itemToRemove = order.items.find(item => item.id === itemId);
    if (!itemToRemove) throw new NotFoundException(`Item ${itemId} not found in order`);

    return this.prisma.$transaction(async (tx) => {
      
      // CAMBIO CLAVE: En lugar de borrar físicamente, actualizamos su estado a CANCELED
      await tx.orderItem.update({
        where: { id: itemId },
        data: { status: 'CANCELED' }
      });

      // Recalcular el nuevo monto total
      const newTotalAmount = Number(order.totalAmount) - Number(itemToRemove.subtotal);
      
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { totalAmount: newTotalAmount },
        include: { items: { include: { product: true } } }
      });

      // Verificamos cuántos ítems quedan "Activos"
      const activeItems = updatedOrder.items.filter(i => (i as any).status !== 'CANCELED');
      
      // Si el pedido se quedó sin ítems activos, lo cancelamos entero y liberamos la mesa
      if (activeItems.length === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' }
        });
        
        if (order.tableId) {
          await tx.table.update({
            where: { id: order.tableId },
            data: { status: 'FREE' }
          });
        }
      }

      return updatedOrder;
    });
  }

  async updateItemNotes(orderId: string, itemId: string, notes: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== 'OPEN') throw new BadRequestException(`Order ${orderId} is not open`);

    return this.prisma.orderItem.update({
      where: { id: itemId, orderId: orderId },
      data: { notes }
    });
  }

  async markItemAsServed(orderId: string, itemId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== 'OPEN') throw new BadRequestException(`Order ${orderId} is not open`);

    const item = order.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException(`Item ${itemId} not found in order`);

    return this.prisma.orderItem.update({
      where: { id: itemId, orderId: orderId },
      data: { status: 'SERVED' }
    });
  }

  async markItemAsActive(orderId: string, itemId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    return this.prisma.orderItem.update({
      where: { id: itemId, orderId: orderId },
      data: { status: 'ACTIVE' }
    });
  }

  async markOrderAsServed(orderId: string, itemIds?: string[]) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== 'OPEN') throw new BadRequestException(`Order ${orderId} is not open`);

    if (itemIds && itemIds.length > 0) {
      return this.prisma.orderItem.updateMany({
        where: { 
          orderId: orderId,
          id: { in: itemIds },
          status: 'ACTIVE'
        },
        data: { status: 'SERVED' }
      });
    } else {
      return this.prisma.orderItem.updateMany({
        where: { 
          orderId: orderId,
          status: 'ACTIVE'
        },
        data: { status: 'SERVED' }
      });
    }
  }

  // ==========================================
  // OBTENER ÓRDENES PARA LA COCINA (KDS)
  // ==========================================
  async getKitchenOrders(restaurantId?: string | null) {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        OR: [
          { status: 'CANCELLED' },
          {
            status: 'OPEN',
            items: {
              some: { status: 'ACTIVE' }
            }
          }
        ],
        updatedAt: {
          gte: twelveHoursAgo 
        }
      },
      include: {
        table: true,
        items: {
          include: {
            product: {
              include: { category: true, stations: true }
            }
          },
          orderBy: [
            { createdAt: 'asc' },
            { id: 'asc' }
          ]
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // To know if another order intervened, we fetch all order creation times in the last 12 hours
    const allOrderTxs = await this.prisma.order.findMany({
      where: { 
        ...(restaurantId ? { restaurantId } : {}),
        createdAt: { gte: twelveHoursAgo } 
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    const tickets: any[] = [];

    for (const order of orders) {
      if (!order.items || order.items.length === 0) continue;

      const fallbackTableName = order.customerName || order.previousTableName || 'MOSTRADOR';
      const resolvedTable: any = order.table 
        ? { ...order.table, name: (order.table as any).name || `MESA ${order.table.number}` }
        : {
            id: order.id,
            name: fallbackTableName,
            number: parseInt(fallbackTableName.replace(/\D/g, '')) || 1,
            capacity: 4,
            status: 'OCCUPIED',
            posX: 0,
            posY: 0,
            zoneId: ''
          };

      let currentTicketItems: any[] = [];
      let currentTicketCreatedAt = order.createdAt;
      let ticketIndex = 0;

      for (const item of order.items) {
        
        // Is there any order that was created between this ticket's start time and this item's creation time?
        const intervened = allOrderTxs.some(other => 
           other.id !== order.id && 
           other.createdAt.getTime() > currentTicketCreatedAt.getTime() && 
           other.createdAt.getTime() < item.createdAt.getTime()
        );

        if (intervened && currentTicketItems.length > 0) {
           tickets.push({
             ...order,
             id: ticketIndex === 0 ? order.id : `${order.id}-adic-${ticketIndex}`,
             table: ticketIndex === 0 ? resolvedTable : { ...resolvedTable, name: `${resolvedTable.name} - ADICIONAL` },
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
             table: ticketIndex === 0 ? resolvedTable : { ...resolvedTable, name: `${resolvedTable.name} - ADICIONAL` },
             createdAt: currentTicketCreatedAt,
             items: currentTicketItems
         });
      }
    }

    // Sort by chronological effective createdAt of the ticket
    tickets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Calculate finished orders for today
    const finishedOrdersCount = await this.prisma.order.count({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        createdAt: { gte: twelveHoursAgo },
        status: { not: 'CANCELLED' },
        items: {
          some: {}, // Has at least one item
          every: { status: { in: ['SERVED', 'CANCELED'] } }
        }
      }
    });

    return {
      orders: tickets,
      finishedCount: finishedOrdersCount
    };
  }
}